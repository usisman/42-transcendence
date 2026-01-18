const USER_KEY = 'transcendence_user';

export type StoredUser = {
  id: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
  avatarUrl?: string | null;
};

export const persistSession = (user: StoredUser) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const loadSession = () => {
  const userRaw = localStorage.getItem(USER_KEY);
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw) as StoredUser;
  } catch {
    clearSession();
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(USER_KEY);
};
