import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { StatusChip, VerdictChip } from "@/components/commitment/status";
import type { Condition } from "@/lib/contracts/statelock";
import { formatGen, formatTime, relative, shortAddress } from "@/lib/present";

export function CommitmentCard({ c, policySummary }: { c: Condition; policySummary?: string }) {
  const bounty = c.status === "SETTLED" ? c.settled_amount : c.bounty_terms;
  return (
    <article className="group flex flex-col border border-line bg-well transition-colors hover:border-dim">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="font-mono text-xs text-dim">{c.condition_id}</span>
        <div className="flex items-center gap-2">
          {c.result_verdict ? <VerdictChip verdict={c.result_verdict} /> : null}
          <StatusChip status={c.status} />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-5 p-5">
        <h3 className="line-clamp-3 text-lg leading-snug font-medium">{c.condition_text}</h3>
        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="tag">Deadline</dt>
            <dd className="mt-1">{formatTime(c.deadline)}</dd>
            <dd className="text-xs text-dim">{relative(c.deadline)}</dd>
          </div>
          <div>
            <dt className="tag">Bounty</dt>
            <dd className="mt-1 font-mono">{formatGen(bounty)}</dd>
          </div>
          <div>
            <dt className="tag">Beneficiary</dt>
            <dd className="mt-1 font-mono text-xs" title={c.beneficiary}>
              {shortAddress(c.beneficiary)}
            </dd>
          </div>
          <div>
            <dt className="tag">Verification policy</dt>
            <dd className="mt-1 text-xs text-dim">{policySummary ?? "Frozen with the terms"}</dd>
          </div>
        </dl>
      </div>
      <Link
        href={`/commitments/${c.condition_id}`}
        className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-dim transition-colors group-hover:text-signal"
      >
        View commitment
        <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}
