"use client";

import { X } from "lucide-react";

import { TxTracker } from "@/components/settlement/tx-tracker";
import type { TxRecord } from "@/providers/tx-provider";

/** Every write of this session, docked above the router so navigation never hides one. */
export function TxDock({ records, onDismiss }: { records: TxRecord[]; onDismiss: (id: number) => void }) {
  const visible = records.filter((r) => !r.dismissed);
  if (!visible.length) return null;
  return (
    <section
      aria-label="Transactions"
      className="fixed right-4 bottom-4 left-4 z-50 grid max-h-[70vh] gap-3 overflow-y-auto sm:left-auto sm:w-[380px]"
    >
      {visible.map((r) => {
        const settled = r.state.stage === "CONTRACT_STATE_UPDATED" || r.state.stage === "FAILED";
        return (
          <article key={r.id} className="border border-line bg-well p-4">
            <header className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">{r.title}</h2>
              {settled ? (
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="text-dim hover:text-text"
                  onClick={() => onDismiss(r.id)}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </header>
            <TxTracker state={r.state} effect={r.effect} compact />
          </article>
        );
      })}
    </section>
  );
}
