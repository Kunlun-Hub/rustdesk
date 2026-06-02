import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export type SessionClaims = {
  sub: string;
  username: string;
  isAdmin: boolean;
  permissions: string[];
};

export function signSession(claims: SessionClaims) {
  return jwt.sign(claims, config.JWT_SECRET, { expiresIn: config.SESSION_TTL as SignOptions['expiresIn'] });
}

export function verifySession(token: string): SessionClaims {
  return jwt.verify(token, config.JWT_SECRET) as SessionClaims;
}

export type ExternalLoginState = {
  providerId: string;
  codeVerifier: string;
  returnUrl: string;
};

export function signExternalLoginState(state: ExternalLoginState) {
  return jwt.sign(state, config.JWT_SECRET, { expiresIn: '10m' });
}

export function verifyExternalLoginState(token: string): ExternalLoginState {
  return jwt.verify(token, config.JWT_SECRET) as ExternalLoginState;
}
