import { cookies } from 'next/headers';

// The raw session token never goes to the client; read it from the cookie on the server only.
export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get('__Secure-authjs.session-token')?.value ?? jar.get('authjs.session-token')?.value ?? null;
}
