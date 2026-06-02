import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { auditLog, escapeCsvFormula, sanitizeAuditMetadata } from '../services/audit.js';
import { resolveDevicePolicyById } from '../services/policies.js';
import { generateDeviceClientToken, hashClientToken } from '../auth/clientToken.js';

const router = Router();

const upsertDeviceSchema = z.object({
  rustdeskId: z.string().min(1),
  uuid: z.string().optional(),
  hostname: z.string().optional(),
  username: z.string().optional(),
  platform: z.string().optional(),
  os: z.string().optional(),
  version: z.string().optional(),
  ipAddress: z.string().optional(),
  status: z.enum(['OFFLINE', 'ONLINE', 'DISABLED']).optional(),
  groupId: z.string().nullable().optional(),
  sysinfo: z.unknown().optional()
});

const bulkDeviceSchema = z.object({
  deviceIds: z.array(z.string().min(1)).min(1),
  groupId: z.string().nullable().optional(),
  status: z.enum(['OFFLINE', 'ONLINE', 'DISABLED']).optional(),
  strategyId: z.string().optional()
}).refine((value) => value.groupId !== undefined || value.status !== undefined || value.strategyId, 'groupId, status, or strategyId is required');

function toDeviceData(data: z.infer<typeof upsertDeviceSchema> | Partial<z.infer<typeof upsertDeviceSchema>>) {
  const online = data.status === 'ONLINE'
    ? true
    : data.status === 'OFFLINE' || data.status === 'DISABLED'
      ? false
      : undefined;
  return {
    ...data,
    online,
    sysinfo: data.sysinfo as Prisma.InputJsonValue | undefined
  } satisfies Prisma.DeviceUncheckedUpdateInput;
}

function serializeDevice<T extends { clientTokenHash?: string | null }>(device: T) {
  const { clientTokenHash: _clientTokenHash, ...safeDevice } = device;
  return {
    ...safeDevice,
    clientTokenConfigured: Boolean(_clientTokenHash)
  };
}

async function markStaleDevicesOffline() {
  const cutoff = new Date(Date.now() - config.DEVICE_OFFLINE_AFTER_SECONDS * 1000);
  await prisma.device.updateMany({
    where: {
      online: true,
      status: { not: 'DISABLED' },
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }]
    },
    data: { online: false, status: 'OFFLINE' }
  });
}

function deviceWhere(query: Record<string, unknown>): Prisma.DeviceWhereInput {
  const q = typeof query.q === 'string' ? query.q : undefined;
  const status = typeof query.status === 'string' ? query.status : undefined;
  const groupId = typeof query.groupId === 'string' ? query.groupId : undefined;

  return {
    ...(q
      ? {
          OR: [
            { rustdeskId: { contains: q, mode: 'insensitive' } },
            { hostname: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { platform: { contains: q, mode: 'insensitive' } },
            { os: { contains: q, mode: 'insensitive' } },
            { version: { contains: q, mode: 'insensitive' } },
            { ipAddress: { contains: q, mode: 'insensitive' } }
          ]
        }
      : {}),
    ...(status === 'ONLINE' ? { online: true, status: { not: 'DISABLED' as const } } : {}),
    ...(status === 'OFFLINE' ? { online: false, status: { not: 'DISABLED' as const } } : {}),
    ...(status === 'DISABLED' ? { status: 'DISABLED' as const } : {}),
    ...(groupId ? { groupId } : {})
  };
}

function groupWhere(query: Record<string, unknown>): Prisma.DeviceGroupWhereInput {
  const q = typeof query.q === 'string' ? query.q : undefined;
  return {
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

function csvCell(value: unknown) {
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === 'object' && value !== null
      ? JSON.stringify(sanitizeAuditMetadata(value))
      : String(value ?? '');
  const safeText = escapeCsvFormula(text);
  return `"${safeText.replaceAll('"', '""')}"`;
}

async function validateDeviceGroupTarget(groupId: string | null | undefined) {
  if (!groupId) return null;
  return prisma.deviceGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true } });
}

async function validateStrategyTarget(strategyId: string | undefined) {
  if (!strategyId) return null;
  return prisma.strategy.findUnique({ where: { id: strategyId }, select: { id: true, name: true, modifiedAt: true } });
}

async function findDuplicateDeviceGroupName(name: string | undefined, exceptId?: string) {
  if (!name) return null;
  return prisma.deviceGroup.findFirst({
    where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true }
  });
}

async function findDuplicateDeviceIdentity(input: { rustdeskId?: string; uuid?: string | null }, exceptId?: string) {
  const checks: Prisma.DeviceWhereInput[] = [];
  if (input.rustdeskId) checks.push({ rustdeskId: input.rustdeskId });
  if (input.uuid) checks.push({ uuid: input.uuid });
  if (checks.length === 0) return [];

  const duplicates = await prisma.device.findMany({
    where: {
      OR: checks,
      ...(exceptId ? { id: { not: exceptId } } : {})
    },
    select: { id: true, rustdeskId: true, uuid: true }
  });
  const fields = new Set<string>();
  for (const device of duplicates) {
    if (input.rustdeskId && device.rustdeskId === input.rustdeskId) fields.add('rustdeskId');
    if (input.uuid && device.uuid === input.uuid) fields.add('uuid');
  }
  return [...fields].sort();
}

router.use(requireAuth);

router.get('/devices', requirePermission('devices.read'), async (req, res) => {
  await markStaleDevicesOffline();
  const devices = await prisma.device.findMany({
    where: deviceWhere(req.query),
    include: { group: true },
    orderBy: [{ online: 'desc' }, { lastSeenAt: 'desc' }]
  });
  res.json(devices.map(serializeDevice));
});

router.get('/devices/export', requirePermission('devices.read'), async (req, res) => {
  await markStaleDevicesOffline();
  const devices = await prisma.device.findMany({
    where: deviceWhere(req.query),
    include: {
      group: true,
      _count: { select: { connections: true, recordings: true, strategyReceipts: true } }
    },
    orderBy: [{ online: 'desc' }, { lastSeenAt: 'desc' }],
    take: 10000
  });
  const header = [
    'id',
    'rustdeskId',
    'uuid',
    'hostname',
    'username',
    'platform',
    'os',
    'version',
    'ipAddress',
    'status',
    'online',
    'group',
    'lastSeenAt',
    'clientTokenConfigured',
    'clientTokenIssuedAt',
    'lastClientAuthAt',
    'connections',
    'recordings',
    'policyReceipts',
    'createdAt',
    'updatedAt'
  ];
  const rows = devices.map((device) => [
    device.id,
    device.rustdeskId,
    device.uuid,
    device.hostname,
    device.username,
    device.platform,
    device.os,
    device.version,
    device.ipAddress,
    device.status,
    device.online,
    device.group?.name,
    device.lastSeenAt,
    Boolean(device.clientTokenHash),
    device.clientTokenIssuedAt,
    device.lastClientAuthAt,
    device._count.connections,
    device._count.recordings,
    device._count.strategyReceipts,
    device.createdAt,
    device.updatedAt
  ].map(csvCell).join(','));

  await auditLog({
    action: 'AUDIT_EXPORT',
    resource: 'deviceExport',
    actorUserId: req.user?.sub,
    metadata: { filters: req.query, exported: devices.length },
    req
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="devices-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});

router.get('/devices/:id', requirePermission('devices.read'), async (req, res) => {
  await markStaleDevicesOffline();
  const device = await prisma.device.findUnique({
    where: { id: req.params.id },
    include: {
      group: true,
      heartbeats: { orderBy: { createdAt: 'desc' }, take: 20 },
      connections: { orderBy: { startedAt: 'desc' }, take: 20 },
      recordings: { orderBy: { startedAt: 'desc' }, take: 20 },
      strategyAssignments: { include: { strategy: true }, orderBy: { createdAt: 'desc' } },
      strategyReceipts: { include: { strategy: true }, orderBy: { updatedAt: 'desc' }, take: 20 },
      addressPeers: { include: { addressBook: true }, orderBy: { updatedAt: 'desc' }, take: 20 }
    }
  });

  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const policyPreview = await resolveDevicePolicyById(device.id);
  res.json({
    ...serializeDevice(device),
    policyPreview: {
      modifiedAt: policyPreview.modifiedAt,
      hash: policyPreview.hash,
      policies: policyPreview.policies,
      config: policyPreview.config,
      configSources: policyPreview.configSources
    },
    recordings: device.recordings.map((recording) => ({ ...recording, sizeBytes: recording.sizeBytes.toString() }))
  });
});

router.post('/devices/:id/client-token', requirePermission('devices.write'), async (req, res) => {
  const device = await prisma.device.findUnique({ where: { id: req.params.id }, select: { id: true, rustdeskId: true } });
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const token = generateDeviceClientToken();
  const updated = await prisma.device.update({
    where: { id: req.params.id },
    data: {
      clientTokenHash: hashClientToken(token),
      clientTokenIssuedAt: new Date(),
      lastClientAuthAt: null
    },
    select: {
      id: true,
      rustdeskId: true,
      clientTokenIssuedAt: true,
      lastClientAuthAt: true
    }
  });
  await auditLog({
    action: 'UPDATE',
    resource: 'deviceClientToken',
    resourceId: device.id,
    actorUserId: req.user?.sub,
    metadata: { rustdeskId: device.rustdeskId, rotated: true },
    req
  });
  res.json({ ...updated, token });
});

router.delete('/devices/:id/client-token', requirePermission('devices.write'), async (req, res) => {
  const device = await prisma.device.findUnique({ where: { id: req.params.id }, select: { id: true, rustdeskId: true } });
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  await prisma.device.update({
    where: { id: req.params.id },
    data: {
      clientTokenHash: null,
      clientTokenIssuedAt: null,
      lastClientAuthAt: null
    }
  });
  await auditLog({
    action: 'DELETE',
    resource: 'deviceClientToken',
    resourceId: device.id,
    actorUserId: req.user?.sub,
    metadata: { rustdeskId: device.rustdeskId },
    req
  });
  res.json({ ok: true });
});

router.post('/devices/offline-sweep', requirePermission('devices.write'), async (req, res) => {
  await markStaleDevicesOffline();
  await auditLog({ action: 'UPDATE', resource: 'device', actorUserId: req.user?.sub, metadata: { sweep: 'offline' }, req });
  res.json({ ok: true });
});

router.post('/devices', requirePermission('devices.write'), async (req, res) => {
  const parsed = upsertDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.groupId) {
    const group = await validateDeviceGroupTarget(parsed.data.groupId);
    if (!group) {
      res.status(404).json({ error: 'Device group not found' });
      return;
    }
  }
  const existing = await prisma.device.findUnique({ where: { rustdeskId: parsed.data.rustdeskId }, select: { id: true } });
  const duplicateFields = await findDuplicateDeviceIdentity({ uuid: parsed.data.uuid }, existing?.id);
  if (duplicateFields.length > 0) {
    res.status(409).json({ error: 'Device identity already exists', fields: duplicateFields });
    return;
  }

  const device = await prisma.device.upsert({
    where: { rustdeskId: parsed.data.rustdeskId },
    update: toDeviceData(parsed.data),
    create: toDeviceData(parsed.data) as Prisma.DeviceUncheckedCreateInput
  });
  await auditLog({ action: 'UPDATE', resource: 'device', resourceId: device.id, actorUserId: req.user?.sub, req });
  res.json(serializeDevice(device));
});

router.post('/devices/bulk', requirePermission('devices.write'), async (req, res) => {
  const parsed = bulkDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const devices = await prisma.device.findMany({
    where: { id: { in: parsed.data.deviceIds } },
    select: { id: true, rustdeskId: true, status: true }
  });
  const foundIds = new Set(devices.map((device) => device.id));
  const missingDeviceIds = parsed.data.deviceIds.filter((deviceId) => !foundIds.has(deviceId));
  if (missingDeviceIds.length > 0) {
    res.status(404).json({ error: 'Some devices were not found', deviceIds: missingDeviceIds });
    return;
  }

  const group = await validateDeviceGroupTarget(parsed.data.groupId);
  if (parsed.data.groupId && !group) {
    res.status(404).json({ error: 'Device group not found' });
    return;
  }

  const strategy = await validateStrategyTarget(parsed.data.strategyId);
  if (parsed.data.strategyId && !strategy) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }

  const updates: Prisma.DeviceUncheckedUpdateManyInput = {};
  if (parsed.data.groupId !== undefined) updates.groupId = parsed.data.groupId;
  if (parsed.data.status) {
    updates.status = parsed.data.status;
    updates.online = parsed.data.status === 'ONLINE';
  }

  const result = Object.keys(updates).length
    ? await prisma.device.updateMany({ where: { id: { in: parsed.data.deviceIds } }, data: updates })
    : { count: 0 };

  let assignments = 0;
  let skippedDisabledDevices = 0;
  if (strategy) {
    const assignableDevices = devices.filter((device) => device.status !== 'DISABLED');
    skippedDisabledDevices = devices.length - assignableDevices.length;
    const created = await prisma.strategyAssignment.createMany({
      data: assignableDevices.map((device) => ({ strategyId: strategy.id, deviceId: device.id })),
      skipDuplicates: true
    });
    assignments = created.count;
  }

  await auditLog({
    action: 'UPDATE',
    resource: 'device',
    actorUserId: req.user?.sub,
    metadata: {
      deviceIds: devices.map((device) => device.id),
      rustdeskIds: devices.map((device) => device.rustdeskId),
      group: group ? { id: group.id, name: group.name } : parsed.data.groupId === null ? null : undefined,
      status: parsed.data.status,
      strategy,
      updated: result.count,
      assignments,
      skippedDisabledDevices
    },
    req
  });
  res.json({ ok: true, updated: result.count, assignments, skippedDisabledDevices });
});

router.patch('/devices/:id', requirePermission('devices.write'), async (req, res) => {
  const parsed = upsertDeviceSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.device.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  if (parsed.data.groupId) {
    const group = await validateDeviceGroupTarget(parsed.data.groupId);
    if (!group) {
      res.status(404).json({ error: 'Device group not found' });
      return;
    }
  }
  const duplicateFields = await findDuplicateDeviceIdentity({ rustdeskId: parsed.data.rustdeskId, uuid: parsed.data.uuid }, existing.id);
  if (duplicateFields.length > 0) {
    res.status(409).json({ error: 'Device identity already exists', fields: duplicateFields });
    return;
  }
  const device = await prisma.device.update({ where: { id: req.params.id }, data: toDeviceData(parsed.data) });
  await auditLog({ action: 'UPDATE', resource: 'device', resourceId: device.id, actorUserId: req.user?.sub, req });
  res.json(serializeDevice(device));
});

router.delete('/devices/:id', requirePermission('devices.write'), async (req, res) => {
  const deleted = await prisma.device.deleteMany({ where: { id: req.params.id } });
  if (deleted.count === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  await auditLog({ action: 'DELETE', resource: 'device', resourceId: req.params.id, actorUserId: req.user?.sub, req });
  res.json({ ok: true });
});

router.get('/device-groups', requirePermission('groups.read'), async (req, res) => {
  const groups = await prisma.deviceGroup.findMany({ where: groupWhere(req.query), include: { _count: { select: { devices: true } } }, orderBy: { name: 'asc' } });
  res.json(groups);
});

router.get('/device-groups/export', requirePermission('groups.read'), async (req, res) => {
  const groups = await prisma.deviceGroup.findMany({
    where: groupWhere(req.query),
    include: {
      devices: { select: { rustdeskId: true }, orderBy: { rustdeskId: 'asc' }, take: 1000 },
      strategies: { include: { strategy: true }, orderBy: { createdAt: 'desc' } },
      _count: { select: { devices: true, strategies: true } }
    },
    orderBy: { name: 'asc' },
    take: 10000
  });
  const header = [
    'id',
    'name',
    'description',
    'devices',
    'strategies',
    'deviceRustdeskIds',
    'strategyNames',
    'createdAt',
    'updatedAt'
  ];
  const rows = groups.map((group) => [
    group.id,
    group.name,
    group.description,
    group._count.devices,
    group._count.strategies,
    group.devices.map((device) => device.rustdeskId).join(';'),
    group.strategies.map((assignment) => assignment.strategy.name).join(';'),
    group.createdAt,
    group.updatedAt
  ].map(csvCell).join(','));

  await auditLog({
    action: 'AUDIT_EXPORT',
    resource: 'deviceGroupExport',
    actorUserId: req.user?.sub,
    metadata: { filters: req.query, exported: groups.length },
    req
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="device-groups-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`);
});

router.get('/device-groups/:id', requirePermission('groups.read'), async (req, res) => {
  await markStaleDevicesOffline();
  const group = await prisma.deviceGroup.findUnique({
    where: { id: req.params.id },
    include: {
      devices: {
        orderBy: [{ online: 'desc' }, { lastSeenAt: 'desc' }],
        take: 500
      },
      strategies: {
        include: { strategy: true },
        orderBy: { createdAt: 'desc' }
      },
      _count: { select: { devices: true, strategies: true } }
    }
  });
  if (!group) {
    res.status(404).json({ error: 'Device group not found' });
    return;
  }
  res.json(group);
});

router.post('/device-groups', requirePermission('groups.write'), async (req, res) => {
  const parsed = z.object({ name: z.string().min(1), description: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const duplicate = await findDuplicateDeviceGroupName(parsed.data.name);
  if (duplicate) {
    res.status(409).json({ error: 'Device group name already exists', group: duplicate });
    return;
  }
  const group = await prisma.deviceGroup.create({ data: parsed.data });
  await auditLog({ action: 'CREATE', resource: 'deviceGroup', resourceId: group.id, actorUserId: req.user?.sub, req });
  res.json(group);
});

router.patch('/device-groups/:id', requirePermission('groups.write'), async (req, res) => {
  const parsed = z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.deviceGroup.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!existing) {
    res.status(404).json({ error: 'Device group not found' });
    return;
  }
  const duplicate = await findDuplicateDeviceGroupName(parsed.data.name, existing.id);
  if (duplicate) {
    res.status(409).json({ error: 'Device group name already exists', group: duplicate });
    return;
  }
  const group = await prisma.deviceGroup.update({ where: { id: req.params.id }, data: parsed.data });
  await auditLog({ action: 'UPDATE', resource: 'deviceGroup', resourceId: group.id, actorUserId: req.user?.sub, req });
  res.json(group);
});

router.delete('/device-groups/:id', requirePermission('groups.write'), async (req, res) => {
  const group = await prisma.deviceGroup.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { devices: true, strategies: true } } }
  });
  if (!group) {
    res.status(404).json({ error: 'Device group not found' });
    return;
  }
  if (group._count.devices > 0 || group._count.strategies > 0) {
    res.status(409).json({
      error: 'Device group is in use and cannot be deleted',
      devices: group._count.devices,
      policyAssignments: group._count.strategies
    });
    return;
  }
  await prisma.deviceGroup.delete({ where: { id: req.params.id } });
  await auditLog({ action: 'DELETE', resource: 'deviceGroup', resourceId: req.params.id, actorUserId: req.user?.sub, req });
  res.json({ ok: true });
});

export default router;
