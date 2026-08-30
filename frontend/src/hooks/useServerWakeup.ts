/**
 * SwiftDrop :: useServerWakeup
 * Polls the API's /health endpoint on mount.
 *
 * The API is hosted on a free tier that suspends the container after ~15 minutes
 * of inactivity, so the first request after a quiet period waits ~50s for a cold
 * start. Probing on mount starts that wake while the user is still reading the
 * login form, and gives the UI an honest state to show instead of a dead spinner
 * or a timeout error that looks like the app is broken.
 */
import { useEffect, useState } from 'react';

export type ServerState = 'checking' | 'waking' | 'ready' | 'unreachable';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Under this, treat it as a normal response. Over it, assume a cold start. */
const SLOW_AFTER_MS = 2_500;
const RETRY_DELAY_MS = 3_000;
const GIVE_UP_AFTER_MS = 120_000;

export function useServerWakeup(): ServerState {
  const [state, setState] = useState<ServerState>('checking');

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const slowTimer = setTimeout(() => {
      if (!cancelled) setState((s) => (s === 'checking' ? 'waking' : s));
    }, SLOW_AFTER_MS);

    async function poll(): Promise<void> {
      while (!cancelled) {
        try {
          const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
          if (res.ok) {
            if (!cancelled) setState('ready');
            return;
          }
        } catch {
          // Connection refused/reset while the container boots — keep retrying.
        }
        if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
          if (!cancelled) setState('unreachable');
          return;
        }
        if (!cancelled) setState('waking');
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  return state;
}
