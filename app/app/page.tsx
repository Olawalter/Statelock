"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useProtocol } from "@/lib/hooks/use-commitments";
import { formatDuration, formatGen } from "@/lib/present";

const LIFECYCLE = [
  { step: "Define", body: "State the real-world condition, the sources allowed to prove it, and the facts that must be true." },
  { step: "Lock", body: "Deposit the exact bounty and arm. From that transaction on, nothing in the terms can change." },
  { step: "Observe", body: "Inside the window, anyone can ask GenLayer to read the allowed sources. No oracle, no backend." },
  { step: "Adjudicate", body: "Validators each read the evidence and must agree. Code, not the model, turns findings into a verdict." },
  { step: "Finalize", body: "After the finality delay the result is final and the bounty settles to its predetermined recipient, once." },
];

export default function Landing() {
  const protocol = useProtocol();
  const p = protocol.data;

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-rule pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="tag mb-6">Conditional reality verification · GenLayer</p>
            <h1
              className="text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.92] font-bold tracking-[-0.02em]"
              style={{ fontStretch: "112%" }}
            >
              LOCK THE CONDITION.
              <br />
              <span className="text-signal">LET REALITY DECIDE.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-dim">
              Precommit a real-world condition, freeze the rules, and let GenLayer adjudicate the outcome from live
              external information.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/create" className={buttonVariants({ size: "lg" })}>
                Create Commitment
                <ArrowRight data-icon="inline-end" />
              </Link>
              <Link href="/commitments" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Explore Commitments
              </Link>
            </div>
          </div>

          <aside className="border border-line bg-well" aria-label="Live protocol state">
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="tag">On-chain now</span>
              <span className="font-mono text-[11px] text-dim">{p?.version ?? (protocol.isError ? "Unavailable" : "Reading contract…")}</span>
            </header>
            <dl className="grid grid-cols-2">
              {[
                ["Commitments", p ? String(p.condition_count) : "—"],
                ["GEN locked", p ? formatGen(p.total_locked) : "—"],
                ["Finality delay", p ? formatDuration(p.limits.finality_delay_seconds) : "—"],
                ["Sources per policy", p ? `Up to ${p.limits.max_sources}` : "—"],
              ].map(([k, v], i) => (
                <div key={k} className={`border-line px-5 py-5 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t" : ""}`}>
                  <dt className="tag">{k}</dt>
                  <dd className="mt-2 font-mono text-xl">{v}</dd>
                </div>
              ))}
            </dl>
            {protocol.isError ? (
              <p className="border-t border-line px-5 py-3 text-xs text-no">The contract could not be read right now.</p>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontStretch: "108%" }}>
            DEFINE → LOCK → OBSERVE → ADJUDICATE → FINALIZE
          </h2>
          <p className="max-w-md text-sm text-dim">
            Five stages, each one a transaction on GenLayer. The interface shows what the contract says; it decides
            nothing.
          </p>
        </div>
        <ol className="grid border border-line md:grid-cols-5">
          {LIFECYCLE.map((s, i) => (
            <li key={s.step} className={`border-line p-6 ${i ? "border-t md:border-t-0 md:border-l" : ""}`}>
              <span className="font-mono text-xs text-signal">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.step}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-well">
        <div className="mx-auto grid max-w-7xl gap-px px-4 py-20 sm:px-6 md:grid-cols-3">
          {[
            [
              "The model never moves money",
              "Validators report what each fact's sources show. The contract's code derives the verdict, and the consequence was fixed before observation began.",
            ],
            [
              "Evidence is data, not instruction",
              "Only the sources frozen in the policy are read. Their text is fenced and bounded, and nothing inside it can change the rules or the recipient.",
            ],
            [
              "Uncertainty refunds the creator",
              "Unreadable, contradictory or undated evidence is Undetermined. Undetermined and Not satisfied return the bounty to the creator. Settlement happens once, after finality.",
            ],
          ].map(([t, b]) => (
            <div key={t} className="p-6 md:p-8">
              <h3 className="text-lg font-semibold">{t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-dim">{b}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
