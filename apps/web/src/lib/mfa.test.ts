import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { describe, expect, it } from 'vitest';
import { checkTotp, decryptSecret, encryptSecret, newTotpSecret, otpauthUri } from './mfa';

const key = randomBytes(32).toString('base64');

describe('secret encryption', () => {
  it('round-trips and never stores the plain secret', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(stored, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('fails with the wrong key or tampered data', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(() => decryptSecret(stored, randomBytes(32).toString('base64'))).toThrow();
    const parts = stored.split('.');
    parts[2] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
  });

  it('rejects keys of the wrong size', () => {
    expect(() => encryptSecret('x', Buffer.from('short').toString('base64'))).toThrow();
  });
});

describe('checkTotp', () => {
  it('returns the current time step for the current code', () => {
    const secret = newTotpSecret();
    const stored = encryptSecret(secret, key);
    const step = checkTotp(stored, authenticator.generate(secret), key);
    expect(step).toBe(Math.floor(Date.now() / 1000 / 30));
  });

  it('returns null for wrong codes', () => {
    const secret = newTotpSecret();
    const stored = encryptSecret(secret, key);
    const wrong = authenticator.check('000000', secret) ? '111111' : '000000';
    expect(checkTotp(stored, wrong, key)).toBeNull();
  });

  it('rejects malformed codes without throwing', () => {
    const stored = encryptSecret(newTotpSecret(), key);
    expect(checkTotp(stored, 'abcdef', key)).toBeNull();
    expect(checkTotp(stored, '12345', key)).toBeNull();
    expect(checkTotp('garbage', '123456', key)).toBeNull();
  });
});

describe('otpauthUri', () => {
  it('builds a URI authenticator apps understand', () => {
    expect(otpauthUri('ABC', 'a@example.test')).toMatch(/^otpauth:\/\/totp\//);
  });
});
