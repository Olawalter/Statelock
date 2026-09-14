"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";

import { CommitmentCard } from "@/components/commitment/commitment-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Condition } from "@/lib/contracts/statelock";
import { useConditions, usePolicy } from "@/lib/hooks/use-commitments";
import { formatGen, sameAddress } from "@/lib/present";

type View = "mine" | "beneficiary" | "all";

function PolicyCard({ c }: { c: Condition }) {
  const policy = usePolicy(c.condition_id);
  const summary = policy.data
    ? `${policy.data.sources.length} ${policy.data.sources.length === 1 ? "source" : "sources"} · ${policy.data.required_facts.length} required ${policy.data.required_facts.length === 1 ? "fact" : "facts"}`
    : undefined;
  return <CommitmentCard c={c} policySummary={summary} />;
}

export default function Commitments() {
  const { address } = useConnection();
  const [view, setView] = useState<View>("all");
  const all = useConditions();
  const rows = useMemo(() => all.data ?? [], [all.data]);

  const shown = useMemo(() => {
    if (view === "mine") return rows.filter((c) => sameAddress(c.creator, address));
    if (view === "beneficiary") return rows.filter((c) => sameAddress(c.beneficiary, address));
    return rows;
  }, [rows, view, address]);

  const scope = view === "all" ? rows : shown;
  const metrics = [
    { label: "Active commitments", value: String(scope.filter((c) => !c.terminal).length) },
    { label: "Observing", value: String(scope.filter((c) => c.status === "ARMED" || c.status === "OBSERVING").length) },
    { label: "Pending finality", value: String(scope.filter((c) => c.status === "ACCEPTED").length) },
    { label: "GEN locked", value: formatGen(scope.reduce((s, c) => s + c.bounty_deposited, 0n)) },
  ];

  const tabs: { key: View; label: string; needsWallet: boolean }[] = [
    { key: "all", label: "All commitments", needsWallet: false },
    { key: "mine", label: "Created by me", needsWallet: true },
    { key: "beneficiary", label: "Naming me as beneficiary", needsWallet: true },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="tag">Dashboard</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontStretch: "108%" }}>
            Commitments
          </h1>
          <p className="mt-3 max-w-2xl text-dim">
            What is locked, what state it is in, and what GenLayer is doing with it. When a result is finalized,
            Satisfied pays the beneficiary; Not satisfied and Undetermined refund the creator.
          </p>
        </div>
        <Link href="/create" className={buttonVariants({ size: "lg" })}>
          <Plus data-icon="inline-start" />
          Create Commitment
        </Link>
      </div>

      <dl className="mt-10 grid grid-cols-2 border border-line lg:grid-cols-4">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={`border-line p-5 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
          >
            <dt className="tag">{m.label}</dt>
            <dd className="mt-2 font-mono text-2xl">{all.isLoading ? "—" : m.value}</dd>
          </div>
        ))}
      </dl>

      <div role="tablist" aria-label="Filter commitments" className="mt-10 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => {
          const disabled = t.needsWallet && !address;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={view === t.key}
              disabled={disabled}
              title={disabled ? "Connect a wallet to filter by your address" : undefined}
              onClick={() => setView(t.key)}
              className={`relative px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                view === t.key ? "text-text" : "text-dim hover:text-text"
              }`}
            >
              {t.label}
              {view === t.key ? <span className="absolute inset-x-4 -bottom-px h-0.5 bg-signal" /> : null}
            </button>
          );
        })}
      </div>

      <section className="mt-8" aria-live="polite">
        {all.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72 rounded-none bg-well" />
            ))}
          </div>
        ) : all.isError ? (
          <div className="border border-no/40 bg-no/10 p-6">
            <p className="font-semibold">The contract could not be read.</p>
            <p className="mt-1 text-sm text-dim">
              GenLayer StudioNet did not answer. It limits requests per minute; wait a moment, then{" "}
              <button className="underline hover:text-signal" onClick={() => all.refetch()}>
                try again
              </button>
              .
            </p>
          </div>
        ) : shown.length === 0 ? (
          <div className="border border-dashed border-line p-10 text-center">
            <p className="text-lg">
              {view === "all" ? "No commitments exist yet." : view === "mine" ? "You have not created a commitment." : "No commitment names you as beneficiary."}
            </p>
            <Link href="/create" className={`${buttonVariants({ variant: "outline" })} mt-5`}>
              Create the first one
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (
              <PolicyCard key={c.condition_id} c={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
