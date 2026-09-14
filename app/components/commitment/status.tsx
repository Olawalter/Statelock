import { statusLabel, verdictLabel } from "@/lib/present";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "border-line text-dim",
  FUNDED: "border-line text-text",
  ARMED: "border-signal/60 text-signal",
  OBSERVING: "border-signal/60 text-signal",
  ACCEPTED: "border-maybe/60 text-maybe",
  FINALIZED: "border-yes/60 text-yes",
  SETTLED: "border-yes/60 text-yes",
  CANCELLED: "border-line text-dim",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs ${STATUS_TONE[status] ?? "border-line text-dim"}`}>
      <span className="size-1.5 bg-current" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

const VERDICT_TONE: Record<string, string> = {
  SATISFIED: "border-yes/60 bg-yes/10 text-yes",
  NOT_SATISFIED: "border-no/60 bg-no/10 text-no",
  UNDETERMINED: "border-maybe/60 bg-maybe/10 text-maybe",
};

export function VerdictChip({ verdict, size = "sm" }: { verdict: string; size?: "sm" | "lg" }) {
  if (!verdict) return null;
  return (
    <span
      className={`inline-flex items-center border font-semibold ${size === "lg" ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs"} ${VERDICT_TONE[verdict] ?? "border-line"}`}
    >
      {verdictLabel(verdict)}
    </span>
  );
}

/** DEFINE → LOCK → OBSERVE → ADJUDICATE → FINALIZE, with the commitment's position marked. */
const PHASES = [
  { key: "define", label: "Define", statuses: ["DRAFT", "FUNDED"] },
  { key: "lock", label: "Lock", statuses: ["ARMED"] },
  { key: "observe", label: "Observe", statuses: ["OBSERVING"] },
  { key: "adjudicate", label: "Adjudicate", statuses: ["ACCEPTED"] },
  { key: "finalize", label: "Finalize", statuses: ["FINALIZED", "SETTLED"] },
];

export function LifecycleRail({ status }: { status?: string }) {
  const at = status ? PHASES.findIndex((p) => p.statuses.includes(status)) : -1;
  const cancelled = status === "CANCELLED";
  return (
    <ol className="grid grid-cols-5 border border-line" aria-label="Lifecycle">
      {PHASES.map((p, i) => {
        const past = !cancelled && at >= 0 && i < at;
        const here = !cancelled && i === at;
        return (
          <li
            key={p.key}
            aria-current={here ? "step" : undefined}
            className={`relative border-line px-2 py-3 text-center sm:px-3 ${i ? "border-l" : ""} ${here ? "bg-surface" : ""}`}
          >
            <span className={`block font-mono text-[10px] ${here ? "text-signal" : "text-dim"}`}>0{i + 1}</span>
            <span className={`block text-xs sm:text-sm ${here || past ? "text-text" : "text-dim"}`}>{p.label}</span>
            {here ? <span className="absolute inset-x-0 top-0 h-0.5 bg-signal" /> : null}
            {past ? <span className="absolute inset-x-0 top-0 h-0.5 bg-dim/60" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
