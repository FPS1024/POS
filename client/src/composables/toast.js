import { reactive } from 'vue';

const toasts = reactive([]);
let seq = 0;

export function useToast() {
  function push(message, type = 'info') {
    const id = ++seq;
    toasts.push({ id, message, type });
    setTimeout(() => {
      const index = toasts.findIndex((t) => t.id === id);
      if (index >= 0) toasts.splice(index, 1);
    }, 2600);
  }

  return {
    toasts,
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error'),
    info: (message) => push(message, 'info')
  };
}
