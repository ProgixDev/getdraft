import { useEffect, useRef, useState } from "react";

/**
 * A message sent over the socket gets no reply of its own: the server
 * either broadcasts it back (new_message / new_dm) or emits "error". Before
 * this, a refused send (blocked, guardian pending, too fast, server down)
 * kept looking sent. Each optimistic bubble now waits this long for the echo
 * and shows "Not sent" if it never comes.
 */
export const SEND_CONFIRM_MS = 15_000;

type Bubble = { id: string; mine: boolean; text: string; failed?: boolean };

/**
 * The optimistic bubble a server echo of `text` confirms: the oldest one
 * with the same text (failed included, so a late echo after a timeout
 * replaces the "Not sent" bubble instead of duplicating it), else the oldest
 * one still pending. -1 when there is none.
 */
export function findOptimistic(
  prev: Bubble[],
  text: string,
  isOptimistic: (id: string) => boolean,
): number {
  const sameText = prev.findIndex(
    (m) => m.mine && isOptimistic(m.id) && m.text === text,
  );
  if (sameText !== -1) return sameText;
  return prev.findIndex((m) => m.mine && isOptimistic(m.id) && !m.failed);
}

export type PendingSends = {
  start: (id: string) => void;
  clear: (id: string) => void;
  /** The oldest send still waiting, which a socket "error" refers to. */
  oldest: () => string | null;
};

/**
 * Timers for the optimistic bubbles that are waiting on the socket. The
 * returned object is stable, so socket handlers bound once can use it;
 * `onTimeout` is read through a ref, so the latest one always runs.
 */
export function usePendingSends(onTimeout: (id: string) => void): PendingSends {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const [timers] = useState(
    () => new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const [api] = useState<PendingSends>(() => {
    const clear = (id: string) => {
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
    };
    return {
      start: (id) => {
        clear(id);
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            onTimeoutRef.current(id);
          }, SEND_CONFIRM_MS),
        );
      },
      clear,
      oldest: () => timers.keys().next().value ?? null,
    };
  });

  useEffect(
    () => () => {
      timers.forEach(clearTimeout);
      timers.clear();
    },
    [timers],
  );

  return api;
}
