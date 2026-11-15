import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';

authenticator.options = { window: 1 };

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes in base64');
  return key;
}

// AES-256-GCM: authenticated encryption, so a tampered value fails to decrypt.
export function encryptSecret(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored: string, base64Key: string): string {
  const [iv, tag, body] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !body) throw new Error('Malformed secret');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export function newTotpSecret(): string {
  return authenticator.generateSecret();
}

export function otpauthUri(secret: string, accountEmail: string, issuer = 'Software Factory'): string {
  return authenticator.keyuri(accountEmail, issuer, secret);
}

const STEP_SECONDS = 30;

// Returns the accepted time step (so the database can reject a replay), or null if the code is wrong.
export function checkTotp(secretEncrypted: string, code: string, base64Key: string, nowMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const delta = authenticator.checkDelta(code, decryptSecret(secretEncrypted, base64Key));
    return delta === null ? null : Math.floor(nowMs / 1000 / STEP_SECONDS) + delta;
  } catch {
    return null;
  }
}
