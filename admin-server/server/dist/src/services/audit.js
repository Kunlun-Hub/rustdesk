import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
const redacted = '[REDACTED]';
const sensitiveKeyPattern = /(authorization|password|secret|token|access[_-]?token|refresh[_-]?token|clientsecret|appsecret|credential|codeverifier)/i;
const csvFormulaPattern = /^[=+\-@\t\r]/;
export async function auditLog(input) {
    const createdAt = new Date();
    await prisma.$transaction(async (tx) => {
        const previous = await tx.auditLog.findFirst({
            where: { entryHash: { not: null } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { entryHash: true }
        });
        const data = {
            actorUserId: input.actorUserId ?? null,
            action: input.action,
            resource: input.resource,
            resourceId: input.resourceId ?? null,
            ipAddress: input.req?.ip ?? null,
            userAgent: input.req?.headers['user-agent'] ?? null,
            metadata: input.metadata === undefined ? undefined : sanitizeAuditMetadata(input.metadata),
            previousHash: previous?.entryHash ?? null,
            createdAt
        };
        await tx.auditLog.create({
            data: {
                ...data,
                entryHash: auditEntryHash(data)
            }
        });
    });
}
export function auditEntryPayload(log) {
    return {
        actorUserId: log.actorUserId,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: normalizeJson(log.metadata ?? null),
        previousHash: log.previousHash,
        createdAt: log.createdAt.toISOString()
    };
}
export function auditEntryHash(log) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(auditEntryPayload(log)))
        .digest('hex');
}
export function normalizeJson(value) {
    if (Array.isArray(value))
        return value.map(normalizeJson);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, normalizeJson(item)]));
    }
    return value;
}
export function sanitizeAuditMetadata(value, key = '') {
    if (sensitiveKeyPattern.test(key) && typeof value !== 'boolean') {
        return redacted;
    }
    if (value === null) {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeAuditMetadata(item));
    }
    if (value && typeof value === 'object') {
        const result = {};
        for (const [childKey, childValue] of Object.entries(value)) {
            if (childValue !== undefined) {
                result[childKey] = sanitizeAuditMetadata(childValue, childKey);
            }
        }
        return result;
    }
    return null;
}
export function escapeCsvFormula(text) {
    return csvFormulaPattern.test(text) ? `'${text}` : text;
}
export async function verifyAuditChain(limit = 10000) {
    const logs = await prisma.auditLog.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit
    });
    const issues = [];
    let expectedPrevious = null;
    let checked = 0;
    let missingHash = 0;
    for (const log of logs) {
        if (!log.entryHash) {
            missingHash += 1;
            expectedPrevious = null;
            issues.push({ id: log.id, createdAt: log.createdAt, reason: 'missing_entry_hash' });
            continue;
        }
        const actual = auditEntryHash(log);
        if (actual !== log.entryHash) {
            issues.push({ id: log.id, createdAt: log.createdAt, reason: 'entry_hash_mismatch' });
        }
        if (log.previousHash !== expectedPrevious) {
            issues.push({ id: log.id, createdAt: log.createdAt, reason: 'previous_hash_mismatch' });
        }
        expectedPrevious = log.entryHash;
        checked += 1;
    }
    return {
        ok: issues.length === 0,
        checked,
        missingHash,
        total: logs.length,
        truncated: logs.length >= limit,
        headHash: expectedPrevious,
        issues: issues.slice(0, 100)
    };
}
