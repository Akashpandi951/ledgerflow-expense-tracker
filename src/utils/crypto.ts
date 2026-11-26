import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';

function deriveBackupKey(): Buffer {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || config.jwtSecret;
  return crypto.createHash('sha256').update(`ledgerflow-backup-v1:${secret}`).digest();
}

export interface EncryptedBundle {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  checksumSha256: string;
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function encryptBackupPayload(data: unknown): EncryptedBundle {
  const plaintext = JSON.stringify(data);
  const checksumSha256 = sha256Hex(plaintext);
  const key = deriveBackupKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    checksumSha256,
  };
}

export function decryptBackupPayload<T>(bundle: {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  checksumSha256: string;
}): { data: T; integrityVerified: boolean } {
  const key = deriveBackupKey();
  const iv = Buffer.from(bundle.iv, 'base64');
  const authTag = Buffer.from(bundle.authTag, 'base64');
  const ciphertext = Buffer.from(bundle.encryptedPayload, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

  const actualHash = sha256Hex(decrypted);
  const integrityVerified = actualHash === bundle.checksumSha256;
  if (!integrityVerified) {
    throw new Error('BACKUP_INTEGRITY_FAILED: SHA-256 checksum mismatch.');
  }

  return {
    data: JSON.parse(decrypted) as T,
    integrityVerified: true,
  };
}
