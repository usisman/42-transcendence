export type OnlineTracker = {
  touch: (userId: number) => void;
  isOnline: (userId: number) => boolean;
  remove: (userId: number) => void;
};

type OnlineTrackerOptions = {
  ttlMs?: number;
};

export const createOnlineTracker = (options: OnlineTrackerOptions = {}): OnlineTracker => {
  const ttlMs = options.ttlMs ?? 2 * 60 * 1000; // 2 minutes
  const lastSeen = new Map<number, number>();

  const touch = (userId: number) => {
    lastSeen.set(userId, Date.now());
  };

  const isOnline = (userId: number) => {
    const seenAt = lastSeen.get(userId);
    if (!seenAt) return false;
    return Date.now() - seenAt <= ttlMs;
  };

  const remove = (userId: number) => {
    lastSeen.delete(userId);
  };

  return { touch, isOnline, remove };
};
