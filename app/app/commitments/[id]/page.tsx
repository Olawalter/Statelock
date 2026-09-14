"use client";

import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { useConnection } from "wagmi";

import { ActionsPanel } from "@/components/commitment/actions-panel";
import { EvidencePanel } from "@/components/adjudication/evidence-panel";
import { LifecycleRail, StatusChip, VerdictChip } from "@/components/commitment/status";
import { Skeleton } from "@/components/ui/skeleton";
import { EXPLORER_URL } from "@/lib/config";
import type { Condition, FinalResult } from "@/lib/contracts/statelock";
import {
  historyFor,
  useCondition,
  useContractHistory,
  useFinalResult,
  useObservations,
  usePolicy,
} from "@/lib/hooks/use-commitments";
import {
  consequenceLabel,
  formatDuration,
  formatGen,
  formatTime,
  methodLabel,
  protocolStatusLabel,
  reasonLabel,
  sameAddress,
  statusMeaning,
  temporalLabel,
} from "@/lib/present";
import { useStatelock } from "@/providers/app-providers";

export default function CommitmentPage({ params }: PageProps<"/commitments/[id]">) {
  const { id } = use(params);
  const conditionId = decodeURIComponent(id).toUpperCase();
  const condition = useCondition(conditionId);

  if (condition.isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6">
        <Skeleton className="h-10 w-72 rounded-none bg-well" />
        <Skeleton className="h-64 rounded-none bg-well" />
      </div>
    );
  }
  if (condition.isError || !condition.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="tag">Not found</p>
        <h1 className="mt-4 text-3xl font-semibold">No commitment {conditionId} could be read.</h1>
        <p className="mt-3 text-dim">
          The contract has no commitment with this identifier, or GenLayer StudioNet did not answer. Check the address
          and try again.
        </p>
        <Link href="/commitments" className="mt-8 inline-flex items-center gap-2 text-signal hover:text-signal-hover">
          <ArrowLeft className="size-4" /> All commitments
        </Link>
      </div>
    );
  }
  return <Detail c={condition.data} />;
}

function Section({ tag, title, children, aside }: { tag: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border border-line bg-well">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="tag">{tag}</span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {aside}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[170px_1fr] sm:gap-4">
          <dt className="text-sm text-dim">{k}</dt>
          <dd className="min-w-0 text-sm break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Address({ value, you }: { value: string; you?: boolean }) {
  return (
    <span className="font-mono text-xs break-all">
      {value}
      {you ? <span className="ml-2 border border-signal/60 px-1.5 py-0.5 font-sans text-[10px] text-signal">You</span> : null}
    </span>
  );
}

function finalityText(c: Condition, r?: FinalResult) {
  if (c.status === "SETTLED" || c.status === "FINALIZED") return { text: "Final", tone: "text-yes" };
  if (c.status === "ACCEPTED") {
    const left = c.finalizable_at - Math.floor(Date.now() / 1000);
    return {
      text: left > 0 ? `Pending: finality delay ends ${formatTime(c.finalizable_at)} (${formatDuration(left)})` : "Finality delay over: ready to finalize",
      tone: "text-maybe",
    };
  }
  if (r?.has_result) return { text: "Pending", tone: "text-maybe" };
  return { text: "No result yet", tone: "text-dim" };
}

function Detail({ c }: { c: Condition }) {
  const { config } = useStatelock();
  const policy = usePolicy(c.condition_id);
  const observations = useObservations(c.condition_id);
  const final = useFinalResult(c.condition_id);
  const history = useContractHistory();
  const txs = history.data ? historyFor(history.data, c) : [];
  const { address } = useConnection();
  const fin = finalityText(c, final.data);

  const settlement =
    c.status === "SETTLED"
      ? `${formatGen(c.settled_amount)} paid to ${sameAddress(c.settled_to, c.beneficiary) ? "the beneficiary" : "the creator"} on ${formatTime(c.settled_at)}`
      : c.status === "FINALIZED"
        ? `Ready: ${formatGen(c.bounty_deposited)} will go to ${c.result_verdict === "SATISFIED" ? "the beneficiary" : "the creator"}`
        : c.status === "CANCELLED"
          ? "Cancelled before arming"
          : "Not settled";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/commitments" className="inline-flex items-center gap-2 text-sm text-dim hover:text-text">
        <ArrowLeft className="size-4" /> All commitments
      </Link>

      <header className="mt-6 grid gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-dim">{c.condition_id}</span>
          <StatusChip status={c.status} />
          {c.result_verdict ? <VerdictChip verdict={c.result_verdict} /> : null}
        </div>
        <h1 className="max-w-4xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl" style={{ fontStretch: "106%" }}>
          {c.condition_text}
        </h1>
        <p className="text-dim">{statusMeaning(c.status)}</p>
        <LifecycleRail status={c.status} />
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── ON-CHAIN ─────────────────────────────────────────────── */}
        <div className="grid content-start gap-6">
          <div className="flex items-center gap-3">
            <span className="size-2 bg-signal" aria-hidden="true" />
            <h2 className="font-mono text-xs tracking-[0.2em] text-text">ON-CHAIN</h2>
            <span className="text-xs text-dim">Authoritative contract state</span>
          </div>

          <Section tag="Result" title="Adjudicated result" aside={c.result_verdict ? <VerdictChip verdict={c.result_verdict} size="lg" /> : null}>
            <Rows
              rows={[
                ["Current result", c.result_verdict ? reasonLabel(c.result_reason) : "No conclusive result yet"],
                ["Temporal relevance", c.result_temporal ? temporalLabel(c.result_temporal) : "Not yet"],
                ["Finality", <span key="f" className={fin.tone}>{fin.text}</span>],
                ["Consequence", c.result_verdict ? consequenceLabel(c.result_verdict) : "Satisfied pays the beneficiary; otherwise the creator is refunded"],
                ["Settlement", settlement],
              ]}
            />
          </Section>

          <Section tag="Actions" title="What can happen next">
            <ActionsPanel c={c} />
          </Section>

          <Section tag="Terms" title="Locked terms">
            <Rows
              rows={[
                ["Creator", <Address key="c" value={c.creator} you={sameAddress(c.creator, address)} />],
                ["Beneficiary", <Address key="b" value={c.beneficiary} you={sameAddress(c.beneficiary, address)} />],
                ["Bounty", <span key="bt" className="font-mono">{formatGen(c.bounty_terms)}</span>],
                ["Deposited now", <span key="bd" className="font-mono">{formatGen(c.bounty_deposited)}</span>],
                ["Observation window", `${formatTime(c.observation_start)} to ${formatTime(c.deadline)}`],
                ["Deadline", formatTime(c.deadline)],
                ["Observation closes", formatTime(c.observation_closes)],
                ["Terms", c.locked ? "Frozen: cannot be changed by anyone" : "Not yet armed"],
              ]}
            />
          </Section>

          <Section tag="Timeline" title="Recorded timestamps">
            <Rows
              rows={(
                [
                  ["Created", c.created_at],
                  ["Funded", c.funded_at],
                  ["Armed", c.armed_at],
                  ["Last observed", c.last_observed_at],
                  ["Result accepted", c.accepted_at],
                  ["Finalizable from", c.finalizable_at],
                  ["Finalized", c.finalized_at],
                  ["Settled", c.settled_at],
                  ["Cancelled", c.cancelled_at],
                ] as [string, number][]
              )
                .filter(([, t]) => t > 0)
                .map(([k, t]) => [k, formatTime(t)])}
            />
          </Section>

          <Section
            tag="Transactions"
            title="Transaction hashes"
            aside={<span className="text-xs text-dim">Read from GenLayer StudioNet</span>}
          >
            {history.isLoading ? (
              <Skeleton className="h-24 rounded-none bg-ink" />
            ) : history.isError ? (
              <p className="text-sm text-dim">The transaction history could not be read right now.</p>
            ) : txs.length === 0 ? (
              <p className="text-sm text-dim">No transactions found for this commitment.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-dim">
                      <th className="px-5 pb-2 font-normal">Action</th>
                      <th className="px-3 pb-2 font-normal">When</th>
                      <th className="px-3 pb-2 font-normal">Outcome</th>
                      <th className="px-5 pb-2 font-normal">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => (
                      <tr key={t.hash} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5">{methodLabel(t.method)}</td>
                        <td className="px-3 py-2.5 text-dim">{formatTime(t.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <span className={t.execution === "ERROR" ? "text-no" : "text-text"}>
                            {t.execution === "ERROR" ? "Refused" : t.execution === "SUCCESS" ? "Executed" : "Pending"}
                          </span>
                          <span className="text-dim"> · {protocolStatusLabel(t.status)}</span>
                        </td>
                        <td className="px-5 py-2.5">
                          <a
                            href={`${EXPLORER_URL}/tx/${t.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs hover:text-signal"
                          >
                            {t.hash.slice(0, 10)}…{t.hash.slice(-6)}
                            <ExternalLink className="size-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section tag="Verification" title="Contract and hashes">
            <Rows
              rows={[
                [
                  "Contract",
                  <a
                    key="a"
                    className="inline-flex items-center gap-1 font-mono text-xs break-all hover:text-signal"
                    href={`${EXPLORER_URL}/address/${config.contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {config.contractAddress}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>,
                ],
                ["Terms hash", <span key="t" className="font-mono text-xs break-all">{c.terms_hash}</span>],
                ["Policy hash", <span key="p" className="font-mono text-xs break-all">{c.policy_hash}</span>],
              ]}
            />
          </Section>
        </div>

        {/* ── EXTERNAL EVIDENCE ────────────────────────────────────── */}
        <div className="grid content-start gap-6">
          <div className="flex items-center gap-3">
            <span className="size-2 border border-dim" aria-hidden="true" />
            <h2 className="font-mono text-xs tracking-[0.2em] text-text">EXTERNAL EVIDENCE</h2>
            <span className="text-xs text-dim">Supports the judgment; does not decide it</span>
          </div>
          <div className="flex gap-3 border border-line p-4 text-sm text-dim">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-maybe" />
            <p>
              External pages are untrusted input. Below is what GenLayer validators extracted from the frozen sources
              and agreed on, as stored by the contract. Raw pages are never shown as contract state, and the finalized
              result on the left is authoritative.
            </p>
          </div>
          <EvidencePanel policy={policy.data} policyLoading={policy.isLoading} observations={observations.data} observationsLoading={observations.isLoading} deadline={c.deadline} />
        </div>
      </div>
    </div>
  );
}

