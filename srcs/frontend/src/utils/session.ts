import { clearSession, persistSession, type StoredUser } from './storage';

type SessionStatusResponse = {
  authenticated: boolean;
  user?: StoredUser;
};

const isStoredUser = (value: unknown): value is StoredUser => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'number' &&
    typeof record.email === 'string' &&
    typeof record.nickname === 'string' &&
    (record.provider === 'local' || record.provider === 'google')
  );
};

export const fetchSessionStatus = async (): Promise<SessionStatusResponse> => {
  try {
    const response = await fetch('/api/users/session', { credentials: 'include' });
    if (!response.ok) {
      clearSession();
      return { authenticated: false };
    }

    const payload = (await response.json()) as SessionStatusResponse;
    if (payload.authenticated && isStoredUser(payload.user)) {
      persistSession(payload.user);
      return { authenticated: true, user: payload.user };
    }
  } catch {
    clearSession();
    return { authenticated: false };
  }

  clearSession();
  return { authenticated: false };
};
