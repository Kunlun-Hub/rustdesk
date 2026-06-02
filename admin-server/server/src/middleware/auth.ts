import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { verifySession, type SessionClaims } from '../auth/jwt.js';

export async function buildClaims(userId: string): Promise<SessionClaims> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } }
            }
          }
        }
      }
    }
  });

  if (!user) {
    throw new Error('User not found');
  }
  if (user.status !== 'NORMAL') {
    throw new Error('User is not active');
  }

  const permissions = new Set<string>();
  for (const userRole of user.roles) {
    for (const rolePermission of userRole.role.permissions) {
      permissions.add(rolePermission.permission.key);
    }
  }

  return {
    sub: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    permissions: [...permissions]
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  try {
    const claims = verifySession(token);
    req.user = await buildClaims(claims.sub);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.isAdmin || req.user?.permissions.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Forbidden' });
  };
}
