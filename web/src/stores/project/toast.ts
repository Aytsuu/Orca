import { atom } from 'nanostores';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

export const toastMessages = atom<ToastMessage[]>([]);
export const connectionError = atom<string | null>(null);

export function addToast(type: 'success' | 'warning' | 'error' | 'info', text: string) {
  const id = Math.random().toString(36).slice(2, 9);
  toastMessages.set([...toastMessages.get(), { id, type, text }]);
  setTimeout(() => {
    toastMessages.set(toastMessages.get().filter((item) => item.id !== id));
  }, 4000);
}
