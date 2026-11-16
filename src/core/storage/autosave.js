/** One queued writer per editor; edits made during a write are saved next. */
export function createAutosave(write, onState, delay = 800, beforePause) {
  let version = 0, saved = 0, timer, pending, disposed = false;
  const dirty = () => version !== saved;
  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (pending) return pending;
    if (!dirty() || disposed) return;
    pending = (async () => {
      while (dirty() && !disposed) {
        const current = version;
        onState('saving');
        try { await write(); saved = current; }
        catch (error) { onState('error', error); throw error; }
      }
      if (!disposed) onState('saved');
    })();
    try { await pending; } finally { pending = undefined; }
  }
  const saveOnPageHide = () => {
    try { beforePause?.(); }
    finally { flush().catch(() => {}); }
  };
  const saveWhenHidden = () => {
    if (document.visibilityState === 'hidden') saveOnPageHide();
  };
  document.addEventListener('visibilitychange', saveWhenHidden);
  window.addEventListener('pagehide', saveOnPageHide);
  return {
    dirty,
    change() {
      if (disposed) return;
      version++;
      onState('dirty');
      timer ??= setTimeout(() => flush().catch(() => {}), delay);
    },
    flush,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('pagehide', saveOnPageHide);
    },
  };
}
