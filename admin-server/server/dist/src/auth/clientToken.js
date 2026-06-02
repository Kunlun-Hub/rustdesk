import crypto from 'node:crypto';
export function generateDeviceClientToken() {
    return `rdc_${crypto.randomBytes(32).toString('base64url')}`;
}
export function hashClientToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
