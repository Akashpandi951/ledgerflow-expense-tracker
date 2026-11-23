import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AuthTokenPayload, UserRecord } from '../types';

const SALT_ROUNDS = 12;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function generateAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '24h',
  });
}

export function generateRefreshToken(): string {
  return uuidv4() + '-' + Date.now().toString(36);
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
  } catch (err) {
    return null;
  }
}

export function sanitizeUser(user: UserRecord): Omit<UserRecord, 'passwordHash'> {
  const { passwordHash, ...safe } = user;
  return safe;
}
