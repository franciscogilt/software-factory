import { authorize, createDb, type AuthzResult, type Role } from '@factory/db';
import { auth } from './auth';
import { getSessionToken } from './session-token';

let cached: ReturnType<typeof createDb> | undefined;
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  cached ??= createDb(url);
  return cached.db;
}

// Use at the top of every server action and page that touches an organization's data.
export async function requireOrgRole(organizationId: string, minimumRole: Role): Promise<AuthzResult> {
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return { allowed: false, reason: 'not_member' };
  return authorize(getDb(), { userId: session.user.id, organizationId, minimumRole, sessionToken: token });
}
