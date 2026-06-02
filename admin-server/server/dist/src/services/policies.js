import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export async function resolveDevicePolicy(rustdeskId) {
    const device = await prisma.device.findUnique({
        where: { rustdeskId },
        include: {
            strategyAssignments: { include: { strategy: true } },
            group: { include: { strategies: { include: { strategy: true } } } }
        }
    });
    if (!device) {
        return { device: null, policies: [], config: {}, modifiedAt: 0, hash: '' };
    }
    const assignments = [
        ...(device.group?.strategies ?? []),
        ...device.strategyAssignments
    ].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const config = assignments.reduce((merged, assignment) => ({
        ...merged,
        ...asObject(assignment.strategy.configOptions)
    }), {});
    const configSources = assignments.reduce((sources, assignment) => {
        const source = assignment.deviceId ? 'device' : 'group';
        for (const key of Object.keys(asObject(assignment.strategy.configOptions))) {
            sources[key] = {
                strategyId: assignment.strategy.id,
                strategyName: assignment.strategy.name,
                source,
                modifiedAt: assignment.strategy.modifiedAt
            };
        }
        return sources;
    }, {});
    const modifiedAt = assignments.reduce((value, assignment) => Math.max(value, assignment.strategy.modifiedAt), 0);
    const policies = assignments.map((assignment) => ({
        id: assignment.strategy.id,
        name: assignment.strategy.name,
        modifiedAt: assignment.strategy.modifiedAt,
        source: assignment.deviceId ? 'device' : 'group'
    }));
    const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ modifiedAt, policies, config }))
        .digest('hex');
    return { device, policies, config, configSources, modifiedAt, hash };
}
export async function resolveDevicePolicyById(deviceId) {
    const device = await prisma.device.findUnique({
        where: { id: deviceId },
        select: { rustdeskId: true }
    });
    if (!device) {
        return { device: null, policies: [], config: {}, modifiedAt: 0, hash: '' };
    }
    return resolveDevicePolicy(device.rustdeskId);
}
export async function previewGroupPolicies(groupId) {
    const group = await prisma.deviceGroup.findUnique({
        where: { id: groupId },
        include: {
            devices: {
                orderBy: [{ online: 'desc' }, { lastSeenAt: 'desc' }],
                take: 500
            }
        }
    });
    if (!group) {
        return null;
    }
    const devices = await Promise.all(group.devices.map(async (device) => {
        const preview = await resolveDevicePolicy(device.rustdeskId);
        return {
            id: device.id,
            rustdeskId: device.rustdeskId,
            hostname: device.hostname,
            username: device.username,
            status: device.status,
            online: device.online,
            modifiedAt: preview.modifiedAt,
            hash: preview.hash,
            policies: preview.policies,
            config: preview.config,
            configSources: preview.configSources
        };
    }));
    return {
        group: {
            id: group.id,
            name: group.name,
            description: group.description
        },
        devices
    };
}
