import { ExternalLink } from "lucide-react";

import { VerdictChip } from "@/components/commitment/status";
import { Skeleton } from "@/components/ui/skeleton";
import type { Observation, Policy } from "@/lib/contracts/statelock";
import {
  factStatusLabel,
  formatTime,
  phaseLabel,
  reasonLabel,
  sourceKindLabel,
  temporalLabel,
} from "@/lib/present";

const FACT_TONE: Record<string, string> = {
  CONFIRMED: "text-yes",
  NOT_CONFIRMED: "text-no",
  CONFLICTING: "text-maybe",
};

export function EvidencePanel({
  policy,
  policyLoading,
  observations,
  observationsLoading,
  deadline,
}: {
  policy?: Policy;
  policyLoading: boolean;
  observations?: Observation[];
  observationsLoading: boolean;
  deadline: number;
}) {
  const sourceById = new Map((policy?.sources ?? []).map((s) => [s.id, s]));
  const factByName = new Map((policy?.required_facts ?? []).map((f) => [f.name, f]));

  return (
    <div className="grid gap-6">
      <section className="border border-line">
        <header className="border-b border-line px-5 py-3">
          <span className="tag">Frozen policy</span>
          <h3 className="text-sm font-semibold">Sources allowed to prove the condition</h3>
        </header>
        {policyLoading || !policy ? (
          <Skeleton className="m-5 h-24 rounded-none bg-well" />
        ) : (
          <div className="grid gap-5 p-5">
            <ol className="grid gap-3">
              {policy.sources.map((s, i) => (
                <li key={s.id} className="grid gap-1 border-l-2 border-line pl-4">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-dim">Source {i + 1}</span>
                    <span className="font-medium">{s.label}</span>
                  </div>
                  <span className="text-xs text-dim">
                    {sourceKindLabel(s.kind)} · {s.host}
                  </span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-mono text-[11px] break-all text-dim hover:text-signal"
                  >
                    {s.url}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </li>
              ))}
            </ol>
            <div>
              <p className="mb-2 text-sm font-medium">Required facts</p>
              <ul className="grid gap-2 text-sm">
                {policy.required_facts.map((f) => (
                  <li key={f.name} className="text-dim">
                    <span className="text-text">{f.description}</span>
                    {f.expected ? <> · expected “{f.expected}”</> : null}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-dim">
              {policy.require_independent_sources
                ? "Every fact must be confirmed by sources on at least two different sites."
                : "Independent confirmation is not required."}{" "}
              The event must have happened by {formatTime(deadline)}.
            </p>
            {policy.instructions ? (
              <p className="border-l-2 border-line pl-3 text-sm text-dim">{policy.instructions}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="border border-line">
        <header className="border-b border-line px-5 py-3">
          <span className="tag">Observations</span>
          <h3 className="text-sm font-semibold">What validators extracted and agreed on</h3>
        </header>
        {observationsLoading ? (
          <Skeleton className="m-5 h-32 rounded-none bg-well" />
        ) : !observations?.length ? (
          <p className="p-5 text-sm text-dim">
            Nobody has observed this commitment yet. Once the window opens, anyone can trigger an observation.
          </p>
        ) : (
          <ol className="grid">
            {[...observations].reverse().map((o) => (
              <li key={o.index} className="grid gap-4 border-b border-line p-5 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-dim">Observation {o.index}</p>
                    <p className="text-sm">{formatTime(o.observed_at)}</p>
                    <p className="text-xs text-dim">{phaseLabel(o.phase)}</p>
                  </div>
                  <div className="text-right">
                    <VerdictChip verdict={o.verdict} />
                    <p className="mt-1 text-xs text-dim">{o.conclusive ? "Conclusive" : "Not conclusive: observing continues"}</p>
                  </div>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-dim">Reason</dt>
                    <dd>{reasonLabel(o.reason_code)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-dim">Temporal relevance</dt>
                    <dd>{temporalLabel(o.temporal_result)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-dim">Sources that could be read</dt>
                    <dd>
                      {o.sources_readable.length === 0
                        ? "None of the allowed sources could be read"
                        : o.sources_readable.map((id) => sourceById.get(id)?.label ?? id).join(", ")}
                    </dd>
                  </div>
                </dl>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <caption className="sr-only">Extracted facts</caption>
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-dim">
                        <th className="py-2 pr-3 font-normal">Fact</th>
                        <th className="px-3 py-2 font-normal">Finding</th>
                        <th className="py-2 pl-3 font-normal">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.facts.map((f) => (
                        <tr key={f.name} className="border-b border-line last:border-0">
                          <td className="py-2 pr-3">{factByName.get(f.name)?.description ?? f.name}</td>
                          <td className={`px-3 py-2 ${FACT_TONE[f.status] ?? ""}`}>
                            {factStatusLabel(f.status)}
                            {f.independent === true ? <span className="block text-xs text-dim">Independently confirmed</span> : null}
                            {f.independent === false ? <span className="block text-xs text-dim">Not independently confirmed</span> : null}
                          </td>
                          <td className="py-2 pl-3 font-mono text-xs">{f.value || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
