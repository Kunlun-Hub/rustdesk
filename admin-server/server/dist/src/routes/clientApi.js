import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { auditLog, sanitizeAuditMetadata } from '../services/audit.js';
import { resolveDevicePolicy } from '../services/policies.js';
import { hashClientToken } from '../auth/clientToken.js';
import { decryptAddressBookSecret } from '../services/secrets.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.RECORDING_UPLOAD_MAX_MB * 1024 * 1024 } });
const MAX_POLICY_RECEIPT_STRATEGIES = 50;
const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000;
function extractClientToken(req) {
    const authorization = req.header('authorization') ?? '';
    if (authorization.toLowerCase().startsWith('bearer ')) {
        return authorization.slice(7).trim();
    }
    const headerToken = req.header('x-rustdesk-token') ?? req.header('x-client-token');
    if (headerToken)
        return headerToken;
    const queryToken = typeof req.query.access_token === 'string'
        ? req.query.access_token
        : typeof req.query.token === 'string'
            ? req.query.token
            : undefined;
    if (queryToken)
        return queryToken;
    const body = req.body;
    const bodyToken = body?.access_token ?? body?.token;
    return typeof bodyToken === 'string' ? bodyToken : undefined;
}
router.use((req, res, next) => {
    const token = extractClientToken(req);
    if (!config.CLIENT_API_TOKEN && !token) {
        req.clientAuth = { kind: 'open' };
        next();
        return;
    }
    if (config.CLIENT_API_TOKEN && token === config.CLIENT_API_TOKEN) {
        req.clientAuth = { kind: 'global' };
        next();
        return;
    }
    if (!token) {
        res.status(401).json({ error: 'Missing client API token' });
        return;
    }
    const tokenHash = hashClientToken(token);
    prisma.device.findUnique({ where: { clientTokenHash: tokenHash }, select: { id: true, rustdeskId: true, status: true } })
        .then(async (device) => {
        if (!device) {
            res.status(401).json({ error: 'Invalid client API token' });
            return;
        }
        if (device.status === 'DISABLED') {
            res.status(403).json({ error: 'Device is disabled', disabled: true });
            return;
        }
        req.clientAuth = { kind: 'device', deviceId: device.id, rustdeskId: device.rustdeskId };
        await prisma.device.update({ where: { id: device.id }, data: { lastClientAuthAt: new Date() } });
        next();
    })
        .catch(next);
});
const recordingMetaSchema = z.object({
    id: z.string().optional(),
    rustdesk_id: z.union([z.string(), z.number()]).optional(),
    deviceId: z.union([z.string(), z.number()]).optional(),
    filename: z.string().min(1).optional(),
    sizeBytes: z.union([z.string(), z.number(), z.bigint()]).optional(),
    startedAt: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
}).passthrough();
const recordingStatusSchema = z.object({
    status: z.enum(['UPLOADING', 'COMPLETED', 'FAILED']),
    sizeBytes: z.union([z.string(), z.number(), z.bigint()]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
});
const recordingChunkSchema = z.object({
    offset: z.union([z.string(), z.number(), z.bigint()]).optional(),
    totalSize: z.union([z.string(), z.number(), z.bigint()]).optional(),
    final: z.preprocess((value) => value === true || value === 'true' || value === '1', z.boolean()).default(false),
    metadata: z.string().optional()
}).passthrough();
const connectionSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    rustdesk_id: z.union([z.string(), z.number()]).optional(),
    deviceId: z.union([z.string(), z.number()]).optional(),
    connectionId: z.union([z.string(), z.number()]).optional(),
    connection_id: z.union([z.string(), z.number()]).optional(),
    connId: z.union([z.string(), z.number()]).optional(),
    peer: z.union([z.string(), z.number()]).optional(),
    peer_id: z.union([z.string(), z.number()]).optional(),
    peerRustdeskId: z.union([z.string(), z.number()]).optional(),
    direction: z.string().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
}).passthrough();
const policyAckSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    rustdesk_id: z.union([z.string(), z.number()]).optional(),
    deviceId: z.union([z.string(), z.number()]).optional(),
    strategyId: z.string().optional(),
    strategyIds: z.array(z.string()).max(MAX_POLICY_RECEIPT_STRATEGIES).optional(),
    modifiedAt: z.union([z.string(), z.number()]).optional(),
    hash: z.string().optional(),
    status: z.enum(['PENDING', 'APPLIED', 'FAILED']).default('APPLIED'),
    message: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
}).passthrough();
const addressBookQuerySchema = z.object({
    userId: z.string().optional(),
    username: z.string().optional(),
    email: z.string().email().optional()
});
const clientDeviceSchema = z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    uuid: z.string().optional(),
    hostname: z.string().optional(),
    username: z.string().optional(),
    platform: z.string().optional(),
    os: z.string().optional(),
    version: z.string().optional()
}).passthrough();
function assertClientDeviceAccess(req, rustdeskId) {
    if (req.clientAuth?.kind === 'device' && req.clientAuth.rustdeskId !== rustdeskId) {
        const error = new Error('Client token does not match requested device');
        error.name = 'ClientDeviceTokenMismatch';
        throw error;
    }
}
function assertClientRecordAccess(req, deviceId) {
    if (req.clientAuth?.kind === 'device' && deviceId !== req.clientAuth.deviceId) {
        const error = new Error('Client token does not match requested record');
        error.name = 'ClientDeviceTokenMismatch';
        throw error;
    }
}
async function upsertClientDevice(req, body, ipAddress) {
    const parsed = clientDeviceSchema.safeParse(body);
    if (!parsed.success) {
        return null;
    }
    assertClientDeviceAccess(req, parsed.data.id);
    const existing = await prisma.device.findUnique({
        where: { rustdeskId: parsed.data.id },
        select: { id: true, status: true }
    });
    const inventoryFields = {
        uuid: parsed.data.uuid,
        hostname: parsed.data.hostname,
        username: parsed.data.username,
        platform: parsed.data.platform,
        os: parsed.data.os,
        version: parsed.data.version,
        ipAddress,
        lastSeenAt: new Date()
    };
    if (existing?.status === 'DISABLED') {
        return prisma.device.update({
            where: { id: existing.id },
            data: inventoryFields
        });
    }
    return prisma.device.upsert({
        where: { rustdeskId: parsed.data.id },
        update: {
            ...inventoryFields,
            online: true,
            status: 'ONLINE'
        },
        create: {
            rustdeskId: parsed.data.id,
            ...inventoryFields,
            online: true,
            status: 'ONLINE'
        }
    });
}
function isDisabledDevice(device) {
    return device.status === 'DISABLED';
}
function recordingSize(value, fallback = 0n) {
    if (typeof value === 'bigint')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return BigInt(Math.max(0, Math.trunc(value)));
    if (typeof value === 'string' && /^\d+$/.test(value))
        return BigInt(value);
    return fallback;
}
function optionalRecordingSize(value) {
    if (value === undefined)
        return undefined;
    return recordingSize(value);
}
function recordingSafeName(filename) {
    return `${Date.now()}-${nanoid(8)}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}
function serializeClientRecording(recording) {
    return {
        id: recording.id,
        deviceId: recording.deviceId,
        filename: recording.filename,
        sizeBytes: recording.sizeBytes.toString(),
        status: recording.status,
        startedAt: recording.startedAt,
        completedAt: recording.completedAt,
        metadata: recording.metadata
    };
}
function validateClientRecordingStatusTransition(current, requested) {
    if (current !== 'UPLOADING') {
        return {
            ok: false,
            error: 'Recording is already terminal and cannot be updated by the client',
            currentStatus: current,
            requestedStatus: requested
        };
    }
    if (requested === 'REMOVED') {
        return {
            ok: false,
            error: 'Client cannot remove recordings',
            currentStatus: current,
            requestedStatus: requested
        };
    }
    return { ok: true };
}
function jsonValue(value) {
    return sanitizeAuditMetadata(value);
}
function jsonObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function optionalInt(value) {
    if (typeof value === 'number' && Number.isInteger(value))
        return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value))
        return Number(value);
    return undefined;
}
function optionalDate(value) {
    return value ? new Date(value) : undefined;
}
function isFutureDate(value, now = new Date()) {
    return value.getTime() > now.getTime() + MAX_CLIENT_CLOCK_SKEW_MS;
}
function connectionTimelineError(data, now = new Date()) {
    const startedAt = optionalDate(data.startedAt);
    const endedAt = optionalDate(data.endedAt);
    if (startedAt && isFutureDate(startedAt, now))
        return 'Connection startedAt cannot be in the future';
    if (endedAt && isFutureDate(endedAt, now))
        return 'Connection endedAt cannot be in the future';
    if (startedAt && endedAt && endedAt < startedAt)
        return 'Connection endedAt cannot be before startedAt';
    return null;
}
function uniqueStrategyIds(strategyIds) {
    const ids = [...new Set(strategyIds.filter((strategyId) => Boolean(strategyId)))];
    return ids.length > 0 ? ids : [undefined];
}
async function findDeviceForRecording(req, input) {
    const rustdeskId = String(input.id ?? input.rustdesk_id ?? input.deviceId ?? '');
    if (!rustdeskId || rustdeskId === 'unknown')
        return null;
    assertClientDeviceAccess(req, rustdeskId);
    return prisma.device.findUnique({ where: { rustdeskId } });
}
async function findDeviceForClient(req, input) {
    const rustdeskId = String(input.id ?? input.rustdesk_id ?? input.deviceId ?? '');
    if (!rustdeskId || rustdeskId === 'unknown')
        return null;
    assertClientDeviceAccess(req, rustdeskId);
    return prisma.device.findUnique({ where: { rustdeskId } });
}
async function validatePolicyReceiptStrategies(device, strategyIds) {
    const explicitIds = [...new Set(strategyIds.filter((strategyId) => Boolean(strategyId)))];
    if (explicitIds.length === 0)
        return null;
    const strategies = await prisma.strategy.findMany({
        where: { id: { in: explicitIds } },
        select: {
            id: true,
            assignments: {
                where: {
                    OR: [
                        { deviceId: device.id },
                        ...(device.groupId ? [{ groupId: device.groupId }] : [])
                    ]
                },
                select: { id: true }
            }
        }
    });
    const foundIds = new Set(strategies.map((strategy) => strategy.id));
    const missingIds = explicitIds.filter((strategyId) => !foundIds.has(strategyId));
    if (missingIds.length > 0) {
        return { status: 404, error: 'Policy not found', strategyIds: missingIds };
    }
    const unassignedIds = strategies.filter((strategy) => strategy.assignments.length === 0).map((strategy) => strategy.id);
    if (unassignedIds.length > 0) {
        return { status: 409, error: 'Policy is not assigned to this device', strategyIds: unassignedIds };
    }
    return null;
}
async function findAddressBookUser(input) {
    if (input.userId)
        return prisma.user.findUnique({ where: { id: input.userId } });
    if (input.username)
        return prisma.user.findUnique({ where: { username: input.username } });
    if (input.email)
        return prisma.user.findUnique({ where: { email: input.email } });
    return null;
}
function requestedAddressBookUser(input) {
    return Boolean(input.userId || input.username || input.email);
}
async function requireAddressBookIdentityAuth(req, res, input) {
    if (!requestedAddressBookUser(input))
        return true;
    if (req.clientAuth?.kind === 'global')
        return true;
    const reason = req.clientAuth?.kind === 'device'
        ? 'device_token_cannot_request_user'
        : 'identity_requires_client_auth';
    await auditLog({
        action: 'ADDRESS_BOOK_SYNC',
        resource: 'addressBook',
        metadata: {
            rejected: true,
            reason,
            requestedUser: input,
            clientAuthKind: req.clientAuth?.kind ?? 'unknown',
            deviceId: req.clientAuth?.kind === 'device' ? req.clientAuth.deviceId : undefined,
            rustdeskId: req.clientAuth?.kind === 'device' ? req.clientAuth.rustdeskId : undefined
        },
        req
    });
    res.status(req.clientAuth?.kind === 'device' ? 403 : 401).json({
        error: req.clientAuth?.kind === 'device'
            ? 'Device client token cannot request user-scoped address books'
            : 'Client token is required for user-scoped address book sync'
    });
    return false;
}
function addressBookVisibility(userId) {
    return {
        OR: [
            { shareRule: 'public' },
            ...(userId
                ? [
                    { shareRule: { in: ['read', 'write'] } },
                    { ownerId: userId },
                    { shares: { some: { userId } } }
                ]
                : [])
        ]
    };
}
function serializeClientAddressBookPeer(peer) {
    return {
        ...peer,
        password: decryptAddressBookSecret(peer.password)
    };
}
function serializeClientAddressBook(book) {
    return {
        ...book,
        peers: book.peers?.map(serializeClientAddressBookPeer) ?? []
    };
}
function addressBookSyncSummary(books, user) {
    return {
        user: user ? { id: user.id, username: user.username, email: user.email } : null,
        requestedBy: user ? 'user' : 'anonymous',
        books: books.map((book) => ({
            id: book.id,
            guid: book.guid,
            name: book.name,
            ownerId: book.ownerId,
            shareRule: book.shareRule,
            peerCount: book.peers?.length ?? 0,
            tagCount: book.tags?.length ?? 0
        })),
        bookCount: books.length,
        peerCount: books.reduce((count, book) => count + (book.peers?.length ?? 0), 0),
        tagCount: books.reduce((count, book) => count + (book.tags?.length ?? 0), 0)
    };
}
function connectionFields(data) {
    return {
        connectionId: optionalInt(data.connectionId ?? data.connection_id ?? data.connId),
        peerRustdeskId: data.peerRustdeskId !== undefined
            ? String(data.peerRustdeskId)
            : data.peer !== undefined
                ? String(data.peer)
                : data.peer_id !== undefined
                    ? String(data.peer_id)
                    : undefined,
        direction: data.direction
    };
}
function connectionMetadata(existing, event, data, extra = {}) {
    const base = jsonObject(existing);
    const payload = jsonValue(data.metadata ?? data);
    const events = Array.isArray(base.connectionEvents) ? base.connectionEvents.slice(-49) : [];
    const eventEntry = jsonValue({
        type: event,
        at: new Date().toISOString(),
        payload,
        ...extra
    });
    return jsonValue({
        ...base,
        ...(event === 'start' && base.connectionStart === undefined ? { connectionStart: payload } : {}),
        ...(event === 'refresh' ? { lastRefresh: payload } : {}),
        ...(event === 'end' ? { connectionEnd: payload } : {}),
        ...extra,
        connectionEvents: [...events, eventEntry]
    });
}
function hasConnectionIdentity(fields) {
    return fields.connectionId !== undefined || Boolean(fields.peerRustdeskId);
}
function openConnectionWhere(deviceId, fields) {
    return {
        deviceId,
        endedAt: null,
        ...(fields.connectionId !== undefined
            ? { connectionId: fields.connectionId }
            : {
                ...(fields.peerRustdeskId ? { peerRustdeskId: fields.peerRustdeskId } : {}),
                ...(fields.direction ? { direction: fields.direction } : {})
            })
    };
}
async function findOpenConnections(deviceId, fields) {
    if (!hasConnectionIdentity(fields))
        return [];
    return prisma.connectionRecord.findMany({
        where: {
            ...openConnectionWhere(deviceId, fields)
        },
        orderBy: { startedAt: 'desc' }
    });
}
async function closeDuplicateOpenConnections(openConnections, canonicalId, endedAt = new Date()) {
    const duplicates = openConnections.filter((connection) => connection.id !== canonicalId);
    await Promise.all(duplicates.map((connection) => prisma.connectionRecord.update({
        where: { id: connection.id },
        data: {
            endedAt,
            metadata: jsonValue({
                ...(connection.metadata && typeof connection.metadata === 'object' && !Array.isArray(connection.metadata) ? connection.metadata : {}),
                duplicateClosed: true,
                mergedInto: canonicalId
            })
        }
    })));
    return duplicates.length;
}
async function createOrRefreshConnection(deviceId, data) {
    const fields = connectionFields(data);
    if (!hasConnectionIdentity(fields)) {
        throw new Error('Connection identity requires connectionId or peerRustdeskId');
    }
    const openConnections = await findOpenConnections(deviceId, fields);
    const open = openConnections[0];
    if (open) {
        await closeDuplicateOpenConnections(openConnections, open.id);
        return prisma.connectionRecord.update({
            where: { id: open.id },
            data: {
                peerRustdeskId: fields.peerRustdeskId ?? open.peerRustdeskId,
                direction: fields.direction ?? open.direction,
                metadata: connectionMetadata(open.metadata, 'refresh', data)
            }
        });
    }
    return prisma.connectionRecord.create({
        data: {
            deviceId,
            connectionId: fields.connectionId,
            peerRustdeskId: fields.peerRustdeskId,
            direction: fields.direction,
            startedAt: optionalDate(data.startedAt) ?? new Date(),
            metadata: connectionMetadata(undefined, 'start', data)
        }
    });
}
async function saveRecordingFile(recordingId, file, body) {
    const existing = await prisma.recording.findUnique({ where: { id: recordingId }, select: { status: true } });
    if (!existing) {
        return { status: 404, error: 'Recording upload not found' };
    }
    if (existing.status !== 'UPLOADING') {
        return { status: 409, error: 'Recording is not accepting uploads', statusValue: existing.status };
    }
    const safeName = recordingSafeName(file.originalname);
    await fs.mkdir(config.RECORDING_DIR, { recursive: true });
    const targetPath = path.resolve(config.RECORDING_DIR, safeName);
    await fs.writeFile(targetPath, file.buffer);
    const recording = await prisma.recording.update({
        where: { id: recordingId },
        data: {
            filename: file.originalname,
            path: targetPath,
            sizeBytes: BigInt(file.size),
            status: 'COMPLETED',
            completedAt: new Date(),
            metadata: jsonValue({ body })
        }
    });
    return { recording };
}
async function saveRecordingChunk(recordingId, file, body) {
    const parsed = recordingChunkSchema.safeParse(body);
    if (!parsed.success) {
        return { error: parsed.error.flatten() };
    }
    const existing = await prisma.recording.findUnique({
        where: { id: recordingId },
        include: { device: true }
    });
    if (!existing) {
        return { status: 404, error: 'Recording upload not found' };
    }
    if (existing.device && isDisabledDevice(existing.device)) {
        return { status: 403, error: 'Device is disabled' };
    }
    if (existing.status !== 'UPLOADING') {
        return { status: 409, error: 'Recording is not accepting chunks', statusValue: existing.status };
    }
    const expectedOffset = existing.sizeBytes;
    const offset = recordingSize(parsed.data.offset, expectedOffset);
    if (offset !== expectedOffset) {
        return {
            status: 409,
            error: 'Recording chunk offset mismatch',
            expectedOffset: expectedOffset.toString(),
            receivedOffset: offset.toString()
        };
    }
    const nextSize = expectedOffset + BigInt(file.size);
    const totalSize = optionalRecordingSize(parsed.data.totalSize);
    if (totalSize !== undefined && nextSize > totalSize) {
        return {
            status: 413,
            error: 'Recording chunk exceeds declared total size',
            expectedOffset: expectedOffset.toString(),
            nextOffset: nextSize.toString(),
            totalSize: totalSize.toString()
        };
    }
    if (totalSize !== undefined && parsed.data.final && nextSize < totalSize) {
        return {
            status: 409,
            error: 'Recording final chunk is smaller than declared total size',
            expectedOffset: expectedOffset.toString(),
            nextOffset: nextSize.toString(),
            totalSize: totalSize.toString()
        };
    }
    const complete = parsed.data.final || (totalSize !== undefined && nextSize === totalSize);
    let clientMetadata;
    if (parsed.data.metadata) {
        try {
            clientMetadata = JSON.parse(parsed.data.metadata);
        }
        catch {
            return { status: 400, error: 'metadata must be valid JSON' };
        }
    }
    await fs.mkdir(config.RECORDING_DIR, { recursive: true });
    const targetPath = existing.path || path.resolve(config.RECORDING_DIR, recordingSafeName(existing.filename || file.originalname));
    if (offset === 0n) {
        await fs.writeFile(targetPath, file.buffer);
    }
    else {
        await fs.appendFile(targetPath, file.buffer);
    }
    let metadata = jsonValue({
        ...(existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {}),
        chunkUpload: {
            lastOffset: offset.toString(),
            lastChunkBytes: file.size,
            uploadedBytes: nextSize.toString(),
            totalSize: totalSize?.toString(),
            final: complete
        }
    });
    if (clientMetadata !== undefined) {
        metadata = jsonValue({ ...metadata, clientMetadata });
    }
    const recording = await prisma.recording.update({
        where: { id: recordingId },
        data: {
            path: targetPath,
            sizeBytes: nextSize,
            status: complete ? 'COMPLETED' : 'UPLOADING',
            completedAt: complete ? new Date() : undefined,
            metadata
        }
    });
    return { recording, complete, nextOffset: nextSize.toString() };
}
router.post('/sysinfo', async (req, res) => {
    const device = await upsertClientDevice(req, req.body, req.ip);
    if (!device) {
        res.status(400).json({ error: 'Invalid sysinfo payload' });
        return;
    }
    if (isDisabledDevice(device)) {
        await auditLog({ action: 'SYSINFO', resource: 'device', resourceId: device.id, metadata: { ignored: true, reason: 'device_disabled' }, req });
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    const updated = await prisma.device.update({
        where: { id: device.id },
        data: { sysinfo: jsonValue(req.body), sysinfoVersion: { increment: 1 } }
    });
    await auditLog({ action: 'SYSINFO', resource: 'device', resourceId: device.id, metadata: req.body, req });
    res.json({ ok: true, id: updated.rustdeskId, version: updated.sysinfoVersion });
});
router.post('/sysinfo_ver', async (req, res) => {
    const rustdeskId = String(req.body.id ?? req.body.rustdesk_id ?? '');
    if (rustdeskId)
        assertClientDeviceAccess(req, rustdeskId);
    const device = rustdeskId ? await prisma.device.findUnique({ where: { rustdeskId } }) : null;
    res.json({ version: device?.sysinfoVersion ?? 0 });
});
router.post('/heartbeat', async (req, res) => {
    const device = await upsertClientDevice(req, req.body, req.ip);
    if (!device) {
        res.status(400).json({ error: 'Invalid heartbeat payload' });
        return;
    }
    if (isDisabledDevice(device)) {
        await auditLog({ action: 'HEARTBEAT', resource: 'device', resourceId: device.id, metadata: { ignored: true, reason: 'device_disabled' }, req });
        res.status(403).json({ error: 'Device is disabled', disabled: true });
        return;
    }
    await prisma.deviceHeartbeat.create({
        data: {
            deviceId: device.id,
            conns: req.body.conns,
            payload: req.body
        }
    });
    const conns = Array.isArray(req.body.conns) ? (req.body.conns) : [];
    const identifiableConns = conns.filter((conn) => {
        const data = conn;
        return hasConnectionIdentity(connectionFields(data)) && !connectionTimelineError(data);
    });
    await Promise.all(identifiableConns.map((conn) => createOrRefreshConnection(device.id, conn)));
    await auditLog({
        action: 'HEARTBEAT',
        resource: 'device',
        resourceId: device.id,
        metadata: { connections: identifiableConns.length, ignoredConnections: conns.length - identifiableConns.length },
        req
    });
    const policy = await resolveDevicePolicy(device.rustdeskId);
    res.json({ ok: true, policy: { modifiedAt: policy.modifiedAt, hash: policy.hash } });
});
router.post(['/connection/start', '/connections/start'], async (req, res) => {
    const parsed = connectionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const device = await findDeviceForClient(req, parsed.data);
    if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
    }
    if (isDisabledDevice(device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    const fields = connectionFields(parsed.data);
    if (!hasConnectionIdentity(fields)) {
        res.status(400).json({ error: 'Connection identity requires connectionId or peerRustdeskId' });
        return;
    }
    const timelineError = connectionTimelineError(parsed.data);
    if (timelineError) {
        res.status(400).json({ error: timelineError });
        return;
    }
    const connection = await createOrRefreshConnection(device.id, parsed.data);
    await auditLog({ action: 'CREATE', resource: 'connection', resourceId: connection.id, metadata: parsed.data, req });
    res.json({ ok: true, id: connection.id, startedAt: connection.startedAt, endedAt: connection.endedAt });
});
router.post(['/connection/end', '/connections/end', '/disconnect'], async (req, res) => {
    const parsed = connectionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const device = await findDeviceForClient(req, parsed.data);
    if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
    }
    if (isDisabledDevice(device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    const fields = connectionFields(parsed.data);
    if (!hasConnectionIdentity(fields)) {
        res.status(400).json({ error: 'Connection identity requires connectionId or peerRustdeskId' });
        return;
    }
    const timelineError = connectionTimelineError(parsed.data);
    if (timelineError) {
        res.status(400).json({ error: timelineError });
        return;
    }
    const openConnections = await findOpenConnections(device.id, fields);
    const open = openConnections[0];
    const startedAt = optionalDate(parsed.data.startedAt) ?? new Date();
    const endedAt = optionalDate(parsed.data.endedAt) ?? new Date();
    if (!open) {
        const connection = await prisma.connectionRecord.create({
            data: {
                deviceId: device.id,
                connectionId: fields.connectionId,
                peerRustdeskId: fields.peerRustdeskId,
                direction: fields.direction,
                startedAt,
                endedAt,
                metadata: connectionMetadata(undefined, 'end', parsed.data, { inferred: true })
            }
        });
        await auditLog({ action: 'DISCONNECT', resource: 'connection', resourceId: connection.id, metadata: parsed.data, req });
        res.json({ ok: true, id: connection.id, endedAt: connection.endedAt, inferred: true });
        return;
    }
    if (endedAt < open.startedAt) {
        res.status(400).json({ error: 'Connection endedAt cannot be before startedAt' });
        return;
    }
    const duplicateClosed = await closeDuplicateOpenConnections(openConnections, open.id, endedAt);
    const connection = await prisma.connectionRecord.update({
        where: { id: open.id },
        data: {
            endedAt,
            peerRustdeskId: fields.peerRustdeskId ?? open.peerRustdeskId,
            direction: fields.direction ?? open.direction,
            metadata: connectionMetadata(open.metadata, 'end', parsed.data, { duplicateClosed })
        }
    });
    await auditLog({ action: 'DISCONNECT', resource: 'connection', resourceId: connection.id, metadata: { ...parsed.data, duplicateClosed }, req });
    res.json({ ok: true, id: connection.id, endedAt: connection.endedAt, duplicateClosed });
});
router.post(['/connection/:connectionRecordId/end', '/connections/:connectionRecordId/end'], async (req, res) => {
    const parsed = connectionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const existing = await prisma.connectionRecord.findUnique({ where: { id: req.params.connectionRecordId } });
    if (!existing) {
        res.status(404).json({ error: 'Connection record not found' });
        return;
    }
    assertClientRecordAccess(req, existing.deviceId);
    if (existing.endedAt) {
        res.status(409).json({ error: 'Connection record is already ended' });
        return;
    }
    const endedAt = optionalDate(parsed.data.endedAt) ?? new Date();
    if (isFutureDate(endedAt)) {
        res.status(400).json({ error: 'Connection endedAt cannot be in the future' });
        return;
    }
    if (endedAt < existing.startedAt) {
        res.status(400).json({ error: 'Connection endedAt cannot be before startedAt' });
        return;
    }
    const connection = await prisma.connectionRecord.update({
        where: { id: req.params.connectionRecordId },
        data: {
            endedAt,
            metadata: connectionMetadata(existing.metadata, 'end', parsed.data)
        }
    });
    await auditLog({ action: 'DISCONNECT', resource: 'connection', resourceId: connection.id, metadata: parsed.data, req });
    res.json({ ok: true, id: connection.id, endedAt: connection.endedAt });
});
router.get('/policy/:rustdeskId', async (req, res) => {
    assertClientDeviceAccess(req, req.params.rustdeskId);
    const policy = await resolveDevicePolicy(req.params.rustdeskId);
    if (!policy.device) {
        res.status(404).json({ error: 'Device not found' });
        return;
    }
    if (isDisabledDevice(policy.device)) {
        res.status(403).json({ error: 'Device is disabled', disabled: true });
        return;
    }
    res.json({
        id: policy.device.rustdeskId,
        modifiedAt: policy.modifiedAt,
        hash: policy.hash,
        policies: policy.policies,
        configOptions: policy.config
    });
});
router.post('/policy', async (req, res) => {
    const rustdeskId = String(req.body.id ?? req.body.rustdesk_id ?? '');
    if (!rustdeskId) {
        res.status(400).json({ error: 'Missing device id' });
        return;
    }
    assertClientDeviceAccess(req, rustdeskId);
    const policy = await resolveDevicePolicy(rustdeskId);
    if (!policy.device) {
        res.status(404).json({ error: 'Device not found' });
        return;
    }
    if (isDisabledDevice(policy.device)) {
        res.status(403).json({ error: 'Device is disabled', disabled: true });
        return;
    }
    res.json({
        id: policy.device.rustdeskId,
        modifiedAt: policy.modifiedAt,
        hash: policy.hash,
        policies: policy.policies,
        configOptions: policy.config
    });
});
router.post(['/policy/ack', '/policy/report'], async (req, res) => {
    const parsed = policyAckSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const device = await findDeviceForClient(req, parsed.data);
    if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
    }
    if (isDisabledDevice(device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    const strategyIds = uniqueStrategyIds(parsed.data.strategyIds?.length
        ? parsed.data.strategyIds
        : [parsed.data.strategyId]);
    const strategyError = await validatePolicyReceiptStrategies(device, strategyIds);
    if (strategyError) {
        res.status(strategyError.status).json(strategyError);
        return;
    }
    const modifiedAt = optionalInt(parsed.data.modifiedAt) ?? 0;
    const appliedAt = parsed.data.status === 'APPLIED' ? new Date() : undefined;
    const receipts = await Promise.all(strategyIds.map((strategyId) => prisma.strategyApplyReceipt.create({
        data: {
            deviceId: device.id,
            strategyId,
            modifiedAt,
            hash: parsed.data.hash,
            status: parsed.data.status,
            message: parsed.data.message,
            metadata: jsonValue(parsed.data.metadata ?? parsed.data),
            appliedAt
        }
    })));
    await auditLog({
        action: 'POLICY_APPLY',
        resource: 'strategy',
        resourceId: parsed.data.strategyId,
        metadata: { deviceId: device.id, strategyIds, receiptCount: receipts.length, status: parsed.data.status, modifiedAt, hash: parsed.data.hash },
        req
    });
    res.json({ ok: true, receiptCount: receipts.length, receipts: receipts.map((receipt) => ({ id: receipt.id, status: receipt.status })) });
});
router.post('/record/init', async (req, res) => {
    const parsed = recordingMetaSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const device = await findDeviceForRecording(req, parsed.data);
    if (device && isDisabledDevice(device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    const filename = parsed.data.filename ?? `${parsed.data.id ?? parsed.data.rustdesk_id ?? parsed.data.deviceId ?? 'unknown'}-${Date.now()}.rsv`;
    const recording = await prisma.recording.create({
        data: {
            deviceId: device?.id,
            filename,
            path: '',
            sizeBytes: recordingSize(parsed.data.sizeBytes),
            status: 'UPLOADING',
            startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
            metadata: jsonValue(parsed.data.metadata ?? parsed.data)
        }
    });
    await auditLog({ action: 'RECORD_UPLOAD', resource: 'recording', resourceId: recording.id, metadata: { status: 'UPLOADING' }, req });
    res.json({ ok: true, id: recording.id, status: recording.status });
});
router.post('/record/:recordingId/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'Missing recording file' });
        return;
    }
    const existing = await prisma.recording.findUnique({
        where: { id: req.params.recordingId },
        include: { device: true }
    });
    if (!existing) {
        res.status(404).json({ error: 'Recording upload not found' });
        return;
    }
    if (existing.device && isDisabledDevice(existing.device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    assertClientRecordAccess(req, existing.deviceId);
    const result = await saveRecordingFile(req.params.recordingId, file, req.body);
    if ('error' in result) {
        res.status(result.status ?? 400).json(result);
        return;
    }
    await auditLog({ action: 'RECORD_UPLOAD', resource: 'recording', resourceId: result.recording.id, metadata: { status: 'COMPLETED', sizeBytes: file.size }, req });
    res.json({ ok: true, id: result.recording.id, status: result.recording.status, sizeBytes: result.recording.sizeBytes.toString() });
});
router.post('/record/:recordingId/chunk', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'Missing recording chunk file' });
        return;
    }
    const existing = await prisma.recording.findUnique({
        where: { id: req.params.recordingId },
        include: { device: true }
    });
    if (!existing) {
        res.status(404).json({ error: 'Recording upload not found' });
        return;
    }
    if (existing.device && isDisabledDevice(existing.device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    assertClientRecordAccess(req, existing.deviceId);
    const result = await saveRecordingChunk(req.params.recordingId, file, req.body);
    if ('error' in result) {
        res.status(result.status ?? 400).json(result);
        return;
    }
    await auditLog({
        action: 'RECORD_UPLOAD',
        resource: 'recording',
        resourceId: result.recording.id,
        metadata: { status: result.recording.status, chunkBytes: file.size, nextOffset: result.nextOffset, complete: result.complete },
        req
    });
    res.json({
        ok: true,
        id: result.recording.id,
        status: result.recording.status,
        sizeBytes: result.recording.sizeBytes.toString(),
        nextOffset: result.nextOffset,
        completedAt: result.recording.completedAt
    });
});
router.patch('/record/:recordingId', async (req, res) => {
    const parsed = recordingStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const existing = await prisma.recording.findUnique({
        where: { id: req.params.recordingId },
        include: { device: true }
    });
    if (!existing) {
        res.status(404).json({ error: 'Recording not found' });
        return;
    }
    if (existing.device && isDisabledDevice(existing.device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    assertClientRecordAccess(req, existing.deviceId);
    const transition = validateClientRecordingStatusTransition(existing.status, parsed.data.status);
    if (!transition.ok) {
        res.status(409).json(transition);
        return;
    }
    const recording = await prisma.recording.update({
        where: { id: req.params.recordingId },
        data: {
            status: parsed.data.status,
            sizeBytes: recordingSize(parsed.data.sizeBytes, undefined),
            completedAt: parsed.data.status === 'COMPLETED' ? new Date() : undefined,
            metadata: parsed.data.metadata ? jsonValue(parsed.data.metadata) : undefined
        }
    });
    await auditLog({ action: 'RECORD_UPLOAD', resource: 'recording', resourceId: recording.id, metadata: { status: parsed.data.status }, req });
    res.json({ ok: true, id: recording.id, status: recording.status, sizeBytes: recording.sizeBytes.toString() });
});
router.get('/record/:recordingId', async (req, res) => {
    const recording = await prisma.recording.findUnique({
        where: { id: req.params.recordingId },
        include: { device: true }
    });
    if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
    }
    assertClientRecordAccess(req, recording.deviceId);
    res.json(serializeClientRecording(recording));
});
router.post('/record', upload.single('file'), async (req, res) => {
    const device = await findDeviceForRecording(req, req.body);
    const file = req.file;
    if (device && isDisabledDevice(device)) {
        res.status(403).json({ error: 'Device is disabled' });
        return;
    }
    if (!file) {
        res.status(400).json({ error: 'Missing recording file' });
        return;
    }
    const pending = await prisma.recording.create({
        data: {
            deviceId: device?.id,
            filename: file.originalname,
            path: '',
            sizeBytes: 0n,
            status: 'UPLOADING',
            metadata: jsonValue({ body: req.body })
        }
    });
    const result = await saveRecordingFile(pending.id, file, req.body);
    if ('error' in result) {
        res.status(result.status ?? 400).json(result);
        return;
    }
    await auditLog({ action: 'RECORD_UPLOAD', resource: 'recording', resourceId: result.recording.id, metadata: { status: 'COMPLETED', sizeBytes: file.size }, req });
    res.json({ ok: true, id: result.recording.id, status: result.recording.status, sizeBytes: result.recording.sizeBytes.toString() });
});
router.get('/ab', async (req, res) => {
    const parsed = addressBookQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    if (!await requireAddressBookIdentityAuth(req, res, parsed.data))
        return;
    const user = await findAddressBookUser(parsed.data);
    const books = await prisma.addressBook.findMany({
        where: addressBookVisibility(user?.id),
        include: { peers: true, tags: true, shares: user ? { where: { userId: user.id } } : false },
        orderBy: { updatedAt: 'desc' }
    });
    await auditLog({
        action: 'ADDRESS_BOOK_SYNC',
        resource: 'addressBook',
        actorUserId: user?.id,
        metadata: addressBookSyncSummary(books, user),
        req
    });
    res.json({ books: books.map(serializeClientAddressBook) });
});
router.get('/ab/:guid', async (req, res) => {
    const parsed = addressBookQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    if (!await requireAddressBookIdentityAuth(req, res, parsed.data))
        return;
    const user = await findAddressBookUser(parsed.data);
    const book = await prisma.addressBook.findFirst({
        where: { guid: req.params.guid, ...addressBookVisibility(user?.id) },
        include: { peers: true, tags: true, shares: user ? { where: { userId: user.id } } : false }
    });
    if (!book) {
        res.status(404).json({ error: 'Address book not found' });
        return;
    }
    await auditLog({
        action: 'ADDRESS_BOOK_SYNC',
        resource: 'addressBook',
        resourceId: book.id,
        actorUserId: user?.id,
        metadata: addressBookSyncSummary([book], user),
        req
    });
    res.json(serializeClientAddressBook(book));
});
export default router;
