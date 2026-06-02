import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { auditLog, escapeCsvFormula, sanitizeAuditMetadata, verifyAuditChain } from '../services/audit.js';
import { applyRecordingRetention } from '../services/recordings.js';
import { config } from '../config.js';
import { runHealthChecks } from '../services/health.js';
import { previewGroupPolicies, resolveDevicePolicyById } from '../services/policies.js';
import { encryptAddressBookSecret, encryptIdentityProviderSecret, hasAddressBookSecret } from '../services/secrets.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.RECORDING_UPLOAD_MAX_MB * 1024 * 1024 } });
const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000;
router.use(requireAuth);
router.get('/system/health', requirePermission('system.read'), async (_req, res) => {
    const result = await runHealthChecks();
    res.status(result.ok ? 200 : 503).json({ service: 'rustdesk-admin-server', ...result });
});
function canReadAddressBookWhere(userId, isAdmin = false) {
    if (isAdmin)
        return {};
    return {
        OR: [
            { shareRule: { in: ['public', 'read', 'write'] } },
            ...(userId
                ? [
                    { ownerId: userId },
                    { shares: { some: { userId } } }
                ]
                : [])
        ]
    };
}
function canWriteAddressBookWhere(userId, isAdmin = false) {
    if (isAdmin)
        return {};
    return {
        OR: [
            ...(userId
                ? [
                    { ownerId: userId },
                    { shares: { some: { userId, permission: { in: ['write', 'owner'] } } } }
                ]
                : [])
        ]
    };
}
async function requireAddressBookAccess(req, res, mode) {
    const where = mode === 'read'
        ? canReadAddressBookWhere(req.user?.sub, req.user?.isAdmin)
        : canWriteAddressBookWhere(req.user?.sub, req.user?.isAdmin);
    const book = await prisma.addressBook.findFirst({ where: { id: req.params.id, ...where } });
    if (!book) {
        res.status(403).json({ error: 'Address book access denied' });
        return null;
    }
    return book;
}
async function findAddressBookUser(userId) {
    if (!userId)
        return null;
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, email: true }
    });
}
async function unknownAddressBookTags(addressBookId, tagNames) {
    const uniqueNames = [...new Set(tagNames)];
    if (uniqueNames.length === 0)
        return [];
    const tags = await prisma.addressBookTag.findMany({
        where: { addressBookId, name: { in: uniqueNames } },
        select: { name: true }
    });
    const existingNames = new Set(tags.map((tag) => tag.name));
    return uniqueNames.filter((name) => !existingNames.has(name)).sort();
}
const optionalSecret = z.preprocess((value) => value === '' ? undefined : value, z.string().nullable().optional());
const identityProviderSchema = z.object({
    type: z.enum(['LOCAL', 'OIDC', 'WECOM', 'DINGTALK']),
    name: z.string().min(1),
    issuerUrl: z.string().url().nullable().optional(),
    clientId: z.string().nullable().optional(),
    clientSecret: optionalSecret,
    corpId: z.string().nullable().optional(),
    agentId: z.string().nullable().optional(),
    appKey: z.string().nullable().optional(),
    appSecret: optionalSecret,
    enabled: z.boolean().default(false)
});
function validateIdentityProviderConfig(data, partial = false) {
    if (!data.enabled && partial)
        return null;
    if (data.type === 'OIDC' && (!data.issuerUrl || !data.clientId)) {
        return 'OIDC providers require issuerUrl and clientId';
    }
    if (data.type === 'WECOM' && (!data.corpId || !data.agentId || !data.appSecret)) {
        return 'Enterprise WeChat providers require corpId, agentId, and appSecret';
    }
    if (data.type === 'DINGTALK' && (!data.appKey || !data.appSecret)) {
        return 'DingTalk providers require appKey and appSecret';
    }
    return null;
}
function cleanIdentityProviderFields(data, type, typeChanged) {
    const normalized = { ...data };
    if (type === 'OIDC') {
        normalized.corpId = null;
        normalized.agentId = null;
        normalized.appKey = null;
        normalized.appSecret = null;
    }
    if (type === 'WECOM') {
        normalized.issuerUrl = null;
        normalized.clientId = null;
        normalized.clientSecret = null;
        normalized.appKey = null;
        if (typeChanged && normalized.appSecret === undefined)
            normalized.appSecret = null;
    }
    if (type === 'DINGTALK') {
        normalized.issuerUrl = null;
        normalized.clientId = null;
        normalized.clientSecret = null;
        normalized.corpId = null;
        normalized.agentId = null;
        if (typeChanged && normalized.appSecret === undefined)
            normalized.appSecret = null;
    }
    if (type === 'LOCAL') {
        normalized.issuerUrl = null;
        normalized.clientId = null;
        normalized.clientSecret = null;
        normalized.corpId = null;
        normalized.agentId = null;
        normalized.appKey = null;
        normalized.appSecret = null;
        normalized.enabled = false;
    }
    return normalized;
}
function normalizeIdentityProviderCreateData(data) {
    return cleanIdentityProviderFields(data, data.type, false);
}
function normalizeIdentityProviderUpdateData(data, existing) {
    const type = data.type ?? existing.type;
    return cleanIdentityProviderFields(data, type, Boolean(data.type && data.type !== existing.type));
}
function encryptIdentityProviderSecretFields(data) {
    return {
        ...data,
        ...(data.clientSecret !== undefined ? { clientSecret: encryptIdentityProviderSecret(data.clientSecret) } : {}),
        ...(data.appSecret !== undefined ? { appSecret: encryptIdentityProviderSecret(data.appSecret) } : {})
    };
}
function identityProviderDiagnostics(provider) {
    const missing = [];
    if (provider.type === 'OIDC') {
        if (!provider.issuerUrl)
            missing.push('issuerUrl');
        if (!provider.clientId)
            missing.push('clientId');
    }
    if (provider.type === 'WECOM') {
        if (!provider.corpId)
            missing.push('corpId');
        if (!provider.agentId)
            missing.push('agentId');
        if (!provider.appSecret)
            missing.push('appSecret');
    }
    if (provider.type === 'DINGTALK') {
        if (!provider.appKey)
            missing.push('appKey');
        if (!provider.appSecret)
            missing.push('appSecret');
    }
    return {
        ready: missing.length === 0,
        missing,
        secrets: {
            clientSecret: Boolean(provider.clientSecret),
            appSecret: Boolean(provider.appSecret)
        },
        startUrl: `${config.PUBLIC_BASE_URL}/api/auth/${provider.id}/start`,
        callbackUrl: `${config.PUBLIC_BASE_URL}/api/auth/${provider.id}/callback`
    };
}
function serializeIdentityProvider(provider) {
    const { clientSecret: _clientSecret, appSecret: _appSecret, _count, ...safeProvider } = provider;
    return {
        ...safeProvider,
        linkedAccounts: _count?.accounts ?? 0,
        diagnostics: identityProviderDiagnostics(provider)
    };
}
function identityProviderAuditSummary(provider) {
    const diagnostics = identityProviderDiagnostics({ id: 'audit', ...provider });
    return {
        type: provider.type,
        name: provider.name,
        enabled: provider.enabled,
        ready: diagnostics.ready,
        missing: diagnostics.missing,
        issuerUrl: provider.issuerUrl,
        clientId: provider.clientId,
        corpId: provider.corpId,
        agentId: provider.agentId,
        appKey: provider.appKey,
        clientSecretConfigured: Boolean(provider.clientSecret),
        appSecretConfigured: Boolean(provider.appSecret)
    };
}
function changedSummaryFields(before, after) {
    return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();
}
async function wouldRemoveLastAdmin(userId, next) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, status: true } });
    if (!current?.isAdmin || current.status !== 'NORMAL')
        return false;
    const willRemainActiveAdmin = next.isAdmin !== false && (next.status === undefined || next.status === 'NORMAL');
    if (willRemainActiveAdmin)
        return false;
    const activeAdmins = await prisma.user.count({ where: { isAdmin: true, status: 'NORMAL' } });
    return activeAdmins <= 1;
}
async function wouldBulkRemoveAllAdmins(userIds, next) {
    if (!next.status || next.status === 'NORMAL')
        return false;
    const activeAdmins = await prisma.user.findMany({
        where: { isAdmin: true, status: 'NORMAL' },
        select: { id: true }
    });
    if (activeAdmins.length === 0)
        return false;
    const changedIds = new Set(userIds);
    return activeAdmins.every((admin) => changedIds.has(admin.id));
}
function wouldDemoteCurrentUser(targetUserId, currentUserId, next) {
    if (!currentUserId || targetUserId !== currentUserId)
        return false;
    return next.isAdmin === false || (next.status !== undefined && next.status !== 'NORMAL');
}
async function requireMutableRole(roleId, res) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
    if (!role) {
        res.status(404).json({ error: 'Role not found' });
        return null;
    }
    if (role.name === 'Super Admin') {
        res.status(400).json({ error: 'Super Admin role cannot be modified or deleted' });
        return null;
    }
    return role;
}
function diffStringSet(before, after) {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    return {
        added: after.filter((item) => !beforeSet.has(item)),
        removed: before.filter((item) => !afterSet.has(item))
    };
}
function changedFields(before, after, fields) {
    return fields
        .filter((field) => before[field] !== after[field])
        .map(String);
}
function roleIdsFromUser(user) {
    return (user.roles ?? [])
        .map((item) => item.roleId ?? item.role?.id)
        .filter((roleId) => Boolean(roleId));
}
function permissionKeysFromRole(role) {
    return (role.permissions ?? [])
        .map((item) => item.permission?.key)
        .filter((key) => Boolean(key));
}
async function unknownPermissionKeys(permissionKeys) {
    const uniqueKeys = [...new Set(permissionKeys)];
    if (uniqueKeys.length === 0)
        return [];
    const existing = await prisma.permission.findMany({
        where: { key: { in: uniqueKeys } },
        select: { key: true }
    });
    const existingKeys = new Set(existing.map((permission) => permission.key));
    return uniqueKeys.filter((key) => !existingKeys.has(key)).sort();
}
async function unknownRoleIds(roleIds) {
    const uniqueIds = [...new Set(roleIds)];
    if (uniqueIds.length === 0)
        return [];
    const existing = await prisma.role.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true }
    });
    const existingIds = new Set(existing.map((role) => role.id));
    return uniqueIds.filter((roleId) => !existingIds.has(roleId)).sort();
}
async function unknownUserIds(userIds) {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0)
        return [];
    const existing = await prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true }
    });
    const existingIds = new Set(existing.map((user) => user.id));
    return uniqueIds.filter((userId) => !existingIds.has(userId)).sort();
}
async function findDuplicateRoleName(name, exceptId) {
    if (!name)
        return null;
    return prisma.role.findFirst({
        where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { id: true, name: true }
    });
}
async function findDuplicateUserIdentity(input, exceptId) {
    const checks = [];
    if (input.username)
        checks.push({ username: input.username });
    if (input.email)
        checks.push({ email: input.email });
    if (checks.length === 0)
        return [];
    const duplicates = await prisma.user.findMany({
        where: {
            OR: checks,
            ...(exceptId ? { id: { not: exceptId } } : {})
        },
        select: { id: true, username: true, email: true }
    });
    const fields = new Set();
    for (const user of duplicates) {
        if (input.username && user.username === input.username)
            fields.add('username');
        if (input.email && user.email === input.email)
            fields.add('email');
    }
    return [...fields].sort();
}
function userWhere(query) {
    const q = typeof query.q === 'string' ? query.q : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;
    const roleId = typeof query.roleId === 'string' ? query.roleId : undefined;
    const identity = typeof query.identity === 'string' ? query.identity : undefined;
    return {
        ...(status ? { status: status } : {}),
        ...(roleId ? { roles: { some: { roleId } } } : {}),
        ...(identity === 'linked' ? { identities: { some: {} } } : {}),
        ...(identity === 'none' ? { identities: { none: {} } } : {}),
        ...(q
            ? {
                OR: [
                    { username: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                    { displayName: { contains: q, mode: 'insensitive' } },
                    { identities: { some: { subject: { contains: q, mode: 'insensitive' } } } }
                ]
            }
            : {})
    };
}
router.get('/users', requirePermission('users.read'), async (req, res) => {
    const users = await prisma.user.findMany({
        where: userWhere(req.query),
        select: {
            id: true,
            username: true,
            email: true,
            displayName: true,
            status: true,
            isAdmin: true,
            createdAt: true,
            roles: { include: { role: true } },
            _count: { select: { identities: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(users);
});
router.get('/users/export', requirePermission('users.read'), async (req, res) => {
    const users = await prisma.user.findMany({
        where: userWhere(req.query),
        include: {
            roles: { include: { role: true } },
            identities: { include: { provider: { select: { type: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10000
    });
    const header = ['id', 'username', 'email', 'displayName', 'status', 'isAdmin', 'roles', 'identities', 'createdAt', 'updatedAt'];
    const rows = users.map((user) => [
        user.id,
        user.username,
        user.email,
        user.displayName,
        user.status,
        user.isAdmin,
        user.roles.map((role) => role.role.name).join('; '),
        user.identities.map((identity) => `${identity.provider.type}:${identity.provider.name}:${identity.subject}`).join('; '),
        user.createdAt,
        user.updatedAt
    ].map(csvCell).join(','));
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'userExport',
        actorUserId: req.user?.sub,
        metadata: { filters: req.query, exported: users.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.get('/users/:id/identities', requirePermission('users.read'), async (req, res) => {
    const identities = await prisma.identityProviderAccount.findMany({
        where: { userId: req.params.id },
        include: {
            provider: {
                select: {
                    id: true,
                    type: true,
                    name: true,
                    enabled: true
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });
    res.json(identities.map((identity) => ({
        id: identity.id,
        subject: identity.subject,
        rawProfile: sanitizeAuditMetadata(identity.rawProfile),
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt,
        provider: identity.provider
    })));
});
router.delete('/users/:id/identities/:identityId', requirePermission('users.write'), async (req, res) => {
    const identity = await prisma.identityProviderAccount.findFirst({
        where: { id: req.params.identityId, userId: req.params.id },
        include: { provider: { select: { id: true, name: true, type: true } } }
    });
    if (!identity) {
        res.status(404).json({ error: 'Identity link not found' });
        return;
    }
    await prisma.identityProviderAccount.delete({ where: { id: identity.id } });
    await auditLog({
        action: 'DELETE',
        resource: 'identityProviderAccount',
        resourceId: identity.id,
        actorUserId: req.user?.sub,
        metadata: { userId: req.params.id, provider: identity.provider, subject: identity.subject },
        req
    });
    res.json({ ok: true });
});
router.post('/users/:id/password', requirePermission('users.write'), async (req, res) => {
    const parsed = z.object({
        password: z.string().min(8)
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, username: true, status: true } });
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) }
    });
    await auditLog({
        action: 'UPDATE',
        resource: 'userPassword',
        resourceId: user.id,
        actorUserId: req.user?.sub,
        metadata: { username: user.username, status: user.status, result: 'reset_by_admin' },
        req
    });
    res.json({ ok: true });
});
router.post('/users', requirePermission('users.write'), async (req, res) => {
    const parsed = z.object({
        username: z.string().min(1),
        email: z.string().email().optional(),
        displayName: z.string().optional(),
        password: z.string().min(8).optional(),
        status: z.enum(['DISABLED', 'NORMAL', 'UNVERIFIED']).default('NORMAL'),
        isAdmin: z.boolean().default(false),
        roleIds: z.array(z.string()).default([])
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const missingRoleIds = await unknownRoleIds(parsed.data.roleIds);
    if (missingRoleIds.length > 0) {
        res.status(400).json({ error: 'Unknown role ids', roleIds: missingRoleIds });
        return;
    }
    const duplicateFields = await findDuplicateUserIdentity({ username: parsed.data.username, email: parsed.data.email });
    if (duplicateFields.length > 0) {
        res.status(409).json({ error: 'User already exists', fields: duplicateFields });
        return;
    }
    const user = await prisma.user.create({
        data: {
            username: parsed.data.username,
            email: parsed.data.email,
            displayName: parsed.data.displayName,
            passwordHash: parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined,
            status: parsed.data.status,
            isAdmin: parsed.data.isAdmin,
            roles: { create: parsed.data.roleIds.map((roleId) => ({ roleId })) }
        },
        select: { id: true, username: true, email: true, displayName: true, status: true, isAdmin: true }
    });
    await auditLog({
        action: 'CREATE',
        resource: 'user',
        resourceId: user.id,
        actorUserId: req.user?.sub,
        metadata: {
            username: user.username,
            status: user.status,
            isAdmin: user.isAdmin,
            roleIds: parsed.data.roleIds,
            passwordConfigured: Boolean(parsed.data.password)
        },
        req
    });
    res.json(user);
});
router.post('/users/bulk', requirePermission('users.write'), async (req, res) => {
    const parsed = z.object({
        userIds: z.array(z.string().min(1)).min(1),
        status: z.enum(['DISABLED', 'NORMAL', 'UNVERIFIED']).optional(),
        roleIds: z.array(z.string()).optional()
    }).refine((value) => value.status !== undefined || value.roleIds !== undefined, 'status or roleIds is required').safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const missingUserIds = await unknownUserIds(parsed.data.userIds);
    if (missingUserIds.length > 0) {
        res.status(404).json({ error: 'Users not found', userIds: missingUserIds });
        return;
    }
    if (parsed.data.status && req.user?.sub && parsed.data.userIds.includes(req.user.sub) && parsed.data.status !== 'NORMAL') {
        res.status(400).json({ error: 'Current user cannot disable their own account' });
        return;
    }
    if (await wouldBulkRemoveAllAdmins(parsed.data.userIds, { status: parsed.data.status })) {
        res.status(400).json({ error: 'At least one active administrator is required' });
        return;
    }
    if (parsed.data.roleIds) {
        const missingRoleIds = await unknownRoleIds(parsed.data.roleIds);
        if (missingRoleIds.length > 0) {
            res.status(400).json({ error: 'Unknown role ids', roleIds: missingRoleIds });
            return;
        }
    }
    const result = await prisma.$transaction(async (tx) => {
        const updated = parsed.data.status
            ? await tx.user.updateMany({ where: { id: { in: parsed.data.userIds } }, data: { status: parsed.data.status } })
            : { count: 0 };
        if (parsed.data.roleIds) {
            await tx.userRole.deleteMany({ where: { userId: { in: parsed.data.userIds } } });
            await tx.userRole.createMany({
                data: parsed.data.userIds.flatMap((userId) => parsed.data.roleIds.map((roleId) => ({ userId, roleId }))),
                skipDuplicates: true
            });
        }
        return { updated: updated.count, roleAssignments: parsed.data.roleIds ? parsed.data.userIds.length * new Set(parsed.data.roleIds).size : 0 };
    });
    await auditLog({ action: 'UPDATE', resource: 'userBulk', actorUserId: req.user?.sub, metadata: { ...parsed.data, ...result }, req });
    res.json({ ok: true, ...result });
});
router.patch('/users/:id', requirePermission('users.write'), async (req, res) => {
    const parsed = z.object({
        email: z.string().email().nullable().optional(),
        displayName: z.string().nullable().optional(),
        password: z.string().min(8).optional(),
        status: z.enum(['DISABLED', 'NORMAL', 'UNVERIFIED']).optional(),
        isAdmin: z.boolean().optional(),
        roleIds: z.array(z.string()).optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const { roleIds, password, ...data } = parsed.data;
    if (roleIds) {
        const missingRoleIds = await unknownRoleIds(roleIds);
        if (missingRoleIds.length > 0) {
            res.status(400).json({ error: 'Unknown role ids', roleIds: missingRoleIds });
            return;
        }
    }
    if (wouldDemoteCurrentUser(req.params.id, req.user?.sub, { isAdmin: data.isAdmin, status: data.status })) {
        res.status(400).json({ error: 'Current user cannot disable or demote their own account' });
        return;
    }
    if (await wouldRemoveLastAdmin(req.params.id, { isAdmin: data.isAdmin, status: data.status })) {
        res.status(400).json({ error: 'At least one active administrator is required' });
        return;
    }
    const before = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
            id: true,
            username: true,
            email: true,
            displayName: true,
            status: true,
            isAdmin: true,
            roles: { select: { roleId: true } }
        }
    });
    if (!before) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const duplicateFields = await findDuplicateUserIdentity({ email: data.email }, before.id);
    if (duplicateFields.length > 0) {
        res.status(409).json({ error: 'User already exists', fields: duplicateFields });
        return;
    }
    const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
            where: { id: req.params.id },
            data: {
                ...data,
                passwordHash: password ? await bcrypt.hash(password, 12) : undefined
            },
            select: { id: true, username: true, email: true, displayName: true, status: true, isAdmin: true }
        });
        if (roleIds) {
            await tx.userRole.deleteMany({ where: { userId: req.params.id } });
            await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: req.params.id, roleId })), skipDuplicates: true });
        }
        return updated;
    });
    await auditLog({
        action: 'UPDATE',
        resource: 'user',
        resourceId: user.id,
        actorUserId: req.user?.sub,
        metadata: {
            changedFields: changedFields(before, user, ['email', 'displayName', 'status', 'isAdmin']),
            roles: roleIds ? diffStringSet(roleIdsFromUser(before), roleIds) : undefined,
            passwordReset: Boolean(password)
        },
        req
    });
    res.json(user);
});
router.delete('/users/:id', requirePermission('users.write'), async (req, res) => {
    if (req.params.id === req.user?.sub) {
        res.status(400).json({ error: 'Current user cannot be deleted' });
        return;
    }
    if (await wouldRemoveLastAdmin(req.params.id, { status: 'DISABLED' })) {
        res.status(400).json({ error: 'At least one active administrator is required' });
        return;
    }
    const deleted = await prisma.user.deleteMany({ where: { id: req.params.id } });
    if (deleted.count === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    await auditLog({ action: 'DELETE', resource: 'user', resourceId: req.params.id, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
router.get('/roles', requirePermission('roles.read'), async (_req, res) => {
    const roles = await prisma.role.findMany({
        include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
        orderBy: { name: 'asc' }
    });
    res.json(roles);
});
router.get('/roles/export', requirePermission('roles.read'), async (req, res) => {
    const roles = await prisma.role.findMany({
        include: {
            permissions: { include: { permission: true } },
            _count: { select: { users: true } }
        },
        orderBy: { name: 'asc' }
    });
    const header = ['id', 'name', 'description', 'users', 'permissionCount', 'permissions', 'createdAt', 'updatedAt'];
    const rows = roles.map((role) => {
        const permissionKeys = permissionKeysFromRole(role).sort();
        return [
            role.id,
            role.name,
            role.description,
            role._count.users,
            permissionKeys.length,
            permissionKeys.join('; '),
            role.createdAt,
            role.updatedAt
        ].map(csvCell).join(',');
    });
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'roleExport',
        actorUserId: req.user?.sub,
        metadata: { exported: roles.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roles-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.get('/permissions', requirePermission('roles.read'), async (_req, res) => {
    res.json(await prisma.permission.findMany({ orderBy: { key: 'asc' } }));
});
router.post('/roles', requirePermission('roles.write'), async (req, res) => {
    const parsed = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        permissionKeys: z.array(z.string()).default([])
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const unknownKeys = await unknownPermissionKeys(parsed.data.permissionKeys);
    if (unknownKeys.length > 0) {
        res.status(400).json({ error: 'Unknown permission keys', permissionKeys: unknownKeys });
        return;
    }
    const duplicate = await findDuplicateRoleName(parsed.data.name);
    if (duplicate) {
        res.status(409).json({ error: 'Role name already exists', role: duplicate });
        return;
    }
    const role = await prisma.role.create({
        data: {
            name: parsed.data.name,
            description: parsed.data.description,
            permissions: {
                create: parsed.data.permissionKeys.map((key) => ({
                    permission: { connect: { key } }
                }))
            }
        },
        include: { permissions: { include: { permission: true } } }
    });
    await auditLog({
        action: 'CREATE',
        resource: 'role',
        resourceId: role.id,
        actorUserId: req.user?.sub,
        metadata: {
            name: role.name,
            permissionKeys: permissionKeysFromRole(role)
        },
        req
    });
    res.json(role);
});
router.patch('/roles/:id', requirePermission('roles.write'), async (req, res) => {
    const parsed = z.object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        permissionKeys: z.array(z.string()).optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const mutableRole = await requireMutableRole(req.params.id, res);
    if (!mutableRole)
        return;
    const duplicate = await findDuplicateRoleName(parsed.data.name, mutableRole.id);
    if (duplicate) {
        res.status(409).json({ error: 'Role name already exists', role: duplicate });
        return;
    }
    if (parsed.data.permissionKeys) {
        const unknownKeys = await unknownPermissionKeys(parsed.data.permissionKeys);
        if (unknownKeys.length > 0) {
            res.status(400).json({ error: 'Unknown permission keys', permissionKeys: unknownKeys });
            return;
        }
    }
    const before = await prisma.role.findUnique({
        where: { id: req.params.id },
        include: { permissions: { include: { permission: true } } }
    });
    if (!before) {
        res.status(404).json({ error: 'Role not found' });
        return;
    }
    const role = await prisma.$transaction(async (tx) => {
        const updated = await tx.role.update({
            where: { id: req.params.id },
            data: { name: parsed.data.name, description: parsed.data.description }
        });
        if (parsed.data.permissionKeys) {
            await tx.rolePermission.deleteMany({ where: { roleId: req.params.id } });
            const permissions = await tx.permission.findMany({ where: { key: { in: parsed.data.permissionKeys } } });
            await tx.rolePermission.createMany({
                data: permissions.map((permission) => ({ roleId: req.params.id, permissionId: permission.id })),
                skipDuplicates: true
            });
        }
        return updated;
    });
    await auditLog({
        action: 'UPDATE',
        resource: 'role',
        resourceId: role.id,
        actorUserId: req.user?.sub,
        metadata: {
            changedFields: changedFields(before, role, ['name', 'description']),
            permissions: parsed.data.permissionKeys
                ? diffStringSet(permissionKeysFromRole(before), parsed.data.permissionKeys)
                : undefined
        },
        req
    });
    res.json(role);
});
router.delete('/roles/:id', requirePermission('roles.write'), async (req, res) => {
    const mutableRole = await requireMutableRole(req.params.id, res);
    if (!mutableRole)
        return;
    const usersWithRole = await prisma.userRole.count({ where: { roleId: req.params.id } });
    if (usersWithRole > 0) {
        res.status(409).json({
            error: 'Role is assigned to users and cannot be deleted',
            assignedUsers: usersWithRole
        });
        return;
    }
    const deleted = await prisma.role.deleteMany({ where: { id: req.params.id } });
    if (deleted.count === 0) {
        res.status(404).json({ error: 'Role not found' });
        return;
    }
    await auditLog({ action: 'DELETE', resource: 'role', resourceId: req.params.id, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
function strategyWhere(query) {
    const q = typeof query.q === 'string' ? query.q : undefined;
    const target = typeof query.target === 'string' ? query.target : undefined;
    return {
        ...(target === 'device' ? { assignments: { some: { deviceId: { not: null } } } } : {}),
        ...(target === 'group' ? { assignments: { some: { groupId: { not: null } } } } : {}),
        ...(target === 'unassigned' ? { assignments: { none: {} } } : {}),
        ...(q
            ? {
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { description: { contains: q, mode: 'insensitive' } }
                ]
            }
            : {})
    };
}
async function strategyReceiptSummary(strategyIds) {
    const receiptGroups = strategyIds.length > 0
        ? await prisma.strategyApplyReceipt.groupBy({
            by: ['strategyId', 'status'],
            where: { strategyId: { in: strategyIds } },
            _count: { _all: true }
        })
        : [];
    const summaryByStrategy = new Map();
    for (const group of receiptGroups) {
        if (!group.strategyId)
            continue;
        const summary = summaryByStrategy.get(group.strategyId) ?? { total: 0, PENDING: 0, APPLIED: 0, FAILED: 0 };
        summary.total += group._count._all;
        summary[group.status] = group._count._all;
        summaryByStrategy.set(group.strategyId, summary);
    }
    return summaryByStrategy;
}
function strategySummaryMatches(summary, rollout) {
    if (!rollout)
        return true;
    if (rollout === 'noReceipts')
        return summary.total === 0;
    if (rollout === 'pending')
        return summary.PENDING > 0;
    if (rollout === 'failed')
        return summary.FAILED > 0;
    if (rollout === 'applied')
        return summary.total > 0 && summary.APPLIED === summary.total;
    return true;
}
async function findDuplicateStrategyName(name, exceptId) {
    if (!name)
        return null;
    return prisma.strategy.findFirst({
        where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { id: true, name: true }
    });
}
router.get('/strategies', requirePermission('strategies.read'), async (req, res) => {
    const strategies = await prisma.strategy.findMany({
        where: strategyWhere(req.query),
        include: { assignments: { include: { device: true, group: true } } },
        orderBy: { updatedAt: 'desc' }
    });
    const rollout = typeof req.query.rollout === 'string' ? req.query.rollout : undefined;
    const summaryByStrategy = await strategyReceiptSummary(strategies.map((strategy) => strategy.id));
    res.json(strategies
        .map((strategy) => ({
        ...strategy,
        receiptSummary: summaryByStrategy.get(strategy.id) ?? { total: 0, PENDING: 0, APPLIED: 0, FAILED: 0 }
    }))
        .filter((strategy) => strategySummaryMatches(strategy.receiptSummary, rollout)));
});
router.get('/strategies/export', requirePermission('strategies.read'), async (req, res) => {
    const strategies = await prisma.strategy.findMany({
        where: strategyWhere(req.query),
        include: { assignments: { include: { device: true, group: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10000
    });
    const rollout = typeof req.query.rollout === 'string' ? req.query.rollout : undefined;
    const summaryByStrategy = await strategyReceiptSummary(strategies.map((strategy) => strategy.id));
    const rowsWithSummary = strategies
        .map((strategy) => ({
        strategy,
        receiptSummary: summaryByStrategy.get(strategy.id) ?? { total: 0, PENDING: 0, APPLIED: 0, FAILED: 0 }
    }))
        .filter(({ receiptSummary }) => strategySummaryMatches(receiptSummary, rollout));
    const header = ['id', 'name', 'description', 'modifiedAt', 'assignments', 'receiptTotal', 'pending', 'applied', 'failed', 'configOptions', 'extra', 'createdAt', 'updatedAt'];
    const rows = rowsWithSummary.map(({ strategy, receiptSummary }) => [
        strategy.id,
        strategy.name,
        strategy.description,
        strategy.modifiedAt,
        strategy.assignments.map((assignment) => assignment.device
            ? `device:${assignment.device.rustdeskId}`
            : `group:${assignment.group?.name ?? assignment.groupId}`).join('; '),
        receiptSummary.total,
        receiptSummary.PENDING,
        receiptSummary.APPLIED,
        receiptSummary.FAILED,
        strategy.configOptions,
        strategy.extra,
        strategy.createdAt,
        strategy.updatedAt
    ].map(csvCell).join(','));
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'strategyExport',
        actorUserId: req.user?.sub,
        metadata: { filters: req.query, exported: rowsWithSummary.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="policies-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.post('/strategies', requirePermission('strategies.write'), async (req, res) => {
    const parsed = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        configOptions: z.record(z.string(), z.unknown()).default({}),
        extra: z.record(z.string(), z.unknown()).default({})
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const duplicate = await findDuplicateStrategyName(parsed.data.name);
    if (duplicate) {
        res.status(409).json({ error: 'Policy name already exists', policy: duplicate });
        return;
    }
    const strategy = await prisma.strategy.create({
        data: {
            ...parsed.data,
            configOptions: parsed.data.configOptions,
            extra: parsed.data.extra
        }
    });
    await auditLog({ action: 'CREATE', resource: 'strategy', resourceId: strategy.id, actorUserId: req.user?.sub, req });
    res.json(strategy);
});
router.patch('/strategies/:id', requirePermission('strategies.write'), async (req, res) => {
    const parsed = z.object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        configOptions: z.record(z.string(), z.unknown()).optional(),
        extra: z.record(z.string(), z.unknown()).optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const existing = await prisma.strategy.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
    if (!existing) {
        res.status(404).json({ error: 'Policy not found' });
        return;
    }
    const duplicate = await findDuplicateStrategyName(parsed.data.name, existing.id);
    if (duplicate) {
        res.status(409).json({ error: 'Policy name already exists', policy: duplicate });
        return;
    }
    const strategy = await prisma.strategy.update({
        where: { id: req.params.id },
        data: {
            ...parsed.data,
            configOptions: parsed.data.configOptions,
            extra: parsed.data.extra,
            modifiedAt: { increment: 1 }
        }
    });
    await auditLog({ action: 'UPDATE', resource: 'strategy', resourceId: strategy.id, actorUserId: req.user?.sub, req });
    res.json(strategy);
});
router.delete('/strategies/:id', requirePermission('strategies.write'), async (req, res) => {
    const strategy = await prisma.strategy.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { assignments: true, receipts: true } } }
    });
    if (!strategy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
    }
    if (strategy._count.assignments > 0) {
        res.status(409).json({ error: 'Policy has assignments and cannot be deleted', assignments: strategy._count.assignments });
        return;
    }
    await prisma.strategy.delete({ where: { id: req.params.id } });
    await auditLog({ action: 'DELETE', resource: 'strategy', resourceId: req.params.id, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
router.post('/strategies/:id/assignments', requirePermission('strategies.write'), async (req, res) => {
    const parsed = z.object({
        deviceId: z.string().optional(),
        groupId: z.string().optional()
    }).refine((value) => Boolean(value.deviceId) !== Boolean(value.groupId), 'Exactly one of deviceId or groupId is required').safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const strategy = await prisma.strategy.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, modifiedAt: true } });
    if (!strategy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
    }
    const device = parsed.data.deviceId
        ? await prisma.device.findUnique({ where: { id: parsed.data.deviceId }, select: { id: true, rustdeskId: true, hostname: true, status: true } })
        : null;
    if (parsed.data.deviceId && !device) {
        res.status(404).json({ error: 'Device not found' });
        return;
    }
    if (device?.status === 'DISABLED') {
        res.status(409).json({
            error: 'Cannot assign policy to a disabled device',
            device: { id: device.id, rustdeskId: device.rustdeskId, hostname: device.hostname, status: device.status }
        });
        return;
    }
    const group = parsed.data.groupId
        ? await prisma.deviceGroup.findUnique({ where: { id: parsed.data.groupId }, select: { id: true, name: true } })
        : null;
    if (parsed.data.groupId && !group) {
        res.status(404).json({ error: 'Device group not found' });
        return;
    }
    const existing = await prisma.strategyAssignment.findFirst({
        where: {
            strategyId: strategy.id,
            ...(device ? { deviceId: device.id } : {}),
            ...(group ? { groupId: group.id } : {})
        }
    });
    if (existing) {
        res.status(409).json({ error: 'Policy is already assigned to this target', assignmentId: existing.id });
        return;
    }
    const assignment = await prisma.strategyAssignment.create({
        data: { strategyId: strategy.id, deviceId: device?.id, groupId: group?.id },
        include: { device: true, group: true }
    });
    await auditLog({
        action: 'STRATEGY_PUSH',
        resource: 'strategy',
        resourceId: strategy.id,
        actorUserId: req.user?.sub,
        metadata: {
            policy: strategy,
            assignmentId: assignment.id,
            targetType: device ? 'device' : 'group',
            target: device
                ? { id: device.id, rustdeskId: device.rustdeskId, hostname: device.hostname, status: device.status }
                : { id: group.id, name: group.name }
        },
        req
    });
    res.json(assignment);
});
router.get('/strategies/:id/assignments', requirePermission('strategies.read'), async (req, res) => {
    const assignments = await prisma.strategyAssignment.findMany({
        where: { strategyId: req.params.id },
        include: { device: true, group: true },
        orderBy: { createdAt: 'desc' }
    });
    res.json(assignments);
});
router.get('/strategies/:id/receipts', requirePermission('strategies.read'), async (req, res) => {
    const receipts = await prisma.strategyApplyReceipt.findMany({
        where: { strategyId: req.params.id },
        include: { device: true, strategy: true },
        orderBy: { updatedAt: 'desc' },
        take: 500
    });
    res.json(receipts);
});
router.get('/strategies/:id/preview', requirePermission('strategies.read'), async (req, res) => {
    const targetType = typeof req.query.targetType === 'string' ? req.query.targetType : undefined;
    const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : undefined;
    if (!targetId || (targetType !== 'device' && targetType !== 'group')) {
        res.status(400).json({ error: 'targetType device/group and targetId are required' });
        return;
    }
    const strategy = await prisma.strategy.findUnique({ where: { id: req.params.id } });
    if (!strategy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
    }
    if (targetType === 'device') {
        const preview = await resolveDevicePolicyById(targetId);
        if (!preview.device) {
            res.status(404).json({ error: 'Device not found' });
            return;
        }
        res.json({ targetType, policyId: strategy.id, preview });
        return;
    }
    const preview = await previewGroupPolicies(targetId);
    if (!preview) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    res.json({ targetType, policyId: strategy.id, preview });
});
router.post('/strategies/:id/repush', requirePermission('strategies.write'), async (req, res) => {
    const strategy = await prisma.strategy.findUnique({
        where: { id: req.params.id },
        include: {
            assignments: {
                include: {
                    device: true,
                    group: { include: { devices: true } }
                }
            }
        }
    });
    if (!strategy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
    }
    const devicesById = new Map();
    for (const assignment of strategy.assignments) {
        if (assignment.device) {
            devicesById.set(assignment.device.id, {
                id: assignment.device.id,
                rustdeskId: assignment.device.rustdeskId,
                status: assignment.device.status
            });
        }
        for (const device of assignment.group?.devices ?? []) {
            devicesById.set(device.id, {
                id: device.id,
                rustdeskId: device.rustdeskId,
                status: device.status
            });
        }
    }
    const devices = [...devicesById.values()];
    const targetableDevices = devices.filter((device) => device.status !== 'DISABLED');
    const skippedDisabledDevices = devices.length - targetableDevices.length;
    const receipts = targetableDevices.length > 0
        ? await prisma.strategyApplyReceipt.createMany({
            data: targetableDevices.map((device) => ({
                deviceId: device.id,
                strategyId: strategy.id,
                modifiedAt: strategy.modifiedAt,
                status: 'PENDING',
                metadata: {
                    source: 'admin_repush',
                    rustdeskId: device.rustdeskId
                }
            }))
        })
        : { count: 0 };
    const result = {
        policyId: strategy.id,
        modifiedAt: strategy.modifiedAt,
        targetedDevices: devices.length,
        targetableDevices: targetableDevices.length,
        skippedDisabledDevices,
        receiptsCreated: receipts.count
    };
    await auditLog({ action: 'STRATEGY_PUSH', resource: 'strategy', resourceId: strategy.id, actorUserId: req.user?.sub, metadata: result, req });
    res.json(result);
});
function policyReceiptWhere(query) {
    const deviceId = typeof query.deviceId === 'string' ? query.deviceId : undefined;
    const strategyId = typeof query.strategyId === 'string' ? query.strategyId : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;
    return {
        ...(deviceId ? { deviceId } : {}),
        ...(strategyId ? { strategyId } : {}),
        ...(status ? { status: status } : {})
    };
}
router.get('/policy-receipts', requirePermission('strategies.read'), async (req, res) => {
    const receipts = await prisma.strategyApplyReceipt.findMany({
        where: policyReceiptWhere(req.query),
        include: { device: true, strategy: true },
        orderBy: { updatedAt: 'desc' },
        take: 500
    });
    res.json(receipts);
});
router.get('/policy-receipts/export', requirePermission('strategies.read'), async (req, res) => {
    const receipts = await prisma.strategyApplyReceipt.findMany({
        where: policyReceiptWhere(req.query),
        include: { device: true, strategy: true },
        orderBy: { updatedAt: 'desc' },
        take: 10000
    });
    const header = [
        'id',
        'deviceRustdeskId',
        'deviceHostname',
        'strategyName',
        'strategyId',
        'modifiedAt',
        'hash',
        'status',
        'message',
        'metadata',
        'appliedAt',
        'createdAt',
        'updatedAt'
    ];
    const rows = receipts.map((receipt) => [
        receipt.id,
        receipt.device.rustdeskId,
        receipt.device.hostname,
        receipt.strategy?.name,
        receipt.strategyId,
        receipt.modifiedAt,
        receipt.hash,
        receipt.status,
        receipt.message,
        receipt.metadata,
        receipt.appliedAt,
        receipt.createdAt,
        receipt.updatedAt
    ].map(csvCell).join(','));
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'policyReceiptExport',
        actorUserId: req.user?.sub,
        metadata: { filters: req.query, exported: receipts.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="policy-receipts-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.delete('/strategies/:id/assignments/:assignmentId', requirePermission('strategies.write'), async (req, res) => {
    const assignment = await prisma.strategyAssignment.findFirst({
        where: { id: req.params.assignmentId, strategyId: req.params.id },
        include: {
            strategy: { select: { id: true, name: true, modifiedAt: true } },
            device: { select: { id: true, rustdeskId: true, hostname: true } },
            group: { select: { id: true, name: true } }
        }
    });
    if (!assignment) {
        res.status(404).json({ error: 'Policy assignment not found' });
        return;
    }
    await prisma.strategyAssignment.delete({ where: { id: assignment.id } });
    await auditLog({
        action: 'DELETE',
        resource: 'strategyAssignment',
        resourceId: assignment.id,
        actorUserId: req.user?.sub,
        metadata: {
            policy: assignment.strategy,
            targetType: assignment.device ? 'device' : 'group',
            target: assignment.device
                ? { id: assignment.device.id, rustdeskId: assignment.device.rustdeskId, hostname: assignment.device.hostname }
                : { id: assignment.group?.id, name: assignment.group?.name }
        },
        req
    });
    res.json({ ok: true });
});
function addressBookWhere(req) {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
    const shareRule = typeof req.query.shareRule === 'string' ? req.query.shareRule : undefined;
    return {
        AND: [
            canReadAddressBookWhere(req.user?.sub, req.user?.isAdmin),
            {
                ...(ownerId ? { ownerId } : {}),
                ...(shareRule ? { shareRule } : {}),
                ...(q
                    ? {
                        OR: [
                            { name: { contains: q, mode: 'insensitive' } },
                            { guid: { contains: q, mode: 'insensitive' } },
                            { note: { contains: q, mode: 'insensitive' } },
                            { owner: { username: { contains: q, mode: 'insensitive' } } },
                            { owner: { displayName: { contains: q, mode: 'insensitive' } } },
                            { peers: { some: { rustdeskId: { contains: q, mode: 'insensitive' } } } },
                            { peers: { some: { alias: { contains: q, mode: 'insensitive' } } } },
                            { peers: { some: { hostname: { contains: q, mode: 'insensitive' } } } }
                        ]
                    }
                    : {})
            }
        ]
    };
}
router.get('/address-books', requirePermission('addressBooks.read'), async (req, res) => {
    const books = await prisma.addressBook.findMany({
        where: addressBookWhere(req),
        include: {
            owner: { select: { id: true, username: true, displayName: true } },
            peers: true,
            tags: true,
            shares: { include: { user: { select: { id: true, username: true, displayName: true, email: true } } } },
            _count: { select: { peers: true, shares: true, tags: true } }
        },
        orderBy: { updatedAt: 'desc' }
    });
    res.json(books.map((book) => ({
        ...book,
        peers: book.peers.map(serializeAddressBookPeer)
    })));
});
router.get('/address-books/export', requirePermission('addressBooks.read'), async (req, res) => {
    const books = await prisma.addressBook.findMany({
        where: addressBookWhere(req),
        include: {
            owner: { select: { id: true, username: true, displayName: true, email: true } },
            peers: true,
            tags: true,
            shares: { include: { user: { select: { id: true, username: true, displayName: true, email: true } } } },
            _count: { select: { peers: true, shares: true, tags: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 10000
    });
    const header = ['id', 'guid', 'name', 'owner', 'shareRule', 'note', 'peers', 'shares', 'tags', 'passwordProtectedPeers', 'shareUsers', 'tagNames', 'peerRustdeskIds', 'createdAt', 'updatedAt'];
    const rows = books.map((book) => [
        book.id,
        book.guid,
        book.name,
        [book.owner?.username, book.owner?.displayName, book.owner?.email].filter(Boolean).join(' / '),
        book.shareRule,
        book.note,
        book._count.peers,
        book._count.shares,
        book._count.tags,
        book.peers.filter((peer) => hasAddressBookSecret(peer.password)).length,
        book.shares.map((share) => `${share.permission}:${share.user.username}`).join('; '),
        book.tags.map((tag) => tag.name).join('; '),
        book.peers.map((peer) => peer.rustdeskId).join('; '),
        book.createdAt,
        book.updatedAt
    ].map(csvCell).join(','));
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'addressBookExport',
        actorUserId: req.user?.sub,
        metadata: { filters: req.query, exported: books.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="address-books-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.post('/address-books', requirePermission('addressBooks.write'), async (req, res) => {
    const parsed = z.object({
        name: z.string().min(1),
        guid: z.string().min(1).optional(),
        ownerId: z.string().optional(),
        shareRule: z.string().default('read'),
        note: z.string().optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const ownerId = req.user?.isAdmin ? parsed.data.ownerId ?? req.user?.sub : req.user?.sub;
    const guid = parsed.data.guid ?? randomUUID();
    const [owner, duplicateBook] = await Promise.all([
        findAddressBookUser(ownerId),
        prisma.addressBook.findUnique({ where: { guid }, select: { id: true } })
    ]);
    if (ownerId && !owner) {
        res.status(404).json({ error: 'Owner user not found' });
        return;
    }
    if (duplicateBook) {
        res.status(409).json({ error: 'Address book GUID already exists' });
        return;
    }
    const book = await prisma.addressBook.create({
        data: {
            name: parsed.data.name,
            guid,
            ownerId,
            shareRule: parsed.data.shareRule,
            note: parsed.data.note
        }
    });
    await auditLog({
        action: 'CREATE',
        resource: 'addressBook',
        resourceId: book.id,
        actorUserId: req.user?.sub,
        metadata: { guid: book.guid, name: book.name, shareRule: book.shareRule, owner },
        req
    });
    res.json(book);
});
router.patch('/address-books/:id', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const parsed = z.object({
        name: z.string().min(1).optional(),
        ownerId: z.string().nullable().optional(),
        shareRule: z.string().optional(),
        note: z.string().nullable().optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const data = { ...parsed.data };
    if (!req.user?.isAdmin) {
        delete data.ownerId;
    }
    const owner = data.ownerId ? await findAddressBookUser(data.ownerId) : null;
    if (data.ownerId && !owner) {
        res.status(404).json({ error: 'Owner user not found' });
        return;
    }
    const book = await prisma.addressBook.update({ where: { id: req.params.id }, data });
    await auditLog({
        action: 'UPDATE',
        resource: 'addressBook',
        resourceId: book.id,
        actorUserId: req.user?.sub,
        metadata: { changes: Object.keys(data), owner: data.ownerId === null ? null : owner },
        req
    });
    res.json(book);
});
router.delete('/address-books/:id', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    await prisma.addressBook.delete({ where: { id: req.params.id } });
    await auditLog({ action: 'DELETE', resource: 'addressBook', resourceId: req.params.id, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
router.get('/address-books/:id/shares', requirePermission('addressBooks.read'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'read');
    if (!existing)
        return;
    const shares = await prisma.addressBookShare.findMany({
        where: { addressBookId: req.params.id },
        include: { user: { select: { id: true, username: true, displayName: true, email: true } } },
        orderBy: { updatedAt: 'desc' }
    });
    res.json(shares);
});
router.post('/address-books/:id/shares', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const parsed = z.object({
        userId: z.string().min(1),
        permission: z.enum(['read', 'write', 'owner']).default('read')
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const user = await findAddressBookUser(parsed.data.userId);
    if (!user) {
        res.status(404).json({ error: 'Share user not found' });
        return;
    }
    const share = await prisma.addressBookShare.upsert({
        where: { addressBookId_userId: { addressBookId: req.params.id, userId: parsed.data.userId } },
        update: { permission: parsed.data.permission },
        create: { addressBookId: req.params.id, userId: parsed.data.userId, permission: parsed.data.permission },
        include: { user: { select: { id: true, username: true, displayName: true, email: true } } }
    });
    await auditLog({ action: 'UPDATE', resource: 'addressBookShare', resourceId: share.id, actorUserId: req.user?.sub, metadata: share, req });
    res.json(share);
});
router.delete('/address-books/:id/shares/:shareId', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const deleted = await prisma.addressBookShare.deleteMany({ where: { id: req.params.shareId, addressBookId: req.params.id } });
    if (deleted.count === 0) {
        res.status(404).json({ error: 'Address book share not found' });
        return;
    }
    await auditLog({ action: 'DELETE', resource: 'addressBookShare', resourceId: req.params.shareId, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
router.get('/address-books/:id/tags', requirePermission('addressBooks.read'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'read');
    if (!existing)
        return;
    const tags = await prisma.addressBookTag.findMany({
        where: { addressBookId: req.params.id },
        orderBy: { name: 'asc' }
    });
    res.json(tags);
});
router.post('/address-books/:id/tags', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const parsed = z.object({
        name: z.string().min(1),
        color: z.string().nullable().optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const tag = await prisma.addressBookTag.upsert({
        where: { addressBookId_name: { addressBookId: req.params.id, name: parsed.data.name } },
        update: { color: parsed.data.color },
        create: { addressBookId: req.params.id, name: parsed.data.name, color: parsed.data.color }
    });
    await auditLog({ action: 'UPDATE', resource: 'addressBookTag', resourceId: tag.id, actorUserId: req.user?.sub, metadata: tag, req });
    res.json(tag);
});
router.delete('/address-books/:id/tags/:tagId', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const tag = await prisma.addressBookTag.findFirst({ where: { id: req.params.tagId, addressBookId: req.params.id } });
    if (!tag) {
        res.status(404).json({ error: 'Address book tag not found' });
        return;
    }
    const affectedPeers = await prisma.addressBookPeer.findMany({
        where: { addressBookId: req.params.id, tags: { has: tag.name } },
        select: { id: true, tags: true }
    });
    await prisma.$transaction([
        prisma.addressBookTag.delete({ where: { id: tag.id } }),
        ...affectedPeers.map((peer) => prisma.addressBookPeer.update({
            where: { id: peer.id },
            data: { tags: peer.tags.filter((peerTag) => peerTag !== tag.name) }
        }))
    ]);
    await auditLog({
        action: 'DELETE',
        resource: 'addressBookTag',
        resourceId: req.params.tagId,
        actorUserId: req.user?.sub,
        metadata: { name: tag.name, affectedPeers: affectedPeers.length },
        req
    });
    res.json({ ok: true, affectedPeers: affectedPeers.length });
});
router.post('/address-books/:id/peers', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const parsed = z.object({
        rustdeskId: z.string().min(1),
        alias: z.string().optional(),
        username: z.string().optional(),
        hostname: z.string().optional(),
        platform: z.string().optional(),
        password: z.string().optional(),
        note: z.string().optional(),
        tags: z.array(z.string()).default([])
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const missingTags = await unknownAddressBookTags(req.params.id, parsed.data.tags);
    if (missingTags.length > 0) {
        res.status(404).json({ error: 'Address book tags not found', tags: missingTags });
        return;
    }
    const device = await prisma.device.findUnique({ where: { rustdeskId: parsed.data.rustdeskId } });
    const peerData = {
        ...parsed.data,
        password: parsed.data.password ? encryptAddressBookSecret(parsed.data.password) : undefined
    };
    const peer = await prisma.addressBookPeer.upsert({
        where: { addressBookId_rustdeskId: { addressBookId: req.params.id, rustdeskId: parsed.data.rustdeskId } },
        update: { ...peerData, deviceId: device?.id },
        create: { ...peerData, addressBookId: req.params.id, deviceId: device?.id }
    });
    await auditLog({ action: 'UPDATE', resource: 'addressBook', resourceId: req.params.id, actorUserId: req.user?.sub, metadata: serializeAddressBookPeer(peer), req });
    res.json(serializeAddressBookPeer(peer));
});
router.get('/address-books/:id/peers', requirePermission('addressBooks.read'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'read');
    if (!existing)
        return;
    const peers = await prisma.addressBookPeer.findMany({
        where: { addressBookId: req.params.id },
        include: { device: true },
        orderBy: { updatedAt: 'desc' }
    });
    res.json(peers.map(serializeAddressBookPeer));
});
router.delete('/address-books/:id/peers/:peerId', requirePermission('addressBooks.write'), async (req, res) => {
    const existing = await requireAddressBookAccess(req, res, 'write');
    if (!existing)
        return;
    const deleted = await prisma.addressBookPeer.deleteMany({ where: { id: req.params.peerId, addressBookId: req.params.id } });
    if (deleted.count === 0) {
        res.status(404).json({ error: 'Address book peer not found' });
        return;
    }
    await auditLog({ action: 'DELETE', resource: 'addressBookPeer', resourceId: req.params.peerId, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
function connectionWhere(query) {
    const q = typeof query.q === 'string' ? query.q : undefined;
    const deviceId = typeof query.deviceId === 'string' ? query.deviceId : undefined;
    const state = typeof query.state === 'string' ? query.state : undefined;
    const from = typeof query.from === 'string' ? new Date(query.from) : undefined;
    const to = typeof query.to === 'string' ? new Date(query.to) : undefined;
    return {
        ...(deviceId ? { deviceId } : {}),
        ...(state === 'active' ? { endedAt: null } : {}),
        ...(state === 'ended' ? { endedAt: { not: null } } : {}),
        ...(from || to
            ? {
                startedAt: {
                    ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
                    ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {})
                }
            }
            : {}),
        ...(q
            ? {
                OR: [
                    { peerRustdeskId: { contains: q, mode: 'insensitive' } },
                    { direction: { contains: q, mode: 'insensitive' } },
                    { device: { rustdeskId: { contains: q, mode: 'insensitive' } } },
                    { device: { hostname: { contains: q, mode: 'insensitive' } } },
                    { device: { username: { contains: q, mode: 'insensitive' } } }
                ]
            }
            : {})
    };
}
function connectionAuditSummary(connection) {
    return {
        id: connection.id,
        connectionId: connection.connectionId,
        peerRustdeskId: connection.peerRustdeskId,
        direction: connection.direction,
        startedAt: connection.startedAt,
        endedAt: connection.endedAt,
        device: connection.device
            ? {
                id: connection.device.id,
                rustdeskId: connection.device.rustdeskId,
                hostname: connection.device.hostname,
                username: connection.device.username
            }
            : null
    };
}
router.get('/connections', requirePermission('connections.read'), async (req, res) => {
    const records = await prisma.connectionRecord.findMany({
        where: connectionWhere(req.query),
        include: { device: true },
        orderBy: { startedAt: 'desc' },
        take: 500
    });
    res.json(records);
});
router.get('/connections/export', requirePermission('connections.read'), async (req, res) => {
    const records = await prisma.connectionRecord.findMany({
        where: connectionWhere(req.query),
        include: { device: true },
        orderBy: { startedAt: 'desc' },
        take: 10000
    });
    const header = ['id', 'deviceRustdeskId', 'deviceHostname', 'deviceUsername', 'connectionId', 'peerRustdeskId', 'direction', 'startedAt', 'endedAt', 'durationSeconds', 'metadata'];
    const rows = records.map((record) => {
        const durationSeconds = record.endedAt
            ? Math.max(0, Math.round((record.endedAt.getTime() - record.startedAt.getTime()) / 1000))
            : '';
        return [
            record.id,
            record.device?.rustdeskId,
            record.device?.hostname,
            record.device?.username,
            record.connectionId,
            record.peerRustdeskId,
            record.direction,
            record.startedAt,
            record.endedAt,
            durationSeconds,
            record.metadata
        ].map(csvCell).join(',');
    });
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'connectionExport',
        actorUserId: req.user?.sub,
        metadata: { filters: req.query, exported: records.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="connection-records-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.post('/connections/stale-sweep', requirePermission('connections.write'), async (req, res) => {
    const parsed = z.object({
        dryRun: z.boolean().default(true),
        staleAfterMinutes: z.number().int().positive().optional(),
        note: z.string().max(500).optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const staleAfterMinutes = parsed.data.staleAfterMinutes ?? config.CONNECTION_STALE_AFTER_MINUTES;
    const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);
    const candidates = await prisma.connectionRecord.findMany({
        where: { endedAt: null, startedAt: { lt: cutoff } },
        include: { device: true },
        orderBy: { startedAt: 'asc' },
        take: 10000
    });
    if (!parsed.data.dryRun && candidates.length > 0) {
        const endedAt = new Date();
        await prisma.$transaction(candidates.map((candidate) => prisma.connectionRecord.update({
            where: { id: candidate.id },
            data: {
                endedAt,
                metadata: jsonValue({
                    ...(candidate.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata) ? candidate.metadata : {}),
                    staleSweep: {
                        endedBy: req.user?.sub,
                        note: parsed.data.note,
                        at: endedAt.toISOString(),
                        staleAfterMinutes
                    }
                })
            }
        })));
    }
    const result = {
        dryRun: parsed.data.dryRun,
        staleAfterMinutes,
        cutoff,
        candidates: candidates.map((candidate) => ({
            ...candidate,
            metadata: parsed.data.dryRun ? candidate.metadata : {
                ...(candidate.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata) ? candidate.metadata : {}),
                staleSweep: {
                    endedBy: req.user?.sub,
                    note: parsed.data.note,
                    staleAfterMinutes
                }
            }
        })),
        affected: candidates.length
    };
    await auditLog({
        action: parsed.data.dryRun ? 'UPDATE' : 'DISCONNECT',
        resource: 'connectionStaleSweep',
        actorUserId: req.user?.sub,
        metadata: {
            dryRun: parsed.data.dryRun,
            staleAfterMinutes,
            cutoff,
            affected: candidates.length,
            note: parsed.data.note,
            connections: candidates.map(connectionAuditSummary)
        },
        req
    });
    res.json(result);
});
router.post('/connections/:id/end', requirePermission('connections.write'), async (req, res) => {
    const parsed = z.object({
        endedAt: z.string().datetime().optional(),
        note: z.string().optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const existing = await prisma.connectionRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) {
        res.status(404).json({ error: 'Connection record not found' });
        return;
    }
    if (existing.endedAt) {
        res.status(409).json({ error: 'Connection record is already ended' });
        return;
    }
    const endedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : new Date();
    if (isFutureDate(endedAt)) {
        res.status(400).json({ error: 'Connection endedAt cannot be in the future' });
        return;
    }
    if (endedAt < existing.startedAt) {
        res.status(400).json({ error: 'Connection endedAt cannot be before startedAt' });
        return;
    }
    const metadata = jsonValue({
        ...(existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {}),
        adminEnd: {
            endedBy: req.user?.sub,
            note: parsed.data.note,
            at: new Date().toISOString()
        }
    });
    const connection = await prisma.connectionRecord.update({
        where: { id: req.params.id },
        data: {
            endedAt,
            metadata
        },
        include: { device: true }
    });
    await auditLog({
        action: 'DISCONNECT',
        resource: 'connection',
        resourceId: connection.id,
        actorUserId: req.user?.sub,
        metadata: {
            note: parsed.data.note,
            connection: connectionAuditSummary(connection)
        },
        req
    });
    res.json(connection);
});
router.delete('/connections/:id', requirePermission('connections.write'), async (req, res) => {
    const existing = await prisma.connectionRecord.findUnique({ where: { id: req.params.id }, include: { device: true } });
    if (!existing) {
        res.status(404).json({ error: 'Connection record not found' });
        return;
    }
    await prisma.connectionRecord.delete({ where: { id: req.params.id } });
    await auditLog({
        action: 'DELETE',
        resource: 'connection',
        resourceId: req.params.id,
        actorUserId: req.user?.sub,
        metadata: { connection: connectionAuditSummary(existing) },
        req
    });
    res.json({ ok: true });
});
function recordingWhere(query) {
    const q = typeof query.q === 'string' ? query.q : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;
    const deviceId = typeof query.deviceId === 'string' ? query.deviceId : undefined;
    return {
        ...(deviceId ? { deviceId } : {}),
        ...(status ? { status: status } : {}),
        ...(q
            ? {
                OR: [
                    { filename: { contains: q, mode: 'insensitive' } },
                    { device: { rustdeskId: { contains: q, mode: 'insensitive' } } },
                    { device: { hostname: { contains: q, mode: 'insensitive' } } }
                ]
            }
            : {})
    };
}
function validateRecordingTimeline(startedAt, completedAt) {
    return !startedAt || !completedAt || completedAt >= startedAt;
}
router.get('/recordings', requirePermission('recordings.read'), async (req, res) => {
    const recordings = await prisma.recording.findMany({
        where: recordingWhere(req.query),
        include: { device: true },
        orderBy: { startedAt: 'desc' },
        take: 500
    });
    res.json(recordings.map((recording) => ({ ...recording, sizeBytes: recording.sizeBytes.toString() })));
});
router.get('/recordings/export', requirePermission('recordings.read'), async (req, res) => {
    const recordings = await prisma.recording.findMany({
        where: recordingWhere(req.query),
        include: { device: true },
        orderBy: { startedAt: 'desc' },
        take: 10000
    });
    const header = [
        'id',
        'deviceRustdeskId',
        'deviceHostname',
        'filename',
        'status',
        'sizeBytes',
        'startedAt',
        'completedAt',
        'metadata'
    ];
    const rows = recordings.map((recording) => [
        recording.id,
        recording.device?.rustdeskId,
        recording.device?.hostname,
        recording.filename,
        recording.status,
        recording.sizeBytes.toString(),
        recording.startedAt,
        recording.completedAt,
        recording.metadata
    ].map(csvCell).join(','));
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'recordingExport',
        actorUserId: req.user?.sub,
        metadata: { filters: req.query, exported: recordings.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="recordings-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.post('/recordings/retention', requirePermission('recordings.write'), async (req, res) => {
    const parsed = z.object({
        dryRun: z.boolean().default(true),
        retentionDays: z.number().int().min(0).optional(),
        maxTotalGb: z.number().min(0).optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const result = await applyRecordingRetention(parsed.data);
    await auditLog({
        action: parsed.data.dryRun ? 'UPDATE' : 'DELETE',
        resource: 'recordingRetention',
        actorUserId: req.user?.sub,
        metadata: result,
        req
    });
    res.json(result);
});
router.post('/recordings/upload', requirePermission('recordings.write'), upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'Missing recording file' });
        return;
    }
    const parsed = z.object({
        deviceId: z.string().optional(),
        rustdeskId: z.string().optional(),
        startedAt: z.string().datetime().optional(),
        metadata: z.string().optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const device = parsed.data.deviceId
        ? await prisma.device.findUnique({ where: { id: parsed.data.deviceId } })
        : parsed.data.rustdeskId
            ? await prisma.device.findUnique({ where: { rustdeskId: parsed.data.rustdeskId } })
            : null;
    if ((parsed.data.deviceId || parsed.data.rustdeskId) && !device) {
        res.status(404).json({ error: 'Recording device not found' });
        return;
    }
    let metadata = { uploadedBy: 'admin', originalName: file.originalname };
    if (parsed.data.metadata) {
        try {
            metadata = jsonValue({ ...JSON.parse(parsed.data.metadata), uploadedBy: 'admin', originalName: file.originalname });
        }
        catch {
            res.status(400).json({ error: 'metadata must be valid JSON' });
            return;
        }
    }
    const safeName = `${Date.now()}-${nanoid(8)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const startedAt = parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date();
    const completedAt = new Date();
    if (!validateRecordingTimeline(startedAt, completedAt)) {
        res.status(400).json({ error: 'Recording completedAt cannot be before startedAt' });
        return;
    }
    await fs.mkdir(config.RECORDING_DIR, { recursive: true });
    const targetPath = path.resolve(config.RECORDING_DIR, safeName);
    await fs.writeFile(targetPath, file.buffer);
    const recording = await prisma.recording.create({
        data: {
            deviceId: device?.id,
            filename: file.originalname,
            path: targetPath,
            sizeBytes: BigInt(file.size),
            status: 'COMPLETED',
            startedAt,
            completedAt,
            metadata
        },
        include: { device: true }
    });
    await auditLog({
        action: 'RECORD_UPLOAD',
        resource: 'recording',
        resourceId: recording.id,
        actorUserId: req.user?.sub,
        metadata: { deviceId: device?.id, filename: file.originalname, sizeBytes: file.size },
        req
    });
    res.json({ ...recording, sizeBytes: recording.sizeBytes.toString() });
});
router.get('/recordings/:id/download', requirePermission('recordings.read'), async (req, res) => {
    const recording = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
    }
    const metadata = { filename: recording.filename, sizeBytes: recording.sizeBytes.toString(), deviceId: recording.deviceId };
    const stream = createReadStream(recording.path);
    stream.once('open', async () => {
        try {
            await auditLog({
                action: 'RECORD_DOWNLOAD',
                resource: 'recording',
                resourceId: recording.id,
                actorUserId: req.user?.sub,
                metadata: { ...metadata, result: 'started' },
                req
            });
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(recording.filename)}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            stream.pipe(res);
        }
        catch (error) {
            stream.destroy(error instanceof Error ? error : undefined);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Recording download audit failed' });
            }
            else {
                res.destroy(error instanceof Error ? error : undefined);
            }
        }
    });
    stream.once('error', async (error) => {
        try {
            await auditLog({
                action: 'RECORD_DOWNLOAD',
                resource: 'recording',
                resourceId: recording.id,
                actorUserId: req.user?.sub,
                metadata: { ...metadata, result: 'failed', errorCode: error.code ?? 'UNKNOWN' },
                req
            });
        }
        catch {
            // Preserve the client-facing stream failure even if the audit sink is unavailable.
        }
        if (!res.headersSent) {
            res.status(error.code === 'ENOENT' ? 404 : 500).json({
                error: error.code === 'ENOENT' ? 'Recording file not found' : 'Recording download failed'
            });
            return;
        }
        res.destroy(error);
    });
});
router.patch('/recordings/:id', requirePermission('recordings.write'), async (req, res) => {
    const parsed = z.object({
        filename: z.string().min(1).optional(),
        status: z.enum(['UPLOADING', 'COMPLETED', 'REMOVED', 'FAILED']).optional(),
        startedAt: z.string().datetime().nullable().optional(),
        completedAt: z.string().datetime().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional()
    }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const existing = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!existing) {
        res.status(404).json({ error: 'Recording not found' });
        return;
    }
    const nextStartedAt = parsed.data.startedAt === null ? existing.startedAt : parsed.data.startedAt ? new Date(parsed.data.startedAt) : existing.startedAt;
    const nextCompletedAt = parsed.data.completedAt === null ? null : parsed.data.completedAt ? new Date(parsed.data.completedAt) : existing.completedAt;
    if (!validateRecordingTimeline(nextStartedAt, nextCompletedAt)) {
        res.status(400).json({ error: 'Recording completedAt cannot be before startedAt' });
        return;
    }
    const recording = await prisma.recording.update({
        where: { id: req.params.id },
        data: {
            filename: parsed.data.filename,
            status: parsed.data.status,
            startedAt: parsed.data.startedAt === null ? existing.startedAt : parsed.data.startedAt ? nextStartedAt : undefined,
            completedAt: parsed.data.completedAt === null ? null : parsed.data.completedAt ? nextCompletedAt : undefined,
            metadata: parsed.data.metadata === null ? Prisma.JsonNull : parsed.data.metadata ? jsonValue(parsed.data.metadata) : undefined
        },
        include: { device: true }
    });
    await auditLog({
        action: 'UPDATE',
        resource: 'recording',
        resourceId: recording.id,
        actorUserId: req.user?.sub,
        metadata: { beforeStatus: existing.status, afterStatus: recording.status },
        req
    });
    res.json({ ...recording, sizeBytes: recording.sizeBytes.toString() });
});
router.delete('/recordings/:id', requirePermission('recordings.write'), async (req, res) => {
    const recording = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
    }
    let fileState = 'deleted';
    try {
        await fs.unlink(recording.path);
    }
    catch (error) {
        const fsError = error;
        if (fsError.code !== 'ENOENT') {
            await auditLog({
                action: 'DELETE',
                resource: 'recording',
                resourceId: req.params.id,
                actorUserId: req.user?.sub,
                metadata: {
                    result: 'failed',
                    reason: 'file_delete_failed',
                    errorCode: fsError.code ?? 'UNKNOWN',
                    filename: recording.filename,
                    sizeBytes: recording.sizeBytes.toString(),
                    deviceId: recording.deviceId
                },
                req
            });
            res.status(500).json({ error: 'Recording file delete failed' });
            return;
        }
        fileState = 'missing';
    }
    await prisma.recording.update({ where: { id: req.params.id }, data: { status: 'REMOVED' } });
    await auditLog({
        action: 'DELETE',
        resource: 'recording',
        resourceId: req.params.id,
        actorUserId: req.user?.sub,
        metadata: {
            result: 'removed',
            fileState,
            filename: recording.filename,
            sizeBytes: recording.sizeBytes.toString(),
            deviceId: recording.deviceId
        },
        req
    });
    res.json({ ok: true, fileState });
});
function auditLogWhere(query) {
    const action = typeof query.action === 'string' ? query.action : undefined;
    const resource = typeof query.resource === 'string' ? query.resource : undefined;
    const actorUserId = typeof query.actorUserId === 'string' ? query.actorUserId : undefined;
    const q = typeof query.q === 'string' ? query.q : undefined;
    const from = typeof query.from === 'string' ? new Date(query.from) : undefined;
    const to = typeof query.to === 'string' ? new Date(query.to) : undefined;
    return {
        ...(action ? { action: action } : {}),
        ...(resource ? { resource: { contains: resource, mode: 'insensitive' } } : {}),
        ...(actorUserId ? { actorUserId } : {}),
        ...(from || to
            ? {
                createdAt: {
                    ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
                    ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {})
                }
            }
            : {}),
        ...(q
            ? {
                OR: [
                    { resource: { contains: q, mode: 'insensitive' } },
                    { resourceId: { contains: q, mode: 'insensitive' } },
                    { ipAddress: { contains: q, mode: 'insensitive' } },
                    { userAgent: { contains: q, mode: 'insensitive' } },
                    { metadata: { string_contains: q } },
                    { actor: { username: { contains: q, mode: 'insensitive' } } }
                ]
            }
            : {})
    };
}
function csvCell(value) {
    if (value === null || value === undefined)
        return '';
    const rawText = typeof value === 'string'
        ? value
        : value instanceof Date
            ? value.toISOString()
            : JSON.stringify(sanitizeAuditMetadata(value));
    const text = escapeCsvFormula(rawText);
    return `"${text.replace(/"/g, '""')}"`;
}
function isFutureDate(value, now = new Date()) {
    return value.getTime() > now.getTime() + MAX_CLIENT_CLOCK_SKEW_MS;
}
function jsonValue(value) {
    return value;
}
function serializeAddressBookPeer(peer) {
    const { password: _password, ...safePeer } = peer;
    return {
        ...safePeer,
        passwordConfigured: hasAddressBookSecret(_password)
    };
}
router.get('/audit-logs', requirePermission('audit.read'), async (req, res) => {
    const logs = await prisma.auditLog.findMany({
        where: auditLogWhere(req.query),
        include: { actor: { select: { id: true, username: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500
    });
    res.json(logs);
});
router.get('/audit-logs/verify', requirePermission('audit.read'), async (req, res) => {
    const limit = typeof req.query.limit === 'string' && /^\d+$/.test(req.query.limit)
        ? Math.min(100000, Math.max(1, Number(req.query.limit)))
        : 10000;
    const result = await verifyAuditChain(limit);
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'auditLogVerify',
        actorUserId: req.user?.sub,
        metadata: {
            limit,
            ok: result.ok,
            checked: result.checked,
            total: result.total,
            missingHash: result.missingHash,
            truncated: result.truncated,
            headHash: result.headHash,
            issues: result.issues.length
        },
        req
    });
    res.status(result.ok ? 200 : 409).json(result);
});
router.get('/audit-logs/export', requirePermission('audit.read'), async (req, res) => {
    const logs = await prisma.auditLog.findMany({
        where: auditLogWhere(req.query),
        include: { actor: { select: { id: true, username: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10000
    });
    const header = ['id', 'createdAt', 'action', 'resource', 'resourceId', 'actorUsername', 'actorDisplayName', 'ipAddress', 'userAgent', 'previousHash', 'entryHash', 'metadata'];
    const rows = logs.map((log) => [
        log.id,
        log.createdAt,
        log.action,
        log.resource,
        log.resourceId,
        log.actor?.username,
        log.actor?.displayName,
        log.ipAddress,
        log.userAgent,
        log.previousHash,
        log.entryHash,
        log.metadata
    ].map(csvCell).join(','));
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'auditLogExport',
        actorUserId: req.user?.sub,
        metadata: {
            filters: req.query,
            exported: logs.length,
            truncated: logs.length >= 10000,
            newestCreatedAt: logs[0]?.createdAt,
            oldestCreatedAt: logs.at(-1)?.createdAt,
            newestEntryHash: logs[0]?.entryHash,
            oldestEntryHash: logs.at(-1)?.entryHash
        },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.get('/identity-providers', requirePermission('identityProviders.read'), async (_req, res) => {
    const providers = await prisma.identityProvider.findMany({
        select: {
            id: true,
            type: true,
            name: true,
            issuerUrl: true,
            clientId: true,
            clientSecret: true,
            corpId: true,
            agentId: true,
            appKey: true,
            appSecret: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { accounts: true } }
        },
        orderBy: { updatedAt: 'desc' }
    });
    res.json(providers.map(serializeIdentityProvider));
});
router.get('/identity-providers/export', requirePermission('identityProviders.read'), async (req, res) => {
    const providers = await prisma.identityProvider.findMany({
        include: { _count: { select: { accounts: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10000
    });
    const header = [
        'id',
        'type',
        'name',
        'enabled',
        'ready',
        'missing',
        'issuerUrl',
        'clientId',
        'corpId',
        'agentId',
        'appKey',
        'clientSecretConfigured',
        'appSecretConfigured',
        'linkedAccounts',
        'startUrl',
        'callbackUrl',
        'createdAt',
        'updatedAt'
    ];
    const rows = providers.map((provider) => {
        const diagnostics = identityProviderDiagnostics(provider);
        return [
            provider.id,
            provider.type,
            provider.name,
            provider.enabled,
            diagnostics.ready,
            diagnostics.missing.join(';'),
            provider.issuerUrl,
            provider.clientId,
            provider.corpId,
            provider.agentId,
            provider.appKey,
            Boolean(provider.clientSecret),
            Boolean(provider.appSecret),
            provider._count.accounts,
            diagnostics.startUrl,
            diagnostics.callbackUrl,
            provider.createdAt,
            provider.updatedAt
        ].map(csvCell).join(',');
    });
    await auditLog({
        action: 'AUDIT_EXPORT',
        resource: 'identityProviderExport',
        actorUserId: req.user?.sub,
        metadata: { exported: providers.length },
        req
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="identity-providers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});
router.post('/identity-providers', requirePermission('identityProviders.write'), async (req, res) => {
    const parsed = identityProviderSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const data = encryptIdentityProviderSecretFields(normalizeIdentityProviderCreateData(parsed.data));
    const duplicate = await prisma.identityProvider.findFirst({
        where: { type: data.type, name: data.name },
        select: { id: true }
    });
    if (duplicate) {
        res.status(409).json({ error: 'Identity provider with this type and name already exists' });
        return;
    }
    const configError = validateIdentityProviderConfig(data);
    if (configError) {
        res.status(400).json({ error: configError });
        return;
    }
    const provider = await prisma.identityProvider.create({ data });
    await auditLog({
        action: 'CREATE',
        resource: 'identityProvider',
        resourceId: provider.id,
        actorUserId: req.user?.sub,
        metadata: { provider: identityProviderAuditSummary(provider) },
        req
    });
    res.json(serializeIdentityProvider(provider));
});
router.patch('/identity-providers/:id', requirePermission('identityProviders.write'), async (req, res) => {
    const parsed = identityProviderSchema.partial({ type: true }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const existing = await prisma.identityProvider.findUnique({ where: { id: req.params.id } });
    if (!existing) {
        res.status(404).json({ error: 'Identity provider not found' });
        return;
    }
    const data = encryptIdentityProviderSecretFields(normalizeIdentityProviderUpdateData(parsed.data, existing));
    const nextProvider = { ...existing, ...data };
    const duplicate = await prisma.identityProvider.findFirst({
        where: { type: nextProvider.type, name: nextProvider.name, id: { not: existing.id } },
        select: { id: true }
    });
    if (duplicate) {
        res.status(409).json({ error: 'Identity provider with this type and name already exists' });
        return;
    }
    const configError = validateIdentityProviderConfig(nextProvider, true);
    if (configError) {
        res.status(400).json({ error: configError });
        return;
    }
    const beforeSummary = identityProviderAuditSummary(existing);
    const provider = await prisma.identityProvider.update({ where: { id: req.params.id }, data });
    const afterSummary = identityProviderAuditSummary(provider);
    await auditLog({
        action: 'UPDATE',
        resource: 'identityProvider',
        resourceId: provider.id,
        actorUserId: req.user?.sub,
        metadata: {
            changedFields: changedSummaryFields(beforeSummary, afterSummary),
            before: beforeSummary,
            after: afterSummary
        },
        req
    });
    res.json(serializeIdentityProvider(provider));
});
router.delete('/identity-providers/:id', requirePermission('identityProviders.write'), async (req, res) => {
    const force = req.query.force === 'true';
    const existing = await prisma.identityProvider.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { accounts: true } } }
    });
    if (!existing) {
        res.status(404).json({ error: 'Identity provider not found' });
        return;
    }
    if (existing._count.accounts > 0 && !force) {
        res.status(409).json({
            error: 'Identity provider has linked accounts',
            linkedAccounts: existing._count.accounts,
            forceRequired: true
        });
        return;
    }
    await prisma.identityProvider.delete({ where: { id: req.params.id } });
    await auditLog({
        action: 'DELETE',
        resource: 'identityProvider',
        resourceId: req.params.id,
        actorUserId: req.user?.sub,
        metadata: { provider: identityProviderAuditSummary(existing), linkedAccounts: existing._count.accounts, force },
        req
    });
    res.json({ ok: true, linkedAccounts: existing._count.accounts });
});
export default router;
