import { useEffect, useRef, useState } from "react";
import api from "@/services/api";

/**
 * Whether the server accepts Team / Club accounts right now (GET /config,
 * `teamRoleEnabled`), for the signup role picker.
 *
 * The backend deploys itself on push while the migration that allows the
 * 'team' role is run by hand, so the role sits behind a server switch that is
 * off by default. The picker shows the Team / Club card only once the server
 * has said yes: the answer is false while the request is on its way, false on
 * any error, and false for an older server that does not send the field.
 *
 * The server refuses a 'team' signup while the switch is off regardless; this
 * only decides what to show.
 */

// A "yes" is kept for the session. A "no" or a failure is not, so the next
// visit to the role step asks again.
let enabled = false;
let inflight: Promise<boolean> | null = null;

export function loadTeamRoleEnabled(): Promise<boolean> {
  if (enabled) return Promise.resolve(true);
  if (inflight) return inflight;
  inflight = api
    .get("/config")
    .then(({ data }) => {
      enabled =
        (data?.data?.teamRoleEnabled ?? data?.teamRoleEnabled) === true;
      return enabled;
    })
    .catch(() => false)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Pass `active = false` to hold the request back until the role step is on
 * screen (the sign-in form has no use for it). Asks once per mount.
 */
export function useTeamRoleEnabled(active = true): boolean {
  const [value, setValue] = useState(enabled);
  const asked = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || value || asked.current) return;
    asked.current = true;
    // Not cancelled when `active` goes false: leaving the role step and
    // coming back must still pick up an answer that was already on its way.
    loadTeamRoleEnabled().then((on) => {
      if (mounted.current && on) setValue(true);
    });
  }, [active, value]);

  return value;
}
