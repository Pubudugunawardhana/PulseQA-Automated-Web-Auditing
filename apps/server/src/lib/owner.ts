import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

/**
 * Anonymous, login-free ownership.
 *
 * Every browser gets a random 256-bit secret in an httpOnly cookie. The database only ever stores
 * its SHA-256 hash, so a leaked database can't be used to impersonate anyone. History, delete and
 * cancel are scoped to the owner; a shared audit link stays readable (read-only) by anyone.
 */
export const OWNER_COOKIE = 'pqa_owner';
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

declare module 'express-serve-static-core' {
  interface Request {
    /** SHA-256 of this browser's owner secret. */
    ownerHash: string;
  }
}

export const hashOwner = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function ownerMiddleware(req: Request, res: Response, next: NextFunction) {
  let secret = readCookie(req, OWNER_COOKIE);
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    secret = crypto.randomBytes(32).toString('base64url'); // 43 chars
    res.cookie(OWNER_COOKIE, secret, {
      httpOnly: true, // not readable by page scripts
      secure: config.CROSS_SITE_COOKIES || req.secure,
      sameSite: config.CROSS_SITE_COOKIES ? 'none' : 'lax',
      maxAge: ONE_YEAR,
      path: '/',
    });
  }
  req.ownerHash = hashOwner(secret);
  next();
}
