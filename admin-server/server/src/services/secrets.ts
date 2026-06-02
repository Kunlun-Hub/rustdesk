import crypto from 'node:crypto';
import { config } from '../config.js';

const encryptedPrefix = 'enc:v1:';

function key() {
  return crypto.createHash('sha256').update(config.ADDRESS_BOOK_SECRET_KEY).digest();
}

export function encryptAddressBookSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (value.startsWith(encryptedPrefix)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    encryptedPrefix.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

export function decryptAddressBookSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (!value.startsWith(encryptedPrefix)) return value;
  const [, , ivValue, tagValue, encryptedValue] = value.split(':');
  if (!ivValue || !tagValue || !encryptedValue) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function hasAddressBookSecret(value: string | null | undefined) {
  return Boolean(value);
}

export const encryptIdentityProviderSecret = encryptAddressBookSecret;
export const decryptIdentityProviderSecret = decryptAddressBookSecret;

export function decryptIdentityProviderSecrets<T extends { clientSecret?: string | null; appSecret?: string | null }>(provider: T): T {
  return {
    ...provider,
    clientSecret: decryptIdentityProviderSecret(provider.clientSecret),
    appSecret: decryptIdentityProviderSecret(provider.appSecret)
  };
}
