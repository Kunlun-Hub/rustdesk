import jwt from 'jsonwebtoken';
import { config } from '../config.js';
export function signSession(claims) {
    return jwt.sign(claims, config.JWT_SECRET, { expiresIn: config.SESSION_TTL });
}
export function verifySession(token) {
    return jwt.verify(token, config.JWT_SECRET);
}
export function signExternalLoginState(state) {
    return jwt.sign(state, config.JWT_SECRET, { expiresIn: '10m' });
}
export function verifyExternalLoginState(token) {
    return jwt.verify(token, config.JWT_SECRET);
}
