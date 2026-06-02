import { AuthProviderType } from '@prisma/client';
import crypto from 'node:crypto';
import * as oidc from 'openid-client';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sanitizeAuditMetadata } from '../services/audit.js';
import { decryptIdentityProviderSecrets } from '../services/secrets.js';
function callbackUrl(providerId) {
    return `${config.PUBLIC_BASE_URL}/api/auth/${providerId}/callback`;
}
export async function oidcConfiguration(provider) {
    const providerWithSecrets = decryptIdentityProviderSecrets(provider);
    if (!providerWithSecrets.issuerUrl || !providerWithSecrets.clientId) {
        throw new Error('OIDC provider is missing issuerUrl or clientId');
    }
    return oidc.discovery(new URL(providerWithSecrets.issuerUrl), providerWithSecrets.clientId, {
        client_secret: providerWithSecrets.clientSecret ?? undefined,
        redirect_uris: [callbackUrl(provider.id)],
        response_types: ['code']
    }, providerWithSecrets.clientSecret ? oidc.ClientSecretPost(providerWithSecrets.clientSecret) : oidc.None());
}
export async function buildOidcAuthorizationUrl(provider, state, codeVerifier) {
    const configuration = await oidcConfiguration(provider);
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    return oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: callbackUrl(provider.id),
        scope: 'openid email profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state
    });
}
export async function completeOidcLogin(provider, currentUrl, codeVerifier) {
    const configuration = await oidcConfiguration(provider);
    const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
        pkceCodeVerifier: codeVerifier
    });
    const claims = tokens.claims();
    const subject = claims?.sub;
    if (!subject) {
        throw new Error('OIDC response did not include a subject');
    }
    let profile = claims;
    if (tokens.access_token) {
        try {
            const userInfo = await oidc.fetchUserInfo(configuration, tokens.access_token, subject);
            profile = { ...profile, ...userInfo };
        }
        catch {
            profile = { ...profile, userinfo_error: 'fetch_failed' };
        }
    }
    return {
        subject,
        email: typeof profile.email === 'string' ? profile.email : undefined,
        username: typeof profile.preferred_username === 'string' ? profile.preferred_username : undefined,
        displayName: typeof profile.name === 'string' ? profile.name : undefined,
        avatar: typeof profile.picture === 'string' ? profile.picture : undefined,
        source: 'oidc',
        rawProfile: profile
    };
}
async function fetchJson(url, init) {
    const response = await fetch(url, init);
    const body = await response.json();
    if (!response.ok || (typeof body.errcode === 'number' && body.errcode !== 0)) {
        throw new Error(body.errmsg ?? body.message ?? `External provider request failed: ${response.status}`);
    }
    return body;
}
export async function completeWeComLogin(provider, code) {
    const providerWithSecrets = decryptIdentityProviderSecrets(provider);
    const corpSecret = providerWithSecrets.appSecret ?? providerWithSecrets.clientSecret;
    if (!providerWithSecrets.corpId || !corpSecret) {
        throw new Error('WeCom provider is missing corpId or appSecret');
    }
    const token = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(providerWithSecrets.corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`);
    const profile = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${encodeURIComponent(token.access_token)}&code=${encodeURIComponent(code)}`);
    const subject = String(profile.UserId ?? profile.OpenId ?? profile.external_userid ?? '');
    if (!subject) {
        throw new Error('WeCom response did not include UserId or OpenId');
    }
    return {
        subject,
        username: `wecom_${subject}`,
        displayName: typeof profile.name === 'string' ? profile.name : subject,
        source: 'wecom',
        rawProfile: profile
    };
}
export async function completeDingTalkLogin(provider, code) {
    const providerWithSecrets = decryptIdentityProviderSecrets(provider);
    if (!providerWithSecrets.appKey || !providerWithSecrets.appSecret) {
        throw new Error('DingTalk provider is missing appKey or appSecret');
    }
    const token = await fetchJson('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId: providerWithSecrets.appKey,
            clientSecret: providerWithSecrets.appSecret,
            code,
            grantType: 'authorization_code'
        })
    });
    const profile = await fetchJson('https://api.dingtalk.com/v1.0/contact/users/me', {
        method: 'GET',
        headers: { 'x-acs-dingtalk-access-token': token.accessToken }
    });
    const subject = String(profile.unionId ?? profile.openId ?? '');
    if (!subject) {
        throw new Error('DingTalk response did not include unionId or openId');
    }
    return {
        subject,
        email: typeof profile.email === 'string' ? profile.email : undefined,
        username: `dingtalk_${subject}`,
        displayName: typeof profile.nick === 'string' ? profile.nick : subject,
        avatar: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined,
        source: 'dingtalk_oauth2',
        rawProfile: profile
    };
}
export async function completeLegacyDingTalkSnsLogin(provider, code) {
    const providerWithSecrets = decryptIdentityProviderSecrets(provider);
    if (!providerWithSecrets.appKey || !providerWithSecrets.appSecret) {
        throw new Error('DingTalk provider is missing appKey or appSecret');
    }
    const timestamp = Date.now().toString();
    const signature = encodeURIComponent(crypto.createHmac('sha256', providerWithSecrets.appSecret).update(timestamp).digest('base64'));
    const profile = await fetchJson(`https://oapi.dingtalk.com/sns/getuserinfo_bycode?accessKey=${encodeURIComponent(providerWithSecrets.appKey)}&timestamp=${timestamp}&signature=${signature}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmp_auth_code: code })
    });
    const userInfo = profile.user_info ?? {};
    const subject = String(userInfo.unionid ?? userInfo.openid ?? '');
    if (!subject) {
        throw new Error('DingTalk SNS response did not include unionid or openid');
    }
    return {
        subject,
        username: `dingtalk_${subject}`,
        displayName: typeof userInfo.nick === 'string' ? userInfo.nick : subject,
        source: 'dingtalk_sns',
        rawProfile: userInfo
    };
}
function stableUsername(provider, profile) {
    const base = profile.username ?? profile.email?.split('@')[0] ?? `${provider.type.toLowerCase()}_${profile.subject}`;
    return base.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 48);
}
async function uniqueUsername(base) {
    let candidate = base || 'external_user';
    let index = 1;
    while (await prisma.user.findUnique({ where: { username: candidate } })) {
        index += 1;
        candidate = `${base}_${index}`;
    }
    return candidate;
}
async function defaultExternalUserRoleCreate() {
    if (!config.EXTERNAL_USER_DEFAULT_ROLE)
        return undefined;
    const role = await prisma.role.findUnique({ where: { name: config.EXTERNAL_USER_DEFAULT_ROLE } });
    if (!role)
        return undefined;
    return { create: [{ roleId: role.id }] };
}
export async function findOrCreateExternalUser(provider, profile) {
    const safeRawProfile = sanitizeAuditMetadata(profile.rawProfile);
    const linked = await prisma.identityProviderAccount.findUnique({
        where: { providerId_subject: { providerId: provider.id, subject: profile.subject } },
        include: { user: true }
    });
    if (linked) {
        await prisma.identityProviderAccount.update({
            where: { id: linked.id },
            data: { rawProfile: safeRawProfile }
        });
        return {
            user: linked.user,
            link: { action: 'existing_link', identityId: linked.id, matchedByEmail: false }
        };
    }
    const existingByEmail = profile.email ? await prisma.user.findUnique({ where: { email: profile.email } }) : null;
    const roles = existingByEmail ? undefined : await defaultExternalUserRoleCreate();
    const user = existingByEmail ?? await prisma.user.create({
        data: {
            username: await uniqueUsername(stableUsername(provider, profile)),
            email: profile.email,
            displayName: profile.displayName,
            avatar: profile.avatar,
            status: config.EXTERNAL_USER_DEFAULT_STATUS,
            roles
        }
    });
    const identity = await prisma.identityProviderAccount.create({
        data: {
            providerId: provider.id,
            userId: user.id,
            subject: profile.subject,
            rawProfile: safeRawProfile
        }
    });
    return {
        user,
        link: {
            action: existingByEmail ? 'linked_existing_user' : 'created_user',
            identityId: identity.id,
            matchedByEmail: Boolean(existingByEmail)
        }
    };
}
export function isScanProvider(provider) {
    return provider.type === AuthProviderType.WECOM || provider.type === AuthProviderType.DINGTALK;
}
export function scanLoginStart(provider, state) {
    const redirectUri = encodeURIComponent(`${config.PUBLIC_BASE_URL}/api/auth/${provider.id}/callback`);
    if (provider.type === AuthProviderType.WECOM) {
        if (!provider.corpId || !provider.agentId) {
            throw new Error('WeCom provider is missing corpId or agentId');
        }
        return new URL(`https://open.work.weixin.qq.com/wwopen/sso/qrConnect?appid=${provider.corpId}&agentid=${provider.agentId}&redirect_uri=${redirectUri}&state=${state}`);
    }
    if (provider.type === AuthProviderType.DINGTALK) {
        if (!provider.appKey) {
            throw new Error('DingTalk provider is missing appKey');
        }
        return new URL(`https://login.dingtalk.com/oauth2/auth?redirect_uri=${redirectUri}&response_type=code&client_id=${provider.appKey}&scope=openid&state=${state}&prompt=consent`);
    }
    throw new Error('Unsupported scan provider');
}
export async function completeScanLogin(provider, code) {
    if (provider.type === AuthProviderType.WECOM) {
        return completeWeComLogin(provider, code);
    }
    if (provider.type === AuthProviderType.DINGTALK) {
        try {
            return await completeDingTalkLogin(provider, code);
        }
        catch {
            return completeLegacyDingTalkSnsLogin(provider, code);
        }
    }
    throw new Error(`Unsupported scan provider type: ${provider.type}`);
}
