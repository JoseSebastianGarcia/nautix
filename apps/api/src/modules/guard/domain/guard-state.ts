import {
  GUARD_HELPER_STALE_SECONDS,
  GUARD_TRIAL_SECONDS,
  type GuardPlanDoc,
  type GuardReport,
  type GuardRule,
} from "@nautix/contracts";
import { resolveGuardRules } from "./resolve-rules.js";

export interface GuardState {
  /** Bumped on every change so the helper knows when to re-apply. */
  revision: number;
  /** Rules that are in force and stay after a restart. */
  confirmed: GuardRule[];
  /** A change on trial: it replaces `confirmed` until `deadline` (ms) unless it is confirmed. */
  pending: { rules: GuardRule[]; deadline: number } | null;
  report: (GuardReport & { at: number }) | null;
  /** Last time the helper polled: the heartbeat (polling is a GET, so it is not audited). */
  seenAt: number | null;
}

export const EMPTY_STATE: GuardState = {
  revision: 0,
  confirmed: [],
  pending: null,
  report: null,
  seenAt: null,
};

/** A trial that ran out is gone: the confirmed rules are back in force. */
export const settle = (state: GuardState, now: number): GuardState =>
  state.pending && now >= state.pending.deadline
    ? { ...state, revision: state.revision + 1, pending: null }
    : state;

export const helperConnected = (state: GuardState, now: number): boolean =>
  state.seenAt !== null && now - state.seenAt < GUARD_HELPER_STALE_SECONDS * 1000;

/** The state after the user saves a rule set: on trial when a helper can roll it back, else stored as is. */
export const withRules = (
  state: GuardState,
  rules: GuardRule[],
  now: number,
  trial: boolean,
): GuardState =>
  trial
    ? {
        ...state,
        revision: state.revision + 1,
        pending: { rules, deadline: now + GUARD_TRIAL_SECONDS * 1000 },
      }
    : { ...state, revision: state.revision + 1, confirmed: rules, pending: null };

export const confirmPending = (state: GuardState): GuardState =>
  state.pending
    ? { ...state, revision: state.revision + 1, confirmed: state.pending.rules, pending: null }
    : state;

export const disableAll = (state: GuardState): GuardState => ({
  ...state,
  revision: state.revision + 1,
  confirmed: [],
  pending: null,
});

type Published = Parameters<typeof resolveGuardRules>[1];

/** What the helper should enforce now; `fallback` and `validUntil` let it undo a trial on its own. */
export const planDoc = (state: GuardState, containers: Published): GuardPlanDoc => {
  const active = state.pending?.rules ?? state.confirmed;
  return {
    revision: state.revision,
    rules: resolveGuardRules(active, containers).resolved,
    fallback: state.pending ? resolveGuardRules(state.confirmed, containers).resolved : null,
    validUntil: state.pending ? new Date(state.pending.deadline).toISOString() : null,
  };
};
