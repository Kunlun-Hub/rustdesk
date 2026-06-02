import type { SessionClaims } from '../auth/jwt.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionClaims;
    clientAuth?: {
      kind: 'open' | 'global' | 'device';
      deviceId?: string;
      rustdeskId?: string;
    };
  }
}
