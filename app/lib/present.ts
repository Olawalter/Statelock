import { formatUnits, parseUnits } from "viem";

import type { Finality, Stage } from "@/lib/genlayer/tx";

/**
 * Presentation only. Every contract value shown to a person goes through a
 * label here; nothing on a screen renders a raw constant.
 */

export function humanize(value: string): string {
  if (!value) return "";
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const pick = (map: Record<string, string>, v: string) => map[v] ?? humanize(v);

export const statusLabel = (s: string) =>
  pick(
    {
      DRAFT: "Draft",
      FUNDED: "Funded",
      ARMED: "Armed",
      OBSERVING: "Observing",
      ACCEPTED: "Result accepted",
      FINALIZED: "Finalized",
      SETTLED: "Settled",
      CANCELLED: "Cancelled",
    },
    s,
  );

export const statusMeaning = (s: string) =>
  pick(
    {
      DRAFT: "Terms recorded. Nothing deposited yet.",
      FUNDED: "The exact bounty is deposited. The creator can still cancel.",
      ARMED: "Terms frozen and bounty locked. Waiting for the observation window.",
      OBSERVING: "Observed at least once. No conclusive result yet.",
      ACCEPTED: "GenLayer consensus accepted a conclusive result. The finality delay is running.",
      FINALIZED: "The result is final. Settlement can be triggered by anyone.",
      SETTLED: "The bounty has been paid out. This commitment is closed.",
      CANCELLED: "Withdrawn before it was armed. Any deposit was refunded.",
    },
    s,
  );

export const verdictLabel = (v: string) =>
  pick({ SATISFIED: "Satisfied", NOT_SATISFIED: "Not satisfied", UNDETERMINED: "Undetermined" }, v);

export const reasonLabel = (r: string) =>
  pick(
    {
      REQUIRED_FACTS_CONFIRMED: "Every required fact was confirmed",
      REQUIRED_FACT_NOT_CONFIRMED: "A required fact was not confirmed",
      EVENT_AFTER_DEADLINE: "The event happened after the deadline",
      EVENT_TIME_UNKNOWN: "The sources do not show when the event happened",
      SOURCES_CONFLICT: "The allowed sources contradict each other",
      SOURCES_UNAVAILABLE: "Not every allowed source could be read",
      INDEPENDENCE_NOT_MET: "The facts were not confirmed by independent sources",
      NOT_OBSERVED: "Nobody observed the condition before the window closed",
    },
    r,
  );

export const temporalLabel = (t: string) =>
  pick(
    {
      BEFORE_DEADLINE: "Before the deadline",
      AFTER_DEADLINE: "After the deadline",
      UNKNOWN: "Timing unknown",
      NOT_APPLICABLE: "Not applicable",
    },
    t,
  );

export const phaseLabel = (p: string) =>
  pick({ WITHIN_WINDOW: "Inside the observation window", AFTER_DEADLINE: "After the deadline" }, p);

export const factStatusLabel = (s: string) =>
  pick({ CONFIRMED: "Confirmed", NOT_CONFIRMED: "Not confirmed", CONFLICTING: "Sources conflict" }, s);

export const sourceKindLabel = (k: string) =>
  pick(
    {
      OFFICIAL_REPOSITORY: "Official repository",
      OFFICIAL_DOCUMENTATION: "Official documentation",
      OFFICIAL_ANNOUNCEMENT: "Official announcement",
      OFFICIAL_API: "Official API",
      PUBLIC_REGISTRY: "Public registry",
      OTHER: "Other public source",
    },
    k,
  );

export const consequenceLabel = (v: string) =>
  pick(
    {
      SATISFIED: "Bounty goes to the beneficiary",
      NOT_SATISFIED: "Bounty returns to the creator",
      UNDETERMINED: "Bounty returns to the creator",
    },
    v,
  );

export const methodLabel = (m: string) =>
  pick(
    {
      create_condition: "Created",
      fund_condition: "Funded",
      cancel_condition: "Cancelled",
      arm_condition: "Armed",
      observe_condition: "Observed",
      finalize_condition: "Finalized",
      settle_condition: "Settled",
    },
    m,
  );

export const stageLabel: Record<Stage, string> = {
  READY: "Ready",
  AWAITING_WALLET: "Awaiting wallet",
  USER_CONFIRMED: "Signed in wallet",
  SUBMITTED: "Submitted",
  CONFIRMING: "Confirming",
  CONFIRMED: "Confirmed",
  CONTRACT_STATE_UPDATED: "Contract state updated",
  FAILED: "Failed",
};

export const stageHint: Record<Stage, string> = {
  READY: "Nothing has been sent.",
  AWAITING_WALLET: "Approve the request in your wallet.",
  USER_CONFIRMED: "Your wallet signed the transaction.",
  SUBMITTED: "GenLayer has received the transaction.",
  CONFIRMING: "Validators are executing it and voting.",
  CONFIRMED: "Accepted by consensus and executed by the contract.",
  CONTRACT_STATE_UPDATED: "The contract now shows the change.",
  FAILED: "The transaction did not change the contract.",
};

export const finalityLabel: Record<Finality, string> = {
  none: "Not submitted",
  pending_consensus: "Consensus pending",
  accepted: "Accepted, appeal window open",
  appealed: "Under appeal",
  finalized: "Finalized",
  undecided: "Not decided",
};

export function protocolStatusLabel(s: string | undefined): string {
  if (!s) return "Unknown";
  return pick(
    {
      PENDING: "Pending",
      ACTIVATED: "Pending",
      PROPOSING: "Leader proposing",
      COMMITTING: "Validators committing votes",
      REVEALING: "Validators revealing votes",
      ACCEPTED: "Accepted",
      FINALIZED: "Finalized",
      UNDETERMINED: "No majority",
      CANCELED: "Cancelled",
      APPEAL_REVEALING: "Appeal: revealing votes",
      APPEAL_COMMITTING: "Appeal: committing votes",
      READY_TO_FINALIZE: "Ready to finalize",
      LEADER_TIMEOUT: "Leader timed out",
      VALIDATORS_TIMEOUT: "Validators timed out",
    },
    s,
  );
}

/** The contract's refusal sentence without its machine tag. */
export function refusalText(message: string): string {
  const s = message.replace(/^\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── time ────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "15 Sep 2026, 14:30 UTC". Contract time is UTC; so is every date shown. */
export function formatTime(unixSeconds: number): string {
  if (!unixSeconds) return "Not yet";
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return h ? `${plural(d, "day")} ${plural(h, "hour")}` : plural(d, "day");
  if (h > 0) return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
  if (m > 0) return plural(m, "minute");
  return plural(s, "second");
}

export function relative(unixSeconds: number, now = Math.floor(Date.now() / 1000)): string {
  const diff = unixSeconds - now;
  return diff >= 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`;
}

// ── money and addresses ─────────────────────────────────────────────────────

export function formatGen(atto: bigint): string {
  const s = formatUnits(atto, 18);
  const [whole, frac = ""] = s.split(".");
  const trimmed = frac.replace(/0+$/, "").slice(0, 6);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${trimmed ? `${grouped}.${trimmed}` : grouped} GEN`;
}

export function parseGen(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  try {
    return parseUnits(s, 18);
  } catch {
    return null;
  }
}

export function shortAddress(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
