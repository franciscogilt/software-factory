import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

describe('buildCsp', () => {
  it('allows scripts only with the request nonce and never inline or eval in production', () => {
    const csp = buildCsp('abc123');
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('blocks framing, plugins and foreign base URLs', () => {
    const csp = buildCsp('n');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('only allows eval in development', () => {
    expect(buildCsp('n', true)).toContain("'unsafe-eval'");
  });

  it('uses a different policy for a different nonce', () => {
    expect(buildCsp('one')).not.toBe(buildCsp('two'));
  });
});
