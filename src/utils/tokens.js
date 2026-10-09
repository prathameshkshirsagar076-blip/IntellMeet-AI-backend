import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateAccessToken(payload) {
  const userIdStr = payload.userId ? payload.userId.toString() : payload.sub;
  return jwt.sign(
    {
      sub: userIdStr,
      userId: userIdStr,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId || null
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN
    }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (error) {
    return null;
  }
}

export function generateRefreshToken() {
  return generateRandomToken(40);
}
