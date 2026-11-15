import { describe, expect, it } from 'vitest';
import { buildProviders } from './auth-config';

const ids = (env: Record<string, string>) =>
  buildProviders(env).map((p) => (typeof p === 'function' ? p().id : p.id));

describe('buildProviders', () => {
  it('enables nothing without configuration', () => {
    expect(ids({})).toEqual([]);
  });

  it('enables Google only with both credentials', () => {
    expect(ids({ AUTH_GOOGLE_ID: 'a' })).toEqual([]);
    expect(ids({ AUTH_GOOGLE_ID: 'a', AUTH_GOOGLE_SECRET: 'b' })).toEqual(['google']);
  });

  it('enables email links with server and sender', () => {
    expect(ids({ EMAIL_SERVER: 'smtp://localhost:1025', EMAIL_FROM: 'a@example.test' })).toEqual(['nodemailer']);
  });

  it('enables both when both are configured', () => {
    const env = { AUTH_GOOGLE_ID: 'a', AUTH_GOOGLE_SECRET: 'b', EMAIL_SERVER: 'smtp://x', EMAIL_FROM: 'a@example.test' };
    expect(ids(env)).toEqual(['google', 'nodemailer']);
  });
});
