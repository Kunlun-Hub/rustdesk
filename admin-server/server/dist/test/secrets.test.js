import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptIdentityProviderSecret, decryptIdentityProviderSecrets, encryptIdentityProviderSecret } from '../src/services/secrets.js';
test('identity provider secrets are encrypted and decrypted compatibly', () => {
    const secret = 'oidc-client-secret';
    const encrypted = encryptIdentityProviderSecret(secret);
    assert.notEqual(encrypted, secret);
    assert.match(encrypted ?? '', /^enc:v1:/);
    assert.equal(decryptIdentityProviderSecret(encrypted), secret);
});
test('identity provider secret encryption is idempotent for stored values', () => {
    const encrypted = encryptIdentityProviderSecret('scan-provider-secret');
    assert.equal(encryptIdentityProviderSecret(encrypted), encrypted);
});
test('identity provider secret decryption keeps plaintext migration values readable', () => {
    assert.equal(decryptIdentityProviderSecret('legacy-plaintext-secret'), 'legacy-plaintext-secret');
    assert.equal(decryptIdentityProviderSecret(null), null);
    assert.equal(decryptIdentityProviderSecret(undefined), null);
});
test('identity provider records can be decrypted before external login calls', () => {
    const provider = {
        id: 'provider-1',
        clientSecret: encryptIdentityProviderSecret('oidc-secret'),
        appSecret: encryptIdentityProviderSecret('scan-secret'),
        appKey: 'ding-app'
    };
    assert.deepEqual(decryptIdentityProviderSecrets(provider), {
        id: 'provider-1',
        clientSecret: 'oidc-secret',
        appSecret: 'scan-secret',
        appKey: 'ding-app'
    });
});
