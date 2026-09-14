import type { AppConfig } from "@/lib/config";
import { readClient, type GenLayerClient } from "@/lib/genlayer/client";

/**
 * The write lifecycle (build prompt §31). A wallet opening is not success, a
 * hash is not success, and a receipt is not state: each stage below is only
 * entered when the thing it names has been observed.
 *
 *   READY                  nothing sent
 *   AWAITING_WALLET        the wallet has been asked to sign
 *   USER_CONFIRMED         the wallet signed and returned a transaction hash
 *   SUBMITTED              GenLayer's RPC knows the transaction
 *   CONFIRMING             validators are executing and voting (consensus pending)
 *   CONFIRMED              the transaction is ACCEPTED and the contract executed it
 *   CONTRACT_STATE_UPDATED the contract's own view now shows the change
 *   FAILED                 declined, refused by the contract, or not decided
 *
 * Alongside, the transaction's GenLayer finality is tracked on its own:
 * ACCEPTED is still inside the appeal window; only FINALIZED is final.
 */

export const STAGES = [
  "READY",
  "AWAITING_WALLET",
  "USER_CONFIRMED",
  "SUBMITTED",
  "CONFIRMING",
  "CONFIRMED",
  "CONTRACT_STATE_UPDATED",
] as const;
export type Stage = (typeof STAGES)[number] | "FAILED";

export type Finality = "none" | "pending_consensus" | "accepted" | "appealed" | "finalized" | "undecided";

export type TxState = {
  stage: Stage;
  /** The last stage reached before a failure, so the tracker can show where it stopped. */
  reached: (typeof STAGES)[number];
  hash?: `0x${string}`;
  /** GenLayer's own status name for the transaction, as last read. */
  protocolStatus?: string;
  finality: Finality;
  message?: string;
};

export const initialTx: TxState = { stage: "READY", reached: "READY", finality: "none" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PENDING = new Set(["PENDING", "ACTIVATED", "PROPOSING", "COMMITTING", "REVEALING"]);
const APPEAL = new Set(["APPEAL_REVEALING", "APPEAL_COMMITTING", "READY_TO_FINALIZE"]);
const UNDECIDED = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

export function finalityOf(status: string | undefined): Finality {
  if (!status) return "none";
  if (status === "FINALIZED") return "finalized";
  if (status === "ACCEPTED") return "accepted";
  if (APPEAL.has(status)) return "appealed";
  if (UNDECIDED.has(status)) return "undecided";
  if (PENDING.has(status)) return "pending_consensus";
  return "none";
}

// ── the contract's refusal text ─────────────────────────────────────────────

const TAGS = ["[EXPECTED]", "[EXTERNAL]", "[TRANSIENT]", "[LLM_ERROR]"];

function base64Text(s: string): string {
  try {
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    let i = 0;
    while (i < text.length && text.charCodeAt(i) < 0x20) i++;
    return text.slice(i);
  } catch {
    return "";
  }
}

function findTagged(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    for (const candidate of [value, /^[A-Za-z0-9+/=]{8,}$/.test(value) ? base64Text(value) : ""]) {
      const at = Math.min(...TAGS.map((t) => candidate.indexOf(t)).filter((i) => i >= 0));
      if (Number.isFinite(at)) return candidate.slice(at).split(/\r?\n/)[0].trim();
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = findTagged(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

type Receipt = {
  statusName?: string;
  status?: string | number;
  consensus_data?: { leader_receipt?: { execution_result?: string; result?: unknown }[] | { execution_result?: string; result?: unknown } };
};

export function leaderOf(tx: Receipt) {
  const lr = tx.consensus_data?.leader_receipt;
  return Array.isArray(lr) ? lr[0] : lr;
}

/** The contract's own sentence for refusing a write, or null when it executed. */
export function refusalOf(tx: Receipt): string | null {
  const leader = leaderOf(tx);
  if (!leader || leader.execution_result !== "ERROR") return null;
  return findTagged(leader.result) ?? "The contract refused this transaction.";
}

/** Wallet and transport failures, in words. */
export function walletErrorMessage(err: unknown): string {
  const text = [
    (err as { shortMessage?: string })?.shortMessage,
    (err as { message?: string })?.message,
    (err as { details?: string })?.details,
  ]
    .filter(Boolean)
    .join(" ");
  const code = (err as { code?: number })?.code ?? (err as { cause?: { code?: number } })?.cause?.code;
  if (code === 4001 || /user rejected|user denied|rejected the request/i.test(text)) {
    return "You declined the request in your wallet. Nothing was sent.";
  }
  if (/rate limit/i.test(text)) return "The GenLayer RPC is rate limiting requests. Wait a minute and try again.";
  if (/insufficient funds/i.test(text)) return "Your wallet does not hold enough GEN for this transaction.";
  const tagged = findTagged(text);
  if (tagged) return tagged;
  return text ? text.split("\n")[0].slice(0, 240) : "The transaction could not be sent.";
}

// ── the runner ──────────────────────────────────────────────────────────────

export type RunOptions = {
  config: AppConfig;
  client: GenLayerClient;
  functionName: string;
  args: (string | number | bigint)[];
  value: bigint;
  /** Resolves true once the contract's own view reflects the write. */
  reconciled: () => Promise<boolean>;
  onUpdate: (s: TxState) => void;
  /** A fresh read-only client for polling; defaults to one built from config. */
  poller?: GenLayerClient;
  /** Polling interval; shortened only by tests. */
  pollMs?: number;
};

export async function runWrite(o: RunOptions): Promise<TxState> {
  let state: TxState = { ...initialTx };
  const set = (patch: Partial<TxState>) => {
    state = { ...state, ...patch };
    if (patch.stage && patch.stage !== "FAILED") state.reached = patch.stage as (typeof STAGES)[number];
    o.onUpdate(state);
    return state;
  };
  const fail = (message: string) => set({ stage: "FAILED", message });
  const poller = o.poller ?? readClient(o.config);
  const pollMs = o.pollMs ?? 3000;

  set({ stage: "AWAITING_WALLET" });
  let hash: `0x${string}`;
  try {
    hash = (await o.client.writeContract({
      address: o.config.contractAddress,
      functionName: o.functionName,
      args: o.args,
      value: o.value,
    })) as `0x${string}`;
  } catch (err) {
    return fail(walletErrorMessage(err));
  }
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return fail("The wallet did not return a transaction hash.");
  set({ stage: "USER_CONFIRMED", hash });

  // SUBMITTED only once GenLayer itself can read the transaction back
  let tx: Receipt | null = null;
  for (let i = 0; i < 20 && !tx; i++) {
    try {
      tx = (await poller.getTransaction({ hash: hash as never })) as Receipt;
    } catch {
      await sleep(pollMs);
    }
  }
  if (!tx) return fail("The wallet returned a hash, but GenLayer has no record of the transaction.");
  set({ stage: "SUBMITTED", protocolStatus: tx.statusName, finality: finalityOf(tx.statusName) });

  // consensus
  set({ stage: "CONFIRMING" });
  const started = Date.now();
  while (true) {
    const status = tx.statusName;
    set({ protocolStatus: status, finality: finalityOf(status) });
    if (status === "ACCEPTED" || status === "FINALIZED" || (status && APPEAL.has(status))) break;
    if (status && UNDECIDED.has(status)) {
      return fail("Validators did not reach a decision on this transaction, so it changed nothing.");
    }
    if (Date.now() - started > 15 * 60_000) {
      return fail("Consensus is taking longer than fifteen minutes. The transaction may still complete; reload later.");
    }
    await sleep(pollMs + 2000);
    try {
      tx = (await poller.getTransaction({ hash: hash as never })) as Receipt;
    } catch {
      /* transient read failure: keep polling */
    }
  }

  const refusal = refusalOf(tx);
  if (refusal) return fail(refusal);
  set({ stage: "CONFIRMED" });

  // the contract's own state
  let updated = false;
  for (let i = 0; i < 30 && !updated; i++) {
    try {
      updated = await o.reconciled();
    } catch {
      updated = false;
    }
    if (!updated) await sleep(pollMs);
  }
  if (!updated) {
    return fail("The transaction was accepted, but the contract's state has not caught up yet. Reload in a minute.");
  }
  set({ stage: "CONTRACT_STATE_UPDATED" });

  // finality of the transaction itself (appeal window), tracked after the flow unblocks
  void (async () => {
    for (let i = 0; i < 60 && state.finality !== "finalized"; i++) {
      await sleep(10_000);
      try {
        const t = (await poller.getTransaction({ hash: hash as never })) as Receipt;
        set({ protocolStatus: t.statusName, finality: finalityOf(t.statusName) });
      } catch {
        /* keep the last known finality */
      }
    }
  })();
  return state;
}
