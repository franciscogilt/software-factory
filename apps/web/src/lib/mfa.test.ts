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
  it('accepts the current code and rejects others', () => {
    const secret = newTotpSecret();
    const stored = encryptSecret(secret, key);
    expect(checkTotp(stored, authenticator.generate(secret), key)).toBe(true);
    expect(checkTotp(stored, '000000', key)).toBe(authenticator.check('000000', secret));
  });

  it('rejects malformed codes without throwing', () => {
    const stored = encryptSecret(newTotpSecret(), key);
    expect(checkTotp(stored, 'abcdef', key)).toBe(false);
    expect(checkTotp(stored, '12345', key)).toBe(false);
    expect(checkTotp('garbage', '123456', key)).toBe(false);
  });
});

describe('otpauthUri', () => {
  it('builds a URI authenticator apps understand', () => {
    expect(otpauthUri('ABC', 'a@example.test')).toMatch(/^otpauth:\/\/totp\//);
  });
});
