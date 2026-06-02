import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthProviderType } from '@prisma/client';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { signExternalLoginState, signSession, verifyExternalLoginState } from '../auth/jwt.js';
import { buildClaims, requireAuth } from '../middleware/auth.js';
import { auditLog } from '../services/audit.js';
import { buildOidcAuthorizationUrl, completeOidcLogin, completeScanLogin, findOrCreateExternalUser, isScanProvider, scanLoginStart } from '../auth/external.js';
import { config } from '../config.js';
const router = Router();
const authRateLimit = rateLimit({
    windowMs: config.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    limit: config.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
        await auditLog({
            action: 'LOGIN',
            resource: 'authRateLimit',
            metadata: {
                path: req.path,
                method: req.method,
                result: 'blocked',
                windowSeconds: config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
                max: config.AUTH_RATE_LIMIT_MAX
            },
            req
        });
        res.status(429).json({ error: 'Too many authentication attempts' });
    }
});
const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1)
});
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
});
function allowedReturnOrigins() {
    return new Set([
        ...config.WEB_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
        config.PUBLIC_BASE_URL
    ].map((origin) => new URL(origin).origin));
}
function safeReturnUrl(value) {
    const fallback = `${config.WEB_ORIGIN.split(',')[0].trim()}/auth/callback`;
    if (typeof value !== 'string')
        return fallback;
    try {
        const url = new URL(value);
        return allowedReturnOrigins().has(url.origin) ? url.href : fallback;
    }
    catch {
        return fallback;
    }
}
function resolveReturnUrl(value) {
    const resolved = safeReturnUrl(value);
    return {
        resolved,
        rejected: typeof value === 'string' && resolved !== value
    };
}
function redirectWithParams(res, returnUrl, params) {
    const url = new URL(returnUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    res.redirect(url.href);
}
function externalAuthorizationCode(provider, query) {
    const candidates = provider.type === AuthProviderType.OIDC
        ? ['code']
        : ['code', 'authCode', 'auth_code', 'tmp_auth_code'];
    for (const key of candidates) {
        const value = query[key];
        if (typeof value === 'string' && value.trim())
            return { code: value, field: key };
    }
    return { code: '', field: null };
}
function identityProviderMissingFields(provider) {
    const missing = [];
    if (provider.type === AuthProviderType.OIDC) {
        if (!provider.issuerUrl)
            missing.push('issuerUrl');
        if (!provider.clientId)
            missing.push('clientId');
    }
    if (provider.type === AuthProviderType.WECOM) {
        if (!provider.corpId)
            missing.push('corpId');
        if (!provider.agentId)
            missing.push('agentId');
        if (!provider.appSecret)
            missing.push('appSecret');
    }
    if (provider.type === AuthProviderType.DINGTALK) {
        if (!provider.appKey)
            missing.push('appKey');
        if (!provider.appSecret)
            missing.push('appSecret');
    }
    return missing;
}
function loginOption(provider) {
    return { id: provider.id, type: provider.type, name: provider.name };
}
router.get('/login-options', async (_req, res) => {
    const providers = await prisma.identityProvider.findMany({
        where: { enabled: true },
        select: {
            id: true,
            type: true,
            name: true,
            issuerUrl: true,
            clientId: true,
            corpId: true,
            agentId: true,
            appKey: true,
            appSecret: true
        }
    });
    const readyProviders = providers.filter((provider) => identityProviderMissingFields(provider).length === 0);
    res.json({
        local: true,
        oidc: readyProviders.filter((provider) => provider.type === AuthProviderType.OIDC).map(loginOption),
        wecom: readyProviders.filter((provider) => provider.type === AuthProviderType.WECOM).map(loginOption),
        dingtalk: readyProviders.filter((provider) => provider.type === AuthProviderType.DINGTALK).map(loginOption)
    });
});
router.post('/login', authRateLimit, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const user = await prisma.user.findFirst({
        where: {
            OR: [{ username: parsed.data.username }, { email: parsed.data.username }]
        }
    });
    if (!user || !user.passwordHash || user.status !== 'NORMAL') {
        await auditLog({
            action: 'LOGIN',
            resource: 'user',
            resourceId: user?.id,
            actorUserId: user?.id,
            metadata: { result: 'failed', reason: user?.status === 'NORMAL' ? 'invalid_credentials' : user?.status ?? 'not_found', username: parsed.data.username },
            req
        });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
        await auditLog({
            action: 'LOGIN',
            resource: 'user',
            resourceId: user.id,
            actorUserId: user.id,
            metadata: { result: 'failed', reason: 'invalid_credentials', username: parsed.data.username },
            req
        });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const claims = await buildClaims(user.id);
    const token = signSession(claims);
    await auditLog({ action: 'LOGIN', resource: 'user', resourceId: user.id, actorUserId: user.id, req });
    res.json({ token, user: claims });
});
router.post('/logout', requireAuth, async (req, res) => {
    await auditLog({ action: 'LOGOUT', resource: 'user', resourceId: req.user?.sub, actorUserId: req.user?.sub, req });
    res.json({ ok: true });
});
router.post('/currentUser', requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { id: true, username: true, email: true, displayName: true, avatar: true, isAdmin: true, status: true, passwordHash: true }
    });
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    res.json({ ...safeUser, hasLocalPassword: Boolean(_passwordHash), permissions: req.user.permissions });
});
router.post('/currentUser/password', requireAuth, authRateLimit, async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true, passwordHash: true, status: true } });
    if (!user || user.status !== 'NORMAL' || !user.passwordHash) {
        await auditLog({
            action: 'UPDATE',
            resource: 'userPassword',
            resourceId: req.user?.sub,
            actorUserId: req.user?.sub,
            metadata: { result: 'failed', reason: user?.passwordHash ? user.status : 'local_password_not_configured' },
            req
        });
        res.status(400).json({ error: 'Local password is not configured for this account' });
        return;
    }
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
        await auditLog({
            action: 'UPDATE',
            resource: 'userPassword',
            resourceId: user.id,
            actorUserId: user.id,
            metadata: { result: 'failed', reason: 'invalid_current_password' },
            req
        });
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) }
    });
    await auditLog({
        action: 'UPDATE',
        resource: 'userPassword',
        resourceId: user.id,
        actorUserId: user.id,
        metadata: { result: 'changed_by_self' },
        req
    });
    res.json({ ok: true });
});
router.get('/auth/:provider/start', authRateLimit, async (req, res, next) => {
    const provider = await prisma.identityProvider.findFirst({
        where: { id: req.params.provider, enabled: true }
    });
    if (!provider) {
        res.status(404).json({ error: 'Provider not enabled' });
        return;
    }
    const missing = identityProviderMissingFields(provider);
    if (missing.length > 0) {
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: provider.id,
            metadata: {
                result: 'failed',
                reason: 'provider_not_ready',
                providerType: provider.type,
                missing
            },
            req
        });
        res.status(400).json({ error: 'Provider is not ready', missing });
        return;
    }
    try {
        const returnTarget = resolveReturnUrl(req.query.returnUrl);
        if (returnTarget.rejected) {
            await auditLog({
                action: 'LOGIN',
                resource: 'identityProvider',
                resourceId: provider.id,
                metadata: {
                    result: 'failed',
                    reason: 'return_url_rejected',
                    providerType: provider.type,
                    requestedReturnUrl: req.query.returnUrl,
                    fallbackReturnUrl: returnTarget.resolved
                },
                req
            });
        }
        const returnUrl = returnTarget.resolved;
        const codeVerifier = provider.type === AuthProviderType.OIDC ? oidc.randomPKCECodeVerifier() : 'scan-login';
        const state = signExternalLoginState({ providerId: provider.id, codeVerifier, returnUrl });
        const redirectTo = provider.type === AuthProviderType.OIDC
            ? await buildOidcAuthorizationUrl(provider, state, codeVerifier)
            : isScanProvider(provider)
                ? scanLoginStart(provider, state)
                : null;
        if (!redirectTo) {
            res.status(400).json({ error: `Unsupported provider type: ${provider.type}` });
            return;
        }
        res.redirect(redirectTo.href);
    }
    catch (error) {
        next(error);
    }
});
router.get('/auth/:provider/callback', authRateLimit, async (req, res) => {
    const stateValue = typeof req.query.state === 'string' ? req.query.state : '';
    let state;
    try {
        state = verifyExternalLoginState(stateValue);
    }
    catch (error) {
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: req.params.provider,
            metadata: { result: 'failed', reason: 'invalid_or_expired_state', providerId: req.params.provider, error: error instanceof Error ? error.name : 'unknown' },
            req
        });
        redirectWithParams(res, safeReturnUrl(undefined), { error: 'External login state is invalid or expired' });
        return;
    }
    if (state.providerId !== req.params.provider) {
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: req.params.provider,
            metadata: { result: 'failed', reason: 'provider_state_mismatch', expectedProviderId: state.providerId, callbackProviderId: req.params.provider },
            req
        });
        redirectWithParams(res, state.returnUrl, { error: 'External login provider mismatch' });
        return;
    }
    const provider = await prisma.identityProvider.findFirst({ where: { id: req.params.provider, enabled: true } });
    if (!provider) {
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: req.params.provider,
            metadata: { result: 'failed', reason: 'provider_not_enabled', providerId: req.params.provider },
            req
        });
        redirectWithParams(res, state.returnUrl, { error: 'Provider not enabled' });
        return;
    }
    const authorization = externalAuthorizationCode(provider, req.query);
    if (!authorization.code) {
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: provider.id,
            metadata: {
                result: 'failed',
                reason: 'missing_authorization_code',
                providerType: provider.type,
                codeField: authorization.field,
                queryFields: Object.keys(req.query)
            },
            req
        });
        redirectWithParams(res, state.returnUrl, { error: 'Missing authorization code' });
        return;
    }
    try {
        const profile = provider.type === AuthProviderType.OIDC
            ? await completeOidcLogin(provider, new URL(req.originalUrl, config.PUBLIC_BASE_URL), state.codeVerifier)
            : await completeScanLogin(provider, authorization.code);
        const { user, link } = await findOrCreateExternalUser(provider, profile);
        if (user.status !== 'NORMAL') {
            await auditLog({
                action: 'LOGIN',
                resource: 'identityProvider',
                resourceId: provider.id,
                actorUserId: user.id,
                metadata: {
                    result: 'failed',
                    reason: user.status,
                    providerType: provider.type,
                    source: profile.source,
                    subject: profile.subject,
                    link,
                    codeField: authorization.field
                },
                req
            });
            redirectWithParams(res, state.returnUrl, { error: 'User is disabled or unverified' });
            return;
        }
        const claims = await buildClaims(user.id);
        const token = signSession(claims);
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: provider.id,
            actorUserId: user.id,
            metadata: {
                result: 'success',
                providerType: provider.type,
                source: profile.source,
                subject: profile.subject,
                link,
                codeField: authorization.field
            },
            req
        });
        redirectWithParams(res, state.returnUrl, { token });
    }
    catch (error) {
        await auditLog({
            action: 'LOGIN',
            resource: 'identityProvider',
            resourceId: provider.id,
            metadata: {
                result: 'failed',
                reason: 'provider_callback_failed',
                providerType: provider.type,
                codeField: authorization.field,
                error: error instanceof Error ? error.message : 'unknown'
            },
            req
        });
        redirectWithParams(res, state.returnUrl, { error: 'External login failed' });
    }
});
router.post('/auth/:provider/callback', authRateLimit, async (req, res) => {
    res.status(501).json({ error: 'Use GET callback for browser based external login', providerId: req.params.provider });
});
export default router;
