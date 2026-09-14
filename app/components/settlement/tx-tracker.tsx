"use client";

import { Check, ExternalLink, Loader2, X } from "lucide-react";

import { EXPLORER_URL } from "@/lib/config";
import { STAGES, type TxState } from "@/lib/genlayer/tx";
import { finalityLabel, protocolStatusLabel, refusalText, stageHint, stageLabel } from "@/lib/present";

/**
 * The write ladder, one rung per observed fact. A rung is ticked only when
 * reached; the current rung spins; a failure marks the rung it stopped on.
 * GenLayer finality is shown on its own line, because a transaction whose
 * state has updated can still be inside its appeal window.
 */
export function TxTracker({ state, effect, compact = false }: { state: TxState; effect?: string; compact?: boolean }) {
  const failed = state.stage === "FAILED";
  const reachedIndex = STAGES.indexOf(state.reached);
  const done = state.stage === "CONTRACT_STATE_UPDATED";

  return (
    <div className="grid gap-3" aria-live="polite">
      <ol className={`grid gap-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        {STAGES.slice(1).map((s, i) => {
          const index = i + 1;
          const reached = index <= reachedIndex;
          const current = !failed && !done && index === reachedIndex + 1;
          const stoppedHere = failed && index === reachedIndex + 1;
          return (
            <li key={s} className="flex items-center gap-2.5">
              <span
                className={`flex size-4 shrink-0 items-center justify-center border ${
                  stoppedHere ? "border-no text-no" : reached ? "border-yes bg-yes text-ink" : current ? "border-signal text-signal" : "border-line"
                }`}
              >
                {stoppedHere ? (
                  <X className="size-3" />
                ) : reached ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : current ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
              </span>
              <span className={reached ? "text-text" : current ? "text-text" : stoppedHere ? "text-no" : "text-dim"}>
                {stageLabel[s]}
              </span>
              {current && !compact ? <span className="text-dim">· {stageHint[s]}</span> : null}
            </li>
          );
        })}
      </ol>

      {failed && state.message ? (
        <p role="alert" className="border-l-2 border-no pl-3 text-sm text-text">
          {refusalText(state.message)}
        </p>
      ) : null}
      {done && effect ? <p className="border-l-2 border-yes pl-3 text-sm text-text">{effect}</p> : null}

      {state.hash ? (
        <dl className="grid gap-1 border-t border-line pt-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-dim">GenLayer status</dt>
            <dd>{protocolStatusLabel(state.protocolStatus)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-dim">Finality</dt>
            <dd className={state.finality === "finalized" ? "text-yes" : state.finality === "undecided" ? "text-no" : ""}>
              {finalityLabel[state.finality]}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-dim">Transaction</dt>
            <dd>
              <a
                className="inline-flex items-center gap-1 font-mono hover:text-signal"
                href={`${EXPLORER_URL}/tx/${state.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {state.hash.slice(0, 10)}…{state.hash.slice(-6)}
                <ExternalLink className="size-3" />
              </a>
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
