import assert from 'node:assert/strict';
import test from 'node:test';
import { auditEntryHash, escapeCsvFormula, normalizeJson, sanitizeAuditMetadata } from '../src/services/audit.js';
test('sanitizeAuditMetadata redacts nested sensitive fields', () => {
    const sanitized = sanitizeAuditMetadata({
        username: 'alice',
        password: 'plain-text',
        headers: {
            authorization: 'Bearer token',
            clientSecret: 'oidc-secret'
        },
        nested: [
            { refresh_token: 'refresh' },
            { appSecret: 'scan-secret' }
        ]
    });
    assert.deepEqual(sanitized, {
        username: 'alice',
        password: '[REDACTED]',
        headers: {
            authorization: '[REDACTED]',
            clientSecret: '[REDACTED]'
        },
        nested: [
            { refresh_token: '[REDACTED]' },
            { appSecret: '[REDACTED]' }
        ]
    });
});
test('sanitizeAuditMetadata preserves boolean secret configuration flags', () => {
    const sanitized = sanitizeAuditMetadata({
        clientSecretConfigured: true,
        appSecretConfigured: false,
        tokenConfigured: true
    });
    assert.deepEqual(sanitized, {
        clientSecretConfigured: true,
        appSecretConfigured: false,
        tokenConfigured: true
    });
});
test('sanitizeAuditMetadata redacts external profile credential fields', () => {
    const sanitized = sanitizeAuditMetadata({
        sub: 'subject-1',
        email: 'user@example.com',
        accessToken: 'access-token',
        refresh_token: 'refresh-token',
        credential: 'signed-credential',
        nested: {
            codeVerifier: 'pkce-verifier'
        }
    });
    assert.deepEqual(sanitized, {
        sub: 'subject-1',
        email: 'user@example.com',
        accessToken: '[REDACTED]',
        refresh_token: '[REDACTED]',
        credential: '[REDACTED]',
        nested: {
            codeVerifier: '[REDACTED]'
        }
    });
});
test('sanitizeAuditMetadata redacts client payload tokens before metadata storage', () => {
    const sanitized = sanitizeAuditMetadata({
        id: 'device-1',
        access_token: 'body-token',
        token: 'fallback-token',
        xClientToken: 'header-copy',
        nested: {
            authorization: 'Bearer abc'
        }
    });
    assert.deepEqual(sanitized, {
        id: 'device-1',
        access_token: '[REDACTED]',
        token: '[REDACTED]',
        xClientToken: '[REDACTED]',
        nested: {
            authorization: '[REDACTED]'
        }
    });
});
test('normalizeJson sorts object keys recursively', () => {
    assert.deepEqual(normalizeJson({ zebra: 1, alpha: { beta: 2, apple: 1 }, list: [{ y: 2, x: 1 }] }), { alpha: { apple: 1, beta: 2 }, list: [{ x: 1, y: 2 }], zebra: 1 });
});
test('auditEntryHash is stable for equivalent metadata key order', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const base = {
        actorUserId: 'user-1',
        action: 'AUDIT_EXPORT',
        resource: 'auditLogExport',
        resourceId: null,
        ipAddress: '127.0.0.1',
        userAgent: 'node:test',
        previousHash: null,
        createdAt
    };
    const left = auditEntryHash({ ...base, metadata: { b: 2, a: 1 } });
    const right = auditEntryHash({ ...base, metadata: { a: 1, b: 2 } });
    const changed = auditEntryHash({ ...base, metadata: { a: 1, b: 3 } });
    assert.equal(left, right);
    assert.notEqual(left, changed);
});
test('escapeCsvFormula prefixes spreadsheet formula-like values', () => {
    assert.equal(escapeCsvFormula('=cmd|calc!A0'), "'=cmd|calc!A0");
    assert.equal(escapeCsvFormula('+SUM(A1:A2)'), "'+SUM(A1:A2)");
    assert.equal(escapeCsvFormula('-10'), "'-10");
    assert.equal(escapeCsvFormula('@external'), "'@external");
    assert.equal(escapeCsvFormula('normal text'), 'normal text');
});
test('export metadata can be sanitized before CSV formula escaping', () => {
    const sanitized = JSON.stringify(sanitizeAuditMetadata({
        note: '=open',
        accessToken: 'secret-token',
        nested: { password: 'plain' }
    }));
    assert.match(sanitized, /"\[REDACTED\]"/);
    assert.doesNotMatch(sanitized, /secret-token|plain/);
    assert.equal(escapeCsvFormula(sanitized), sanitized);
    assert.equal(escapeCsvFormula('=standalone'), "'=standalone");
});
