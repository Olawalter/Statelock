"use client";

import { useEffect, useState } from "react";
import { useConnection } from "wagmi";

import { TxTracker } from "@/components/settlement/tx-tracker";
import { Button } from "@/components/ui/button";
import { useDeployment, useNetwork } from "@/components/wallet/network-status";
import { fundingOutcome, reads, verbCall, type Condition, type Verb } from "@/lib/contracts/statelock";
import type { TxState } from "@/lib/genlayer/tx";
import { formatDuration, formatGen, formatTime, sameAddress } from "@/lib/present";
import { useStatelock } from "@/providers/app-providers";
import { useTx } from "@/providers/tx-provider";

type Action = {
  verb: Verb;
  label: string;
  who: string;
  /** Why it cannot be sent now, or null when the contract should accept it. */
  blocked: string | null;
  tone?: "primary" | "outline";
  effect: string;
  reconciled: (after: Condition) => boolean;
};

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Every verb of the contract, offered to whoever the contract allows. The
 * eligibility shown here is advisory, computed from the contract's own
 * timestamps; the contract checks again against its transaction time and its
 * refusal is what counts.
 */
export function actionsFor(c: Condition, me: string | undefined, now: number): Action[] {
  const creator = sameAddress(c.creator, me);
  const recipient = c.result_verdict === "SATISFIED" ? "the beneficiary" : "the creator";
  const creatorOnly = creator ? null : "Only the creator can do this.";
  const list: Action[] = [];

  if (c.status === "DRAFT") {
    list.push({
      verb: "fund",
      label: `Fund ${formatGen(c.bounty_terms)}`,
      who: "Creator",
      blocked: creatorOnly,
      tone: "primary",
      effect: `${formatGen(c.bounty_terms)} is deposited and held by the contract.`,
      reconciled: (a) => a.status === "FUNDED",
    });
  }
  if (c.status === "FUNDED") {
    list.push({
      verb: "arm",
      label: "ARM commitment",
      who: "Creator",
      blocked: creatorOnly ?? (now >= c.observation_start ? "The observation window has opened; a commitment must be armed before it." : null),
      tone: "primary",
      effect: "Armed. The terms are frozen and the bounty is locked until settlement.",
      reconciled: (a) => a.status === "ARMED",
    });
  }
  if (c.status === "DRAFT" || c.status === "FUNDED") {
    list.push({
      verb: "cancel",
      label: "Cancel commitment",
      who: "Creator",
      blocked: creatorOnly,
      tone: "outline",
      effect: c.status === "FUNDED" ? `Cancelled. ${formatGen(c.bounty_deposited)} was refunded to the creator.` : "Cancelled.",
      reconciled: (a) => a.status === "CANCELLED",
    });
  }
  if (c.status === "ARMED" || c.status === "OBSERVING") {
    const early = now <= c.deadline;
    list.push({
      verb: "observe",
      label: "Observe now",
      who: "Anyone",
      blocked:
        now < c.observation_start
          ? `The observation window opens ${formatTime(c.observation_start)}.`
          : now > c.observation_closes
            ? "The observation period has closed. Finalize to record Undetermined."
            : early && c.early_observations >= c.early_observations_allowed
              ? `All ${c.early_observations_allowed} observations inside the window are used. Observe again after the deadline.`
              : null,
      tone: "primary",
      effect: "GenLayer validators read the allowed sources and agreed on an observation. See the evidence below.",
      reconciled: (a) => a.observation_count > c.observation_count,
    });
    list.push({
      verb: "finalize",
      label: "Record as not observed",
      who: "Anyone",
      blocked: now <= c.observation_closes ? `Possible only if nobody observes by ${formatTime(c.observation_closes)}.` : null,
      tone: "outline",
      effect: "Finalized as Undetermined because nobody observed in time. The creator can now be refunded.",
      reconciled: (a) => a.status === "FINALIZED",
    });
  }
  if (c.status === "ACCEPTED") {
    const wait = c.finalizable_at - now;
    list.push({
      verb: "finalize",
      label: "Finalize result",
      who: "Anyone",
      blocked: wait > 0 ? `The finality delay ends ${formatTime(c.finalizable_at)}, in ${formatDuration(wait)}.` : null,
      tone: "primary",
      effect: "The result is final. Settlement is now possible.",
      reconciled: (a) => a.status === "FINALIZED",
    });
  }
  if (c.status === "FINALIZED") {
    list.push({
      verb: "settle",
      label: `Settle to ${recipient}`,
      who: "Anyone",
      blocked: null,
      tone: "primary",
      effect: `Settled. ${formatGen(c.bounty_deposited)} was paid to ${recipient}.`,
      reconciled: (a) => a.status === "SETTLED",
    });
  }
  return list;
}

export function ActionsPanel({ c }: { c: Condition }) {
  const { client, config } = useStatelock();
  const { address } = useConnection();
  const net = useNetwork();
  const deployment = useDeployment();
  const { send } = useTx();
  const now = useNow();
  const [active, setActive] = useState<{ verb: Verb; effect: string; state: TxState } | null>(null);

  const actions = actionsFor(c, address, now);
  const busy = active !== null && active.state.stage !== "FAILED" && active.state.stage !== "CONTRACT_STATE_UPDATED";
  const walletProblem = !address
    ? "Connect a wallet to send a transaction."
    : !net.correct
      ? "Switch your wallet to GenLayer StudioNet to send a transaction."
      : deployment.data && !deployment.data.ok
        ? "The configured contract is not verified as STATELOCK."
        : null;

  async function run(a: Action) {
    setActive({ verb: a.verb, effect: a.effect, state: { stage: "READY", reached: "READY", finality: "none" } });
    let reconciled: () => Promise<boolean | string> = async () =>
      a.reconciled(await reads.condition(client, config, c.condition_id));
    if (a.verb === "fund" && address) {
      try {
        reconciled = await fundingOutcome(client, config, c.condition_id, address);
      } catch {
        /* fall back to the status check */
      }
    }
    const record = await send({
      title: `${a.label} · ${c.condition_id}`,
      effect: a.effect,
      ...verbCall(a.verb, c.condition_id, c.bounty_terms),
      reconciled,
    });
    setActive({ verb: a.verb, effect: a.effect, state: record.state });
  }

  if (c.terminal) {
    return (
      <p className="text-sm text-dim">
        {c.status === "SETTLED"
          ? "This commitment is settled and closed. It cannot be settled again."
          : "This commitment was cancelled before it was armed."}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {walletProblem ? <p className="text-sm text-maybe">{walletProblem}</p> : null}
      <ul className="grid gap-3">
        {actions.map((a) => (
          <li key={a.verb + a.label} className="grid gap-2 border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-dim">{a.who}</span>
              <Button
                variant={a.tone === "outline" ? "outline" : "default"}
                disabled={busy || !!walletProblem || !!a.blocked}
                onClick={() => run(a)}
              >
                {busy && active?.verb === a.verb ? "Working…" : a.label}
              </Button>
            </div>
            {a.blocked ? <p className="text-xs text-dim">{a.blocked}</p> : null}
          </li>
        ))}
      </ul>
      {active ? (
        <div className="border border-line bg-ink p-4">
          <TxTracker state={active.state} effect={active.effect} />
        </div>
      ) : null}
    </div>
  );
}
