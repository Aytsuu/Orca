import { atom } from 'nanostores';

const STORAGE_KEY_SESSION = 'orca_session_id';

export function loadSessionId(): string {
  if (typeof window === 'undefined') return 'user_session';
  let id = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!id) {
    id = `user_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(STORAGE_KEY_SESSION, id);
  }
  return id;
}

export const sessionId = atom<string>(loadSessionId());
