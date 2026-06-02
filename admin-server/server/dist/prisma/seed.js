import bcrypt from 'bcryptjs';
import { AuthProviderType } from '@prisma/client';
import { config } from '../src/config.js';
import { prisma } from '../src/prisma.js';
import { encryptIdentityProviderSecret } from '../src/services/secrets.js';
const permissionKeys = [
    'devices.read',
    'devices.write',
    'groups.read',
    'groups.write',
    'users.read',
    'users.write',
    'roles.read',
    'roles.write',
    'strategies.read',
    'strategies.write',
    'addressBooks.read',
    'addressBooks.write',
    'connections.read',
    'connections.write',
    'recordings.read',
    'recordings.write',
    'audit.read',
    'system.read',
    'identityProviders.read',
    'identityProviders.write'
];
const externalUserPermissionKeys = [
    'devices.read',
    'groups.read',
    'strategies.read',
    'addressBooks.read',
    'connections.read',
    'recordings.read'
];
const providerSeeds = [
    {
        type: AuthProviderType.OIDC,
        name: 'OIDC',
        issuerUrl: config.OIDC_ISSUER_URL,
        clientId: config.OIDC_CLIENT_ID,
        clientSecret: config.OIDC_CLIENT_SECRET,
        enabled: Boolean(config.OIDC_ISSUER_URL && config.OIDC_CLIENT_ID)
    },
    {
        type: AuthProviderType.WECOM,
        name: 'Enterprise WeChat',
        corpId: config.WECHAT_CORP_ID,
        agentId: config.WECHAT_AGENT_ID,
        appSecret: config.WECHAT_SECRET,
        enabled: Boolean(config.WECHAT_CORP_ID && config.WECHAT_AGENT_ID && config.WECHAT_SECRET)
    },
    {
        type: AuthProviderType.DINGTALK,
        name: 'DingTalk',
        appKey: config.DINGTALK_APP_KEY,
        appSecret: config.DINGTALK_APP_SECRET,
        enabled: Boolean(config.DINGTALK_APP_KEY && config.DINGTALK_APP_SECRET)
    }
];
function providerData(provider) {
    return {
        type: provider.type,
        name: provider.name,
        issuerUrl: 'issuerUrl' in provider ? provider.issuerUrl : undefined,
        clientId: 'clientId' in provider ? provider.clientId : undefined,
        clientSecret: 'clientSecret' in provider ? encryptIdentityProviderSecret(provider.clientSecret) : undefined,
        corpId: 'corpId' in provider ? provider.corpId : undefined,
        agentId: 'agentId' in provider ? provider.agentId : undefined,
        appKey: 'appKey' in provider ? provider.appKey : undefined,
        appSecret: 'appSecret' in provider ? encryptIdentityProviderSecret(provider.appSecret) : undefined,
        enabled: provider.enabled
    };
}
async function main() {
    for (const key of permissionKeys) {
        await prisma.permission.upsert({
            where: { key },
            update: {},
            create: { key, description: key.replace('.', ' ') }
        });
    }
    const adminRole = await prisma.role.upsert({
        where: { name: 'Super Admin' },
        update: {},
        create: {
            name: 'Super Admin',
            description: 'Full access to the RustDesk admin console'
        }
    });
    for (const key of permissionKeys) {
        const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
            update: {},
            create: { roleId: adminRole.id, permissionId: permission.id }
        });
    }
    const externalRole = await prisma.role.upsert({
        where: { name: 'External User' },
        update: {},
        create: {
            name: 'External User',
            description: 'Default read-only role for externally provisioned users'
        }
    });
    for (const key of externalUserPermissionKeys) {
        const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: externalRole.id, permissionId: permission.id } },
            update: {},
            create: { roleId: externalRole.id, permissionId: permission.id }
        });
    }
    const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12);
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: { email: config.ADMIN_EMAIL, passwordHash, isAdmin: true, status: 'NORMAL' },
        create: {
            username: 'admin',
            email: config.ADMIN_EMAIL,
            displayName: 'Administrator',
            passwordHash,
            isAdmin: true,
            status: 'NORMAL'
        }
    });
    await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id }
    });
    await prisma.deviceGroup.upsert({
        where: { name: 'Default' },
        update: {},
        create: { name: 'Default', description: 'Default device group' }
    });
    await prisma.strategy.upsert({
        where: { name: 'Default Policy' },
        update: {},
        create: {
            name: 'Default Policy',
            description: 'Baseline RustDesk policy',
            configOptions: {
                allowFileTransfer: true,
                allowClipboard: true,
                requirePermission: false,
                recording: 'on_demand'
            }
        }
    });
    await prisma.addressBook.upsert({
        where: { guid: 'default' },
        update: {},
        create: { guid: 'default', name: 'Default Address Book', shareRule: 'read' }
    });
    for (const provider of providerSeeds) {
        const data = providerData(provider);
        await prisma.identityProvider.upsert({
            where: { type_name: { type: provider.type, name: provider.name } },
            update: data,
            create: data
        });
    }
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
