import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { verifyAuditChain } from './audit.js';

const requiredPermissionKeys = [
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

export type HealthCheckResult = {
  ok: boolean;
  checks: Record<string, unknown>;
  warnings: string[];
  errors: string[];
};

async function ensureRecordingDirWritable() {
  await fs.mkdir(config.RECORDING_DIR, { recursive: true });
  const probe = path.join(config.RECORDING_DIR, `.healthcheck-${process.pid}-${Date.now()}`);
  await fs.writeFile(probe, 'ok');
  await fs.unlink(probe);
  return path.resolve(config.RECORDING_DIR);
}

function parsedWebOrigins() {
  return config.WEB_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    try {
      return { origin, url: new URL(origin) };
    } catch {
      return { origin, url: null };
    }
  });
}

function isLocalHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function isPublicHttpUrl(url: URL) {
  return url.protocol === 'http:' && !isLocalHost(url.hostname);
}

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const [
    users,
    roles,
    permissions,
    devices,
    deviceGroups,
    strategies,
    strategyReceipts,
    addressBooks,
    connections,
    activeConnections,
    recordings,
    identityProviders,
    externalIdentityAccounts,
    permissionRows,
    superAdminRole,
    seededExternalRole,
    enabledProviders,
    externalRole,
    auditChain
  ] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.device.count(),
    prisma.deviceGroup.count(),
    prisma.strategy.count(),
    prisma.strategyApplyReceipt.count(),
    prisma.addressBook.count(),
    prisma.connectionRecord.count(),
    prisma.connectionRecord.count({ where: { endedAt: null } }),
    prisma.recording.count(),
    prisma.identityProvider.count(),
    prisma.identityProviderAccount.count(),
    prisma.permission.findMany({ select: { key: true } }),
    prisma.role.findUnique({
      where: { name: 'Super Admin' },
      select: { id: true, permissions: { select: { permission: { select: { key: true } } } } }
    }),
    prisma.role.findUnique({
      where: { name: 'External User' },
      select: { id: true, permissions: { select: { permission: { select: { key: true } } } } }
    }),
    prisma.identityProvider.findMany({
      where: { enabled: true },
      select: { id: true, name: true, type: true, issuerUrl: true, clientId: true, corpId: true, agentId: true, appKey: true, appSecret: true }
    }),
    config.EXTERNAL_USER_DEFAULT_ROLE
      ? prisma.role.findUnique({ where: { name: config.EXTERNAL_USER_DEFAULT_ROLE }, select: { id: true, name: true } })
      : Promise.resolve(null),
    verifyAuditChain()
  ]);

  const missingSeedData: string[] = [];
  if (users < 1) missingSeedData.push('users');
  if (roles < 1) missingSeedData.push('roles');
  if (permissions < 1) missingSeedData.push('permissions');
  if (strategies < 1) missingSeedData.push('strategies');
  if (addressBooks < 1) missingSeedData.push('addressBooks');

  const recordingDir = await ensureRecordingDirWritable();
  const warnings: string[] = [];
  const errors: string[] = [];
  const publicBaseUrl = new URL(config.PUBLIC_BASE_URL);
  const webOrigins = parsedWebOrigins();
  const invalidWebOrigins = webOrigins.filter((origin) => !origin.url).map((origin) => origin.origin);
  const permissionKeySet = new Set(permissionRows.map((permission) => permission.key));
  const missingPermissions = requiredPermissionKeys.filter((key) => !permissionKeySet.has(key));
  if (missingPermissions.length > 0) {
    errors.push(`Missing required permissions: ${missingPermissions.join(', ')}`);
  }
  const superAdminPermissions = new Set(superAdminRole?.permissions.map((item) => item.permission.key) ?? []);
  const missingSuperAdminPermissions = requiredPermissionKeys.filter((key) => !superAdminPermissions.has(key));
  if (!superAdminRole) {
    errors.push('Missing required role: Super Admin');
  } else if (missingSuperAdminPermissions.length > 0) {
    errors.push(`Super Admin role is missing permissions: ${missingSuperAdminPermissions.join(', ')}`);
  }
  const externalUserPermissions = new Set(seededExternalRole?.permissions.map((item) => item.permission.key) ?? []);
  const missingExternalUserPermissions = externalUserPermissionKeys.filter((key) => !externalUserPermissions.has(key));
  if (!seededExternalRole) {
    errors.push('Missing required role: External User');
  } else if (missingExternalUserPermissions.length > 0) {
    errors.push(`External User role is missing permissions: ${missingExternalUserPermissions.join(', ')}`);
  }
  if (config.EXTERNAL_USER_DEFAULT_ROLE && !externalRole) {
    warnings.push(`EXTERNAL_USER_DEFAULT_ROLE '${config.EXTERNAL_USER_DEFAULT_ROLE}' does not exist; external users will be created without that role`);
  }
  if (config.JWT_SECRET === 'change-me-to-a-long-random-secret') {
    warnings.push('JWT_SECRET is using the default development value');
  }
  if (config.ADMIN_PASSWORD === 'admin123456') {
    warnings.push('ADMIN_PASSWORD is using the default development value');
  }
  if (config.ADDRESS_BOOK_SECRET_KEY === 'change-me-address-book-secret') {
    warnings.push('ADDRESS_BOOK_SECRET_KEY is using the default development value');
  }
  if (!config.CLIENT_API_TOKEN) {
    warnings.push('CLIENT_API_TOKEN is not set; client reporting endpoints accept unauthenticated requests');
  }
  if (config.PUBLIC_BASE_URL.includes('localhost')) {
    warnings.push('PUBLIC_BASE_URL points at localhost; external login callbacks will fail outside local development');
  }
  if (isPublicHttpUrl(publicBaseUrl)) {
    warnings.push('PUBLIC_BASE_URL uses http for a non-localhost host; use https before production exposure');
  }
  if (config.WEB_ORIGIN.includes('localhost')) {
    warnings.push('WEB_ORIGIN includes localhost; update it before exposing the console');
  }
  const publicHttpOrigins = webOrigins
    .flatMap((origin) => origin.url ? [{ origin: origin.origin, url: origin.url }] : [])
    .filter((origin) => isPublicHttpUrl(origin.url))
    .map((origin) => origin.origin);
  if (invalidWebOrigins.length > 0) {
    errors.push(`WEB_ORIGIN contains invalid URL(s): ${invalidWebOrigins.join(', ')}`);
  }
  if (publicHttpOrigins.length > 0) {
    warnings.push(`WEB_ORIGIN uses http for non-localhost origin(s): ${publicHttpOrigins.join(', ')}`);
  }

  const providerIssues = enabledProviders.map((provider) => {
    const missing: string[] = [];
    if (provider.type === 'OIDC') {
      if (!provider.issuerUrl) missing.push('issuerUrl');
      if (!provider.clientId) missing.push('clientId');
    }
    if (provider.type === 'WECOM') {
      if (!provider.corpId) missing.push('corpId');
      if (!provider.agentId) missing.push('agentId');
      if (!provider.appSecret) missing.push('appSecret');
    }
    if (provider.type === 'DINGTALK') {
      if (!provider.appKey) missing.push('appKey');
      if (!provider.appSecret) missing.push('appSecret');
    }
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      ready: missing.length === 0,
      missing,
      startUrl: `${config.PUBLIC_BASE_URL}/api/auth/${provider.id}/start`,
      callbackUrl: `${config.PUBLIC_BASE_URL}/api/auth/${provider.id}/callback`
    };
  });
  for (const issue of providerIssues.filter((provider) => !provider.ready)) {
    errors.push(`Enabled login provider '${issue.name}' is missing: ${issue.missing.join(', ')}`);
  }
  if (!auditChain.ok) {
    errors.push(`Audit chain verification failed with ${auditChain.issues.length} issue(s)`);
  }

  return {
    ok: missingSeedData.length === 0 && errors.length === 0,
    warnings,
    errors,
    checks: {
      database: 'reachable',
      seedData: missingSeedData.length === 0 ? 'ready' : { missing: missingSeedData },
      permissions: missingPermissions.length === 0 ? 'ready' : { missing: missingPermissions },
      roles: {
        superAdmin: superAdminRole
          ? missingSuperAdminPermissions.length === 0 ? 'ready' : { missingPermissions: missingSuperAdminPermissions }
          : 'missing',
        externalUser: seededExternalRole
          ? missingExternalUserPermissions.length === 0 ? 'ready' : { missingPermissions: missingExternalUserPermissions }
          : 'missing'
      },
      recordingDir,
      recordingUploadMaxMb: config.RECORDING_UPLOAD_MAX_MB,
      connectionStaleAfterMinutes: config.CONNECTION_STALE_AFTER_MINUTES,
      externalLogin: {
        enabledProviders: enabledProviders.length,
        providers: providerIssues,
        defaultExternalUserRole: config.EXTERNAL_USER_DEFAULT_ROLE
          ? externalRole?.name ?? null
          : null
      },
      publicBaseUrl: config.PUBLIC_BASE_URL,
      sessionTtl: config.SESSION_TTL,
      authRateLimit: {
        windowSeconds: config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
        max: config.AUTH_RATE_LIMIT_MAX
      },
      auditChain: {
        ok: auditChain.ok,
        checked: auditChain.checked,
        missingHash: auditChain.missingHash,
        total: auditChain.total,
        truncated: auditChain.truncated,
        headHash: auditChain.headHash,
        issues: auditChain.issues
      },
      webOrigins: webOrigins.map((origin) => origin.origin),
      counts: {
        users,
        roles,
        permissions,
        devices,
        deviceGroups,
        strategies,
        strategyReceipts,
        addressBooks,
        connections,
        activeConnections,
        recordings,
        identityProviders,
        externalIdentityAccounts
      }
    }
  };
}
