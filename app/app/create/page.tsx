"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";

import { Field, SelectInput, TextArea, TextInput } from "@/components/commitment/fields";
import { TxTracker } from "@/components/settlement/tx-tracker";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDeployment, useNetwork } from "@/components/wallet/network-status";
import { createCall, reads, SOURCE_KINDS, verbCall, type Condition } from "@/lib/contracts/statelock";
import { initialTx, type TxState } from "@/lib/genlayer/tx";
import {
  consequenceLabel,
  formatGen,
  formatTime,
  parseGen,
  shortAddress,
  sourceKindLabel,
} from "@/lib/present";
import {
  conditionStep,
  consequenceStep,
  firstIssue,
  hostOf,
  LIMITS,
  policyJson,
  policyStep,
  timeStep,
  type PolicyInput,
} from "@/lib/validation/commitment";
import { useStatelock } from "@/providers/app-providers";
import { useTx } from "@/providers/tx-provider";

const STEPS = ["Define condition", "Verification policy", "Time boundary", "Locked consequence", "Review"] as const;

type Source = PolicyInput["sources"][number];
type Fact = PolicyInput["facts"][number];

const nowSec = () => Math.floor(Date.now() / 1000);

/** A datetime-local value read as UTC — the contract's own clock. */
function utcInputToUnix(v: string): number {
  if (!v) return 0;
  const t = Date.parse(`${v}:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}
function unixToUtcInput(s: number): string {
  return new Date(s * 1000).toISOString().slice(0, 16);
}

export default function CreatePage() {
  const { client, config } = useStatelock();
  const { address } = useConnection();
  const net = useNetwork();
  const deployment = useDeployment();
  const { send } = useTx();

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);

  const [conditionText, setConditionText] = useState("");
  const [sources, setSources] = useState<Source[]>([{ url: "", kind: "OFFICIAL_REPOSITORY", label: "" }]);
  const [facts, setFacts] = useState<Fact[]>([{ name: "", description: "", expected: "" }]);
  const [requireIndependent, setRequireIndependent] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [startInput, setStartInput] = useState(() => unixToUtcInput(nowSec() + 3600));
  const [deadlineInput, setDeadlineInput] = useState(() => unixToUtcInput(nowSec() + 7 * 86400));
  const [bounty, setBounty] = useState("");
  const [beneficiary, setBeneficiary] = useState("");

  const [created, setCreated] = useState<Condition | null>(null);
  const [funded, setFunded] = useState(false);
  const [armed, setArmed] = useState(false);
  const [tx, setTx] = useState<{ label: string; state: TxState } | null>(null);

  const policy: PolicyInput = { sources, facts, requireIndependentSources: requireIndependent, instructions };
  const observationStart = utcInputToUnix(startInput);
  const deadline = utcInputToUnix(deadlineInput);
  const bountyAtto = parseGen(bounty) ?? 0n;
  const json = policyJson(policy);

  const issues = useMemo(
    () => [
      firstIssue(conditionStep.safeParse({ conditionText })),
      firstIssue(policyStep.safeParse(policy)) ?? (json.length > LIMITS.policyJson ? "The policy is too long. Shorten descriptions or remove a source." : null),
      firstIssue(timeStep.safeParse({ observationStart, deadline, now: nowSec() })),
      firstIssue(consequenceStep.safeParse({ bounty, beneficiary })),
      null,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conditionText, json, observationStart, deadline, bounty, beneficiary],
  );

  const locked = created !== null; // terms are on chain: the form is read-only from here
  const canTransact = net.correct && deployment.data?.ok === true;
  const busy = tx !== null && tx.state.stage !== "FAILED" && tx.state.stage !== "CONTRACT_STATE_UPDATED";

  function next() {
    setAttempted(true);
    if (issues[step]) return;
    setAttempted(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function doCreate() {
    if (!address) return;
    const before = await reads.byCreator(client, config, address, 0, 1).then((p) => p.total).catch(() => 0);
    const call = createCall({
      conditionText: conditionText.trim(),
      policyJson: json,
      observationStart,
      deadline,
      bountyAtto,
      beneficiary: beneficiary.trim(),
    });
    let found: Condition | null = null;
    setTx({ label: "Create", state: initialTx });
    const record = await send({
      title: "Create commitment",
      effect: "The commitment's terms and policy are recorded on-chain as a draft.",
      ...call,
      reconciled: async () => {
        const page = await reads.byCreator(client, config, address, Math.max(0, before), 50);
        found = page.rows.find((r) => r.condition_text === conditionText.trim()) ?? null;
        if (found) setCreated(found);
        return found !== null;
      },
    });
    setTx({ label: "Create", state: record.state });
  }

  async function doFund() {
    if (!created) return;
    const id = created.condition_id;
    setTx({ label: "Fund", state: initialTx });
    const record = await send({
      title: `Fund ${id}`,
      effect: `${formatGen(created.bounty_terms)} is deposited and held by the contract.`,
      ...verbCall("fund", id, created.bounty_terms),
      reconciled: async () => (await reads.condition(client, config, id)).status === "FUNDED",
    });
    if (record.state.stage === "CONTRACT_STATE_UPDATED") setFunded(true);
    setTx({ label: "Fund", state: record.state });
  }

  async function doArm() {
    if (!created) return;
    const id = created.condition_id;
    setTx({ label: "Arm", state: initialTx });
    const record = await send({
      title: `Arm ${id}`,
      effect: "The commitment is armed. Its terms are frozen and the bounty is locked until settlement.",
      ...verbCall("arm", id),
      reconciled: async () => (await reads.condition(client, config, id)).status === "ARMED",
    });
    if (record.state.stage === "CONTRACT_STATE_UPDATED") setArmed(true);
    setTx({ label: "Arm", state: record.state });
  }

  const shownIssue = attempted ? issues[step] : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[240px_1fr]">
      <aside>
        <p className="tag">New commitment</p>
        <ol className="mt-5 grid gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                disabled={locked || i > step}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${
                  i === step ? "border-signal bg-well text-text" : i < step ? "border-dim/50 text-text hover:bg-well" : "border-line text-dim"
                }`}
              >
                <span className="font-mono text-[11px] text-dim">0{i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ fontStretch: "108%" }}>
          {STEPS[step]}
        </h1>

        <div className="mt-8 grid max-w-3xl gap-7">
          {step === 0 ? (
            <>
              <p className="text-dim">
                Write the condition as a statement that is either true or not by the deadline. It becomes part of the
                immutable terms.
              </p>
              <Field label="Condition" htmlFor="condition" counter={{ value: conditionText.trim().length, max: LIMITS.conditionText }}>
                <TextArea
                  id="condition"
                  value={conditionText}
                  onChange={(e) => setConditionText(e.target.value)}
                  placeholder="genlayer-js publishes version 2.0.0 as a stable release"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="text-dim">
                Only these sources will ever be read, and only these facts decide the result. Evidence found anywhere
                else is ignored.
              </p>
              <fieldset className="grid gap-4">
                <legend className="mb-3 text-sm font-medium">Allowed sources</legend>
                {sources.map((s, i) => (
                  <div key={i} className="grid gap-3 border border-line bg-well p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-dim">Source {i + 1}</span>
                      {sources.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove source ${i + 1}`}
                          className="text-dim hover:text-no"
                          onClick={() => setSources(sources.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <Field label="Address" htmlFor={`src-url-${i}`} hint={s.url && hostOf(s.url) ? `Site: ${hostOf(s.url)}` : "A public https:// page or API response."}>
                      <TextInput
                        id={`src-url-${i}`}
                        inputMode="url"
                        value={s.url}
                        placeholder="https://api.github.com/repos/owner/project/releases/latest"
                        onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name" htmlFor={`src-label-${i}`}>
                        <TextInput
                          id={`src-label-${i}`}
                          value={s.label}
                          maxLength={LIMITS.sourceLabel}
                          placeholder="Project release record"
                          onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        />
                      </Field>
                      <Field label="Type" htmlFor={`src-kind-${i}`}>
                        <SelectInput
                          id={`src-kind-${i}`}
                          value={s.kind}
                          onChange={(e) =>
                            setSources(sources.map((x, j) => (j === i ? { ...x, kind: e.target.value as Source["kind"] } : x)))
                          }
                        >
                          {SOURCE_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {sourceKindLabel(k)}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                    </div>
                  </div>
                ))}
                {sources.length < LIMITS.sources ? (
                  <Button
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => setSources([...sources, { url: "", kind: "OFFICIAL_DOCUMENTATION", label: "" }])}
                  >
                    <Plus data-icon="inline-start" />
                    Add source
                  </Button>
                ) : null}
              </fieldset>

              <fieldset className="grid gap-4">
                <legend className="mb-3 text-sm font-medium">Required facts</legend>
                {facts.map((f, i) => (
                  <div key={i} className="grid gap-3 border border-line bg-well p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-dim">Fact {i + 1}</span>
                      {facts.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove fact ${i + 1}`}
                          className="text-dim hover:text-no"
                          onClick={() => setFacts(facts.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Key" htmlFor={`fact-name-${i}`} hint="Lowercase, e.g. released_version">
                        <TextInput
                          id={`fact-name-${i}`}
                          value={f.name}
                          maxLength={LIMITS.factName}
                          className="font-mono"
                          placeholder="released_version"
                          onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, name: e.target.value.toLowerCase() } : x)))}
                        />
                      </Field>
                      <Field label="Expected value" htmlFor={`fact-exp-${i}`} hint="Optional. Leave empty for a yes or no fact.">
                        <TextInput
                          id={`fact-exp-${i}`}
                          value={f.expected}
                          maxLength={LIMITS.expected}
                          placeholder="2.0.0"
                          onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))}
                        />
                      </Field>
                    </div>
                    <Field label="What must be true" htmlFor={`fact-desc-${i}`} counter={{ value: f.description.trim().length, max: LIMITS.factDescription }}>
                      <TextArea
                        id={`fact-desc-${i}`}
                        className="min-h-16"
                        value={f.description}
                        placeholder="The version number of the published stable release"
                        onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                      />
                    </Field>
                  </div>
                ))}
                {facts.length < LIMITS.facts ? (
                  <Button
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => setFacts([...facts, { name: "", description: "", expected: "" }])}
                  >
                    <Plus data-icon="inline-start" />
                    Add fact
                  </Button>
                ) : null}
              </fieldset>

              <label className="flex items-start gap-3 border border-line p-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#ff6b00]"
                  checked={requireIndependent}
                  onChange={(e) => setRequireIndependent(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Require independent confirmation</span>
                  <span className="mt-1 block text-dim">
                    Every fact must be confirmed by sources on at least two different sites. Pages on the same site are
                    never counted as independent.
                  </span>
                </span>
              </label>

              <Field label="Reading instructions" htmlFor="instructions" hint="Optional. Clarifies the facts; cannot override them." counter={{ value: instructions.trim().length, max: LIMITS.instructions }}>
                <TextArea
                  id="instructions"
                  value={instructions}
                  placeholder="A release candidate or pre-release does not count."
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-dim">
                Times are UTC, the contract&apos;s clock. The contract reads its own transaction time, never your
                device&apos;s. The commitment must be armed before the window opens.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Observation window opens (UTC)" htmlFor="start" hint={observationStart ? formatTime(observationStart) : undefined}>
                  <TextInput id="start" type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
                </Field>
                <Field label="Deadline (UTC)" htmlFor="deadline" hint={deadline ? formatTime(deadline) : undefined}>
                  <TextInput id="deadline" type="datetime-local" value={deadlineInput} onChange={(e) => setDeadlineInput(e.target.value)} />
                </Field>
              </div>
              <ul className="grid gap-2 border border-line bg-well p-4 text-sm text-dim">
                <li>Inside the window, a conclusive Satisfied result can be reached early. A negative reading keeps observing.</li>
                <li>After the deadline, the next observation is conclusive either way. The event itself must have happened by the deadline.</li>
                <li>If nobody observes within seven days after the deadline, the result is Undetermined and the creator is refunded.</li>
              </ul>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-dim">The bounty and who receives it are fixed now. The model never chooses either.</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Bounty (GEN)" htmlFor="bounty" hint="Deposited exactly, in one funding transaction.">
                  <TextInput id="bounty" inputMode="decimal" value={bounty} placeholder="10" onChange={(e) => setBounty(e.target.value)} />
                </Field>
                <Field label="Beneficiary address" htmlFor="beneficiary" hint="Receives the bounty only if the condition is satisfied.">
                  <TextInput
                    id="beneficiary"
                    className="font-mono"
                    value={beneficiary}
                    placeholder="0x…"
                    onChange={(e) => setBeneficiary(e.target.value)}
                  />
                </Field>
              </div>
              <table className="w-full border border-line text-sm">
                <caption className="sr-only">Deterministic consequence</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-2.5 font-normal text-dim">Final result</th>
                    <th className="px-4 py-2.5 font-normal text-dim">Consequence</th>
                  </tr>
                </thead>
                <tbody>
                  {["SATISFIED", "NOT_SATISFIED", "UNDETERMINED"].map((v) => (
                    <tr key={v} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">{v === "SATISFIED" ? "Satisfied" : v === "NOT_SATISFIED" ? "Not satisfied" : "Undetermined"}</td>
                      <td className="px-4 py-3">{consequenceLabel(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {step === 4 ? (
            <Review
              conditionText={conditionText.trim()}
              policy={policy}
              observationStart={observationStart}
              deadline={deadline}
              bountyAtto={bountyAtto}
              beneficiary={beneficiary.trim()}
              creator={address}
            />
          ) : null}

          {shownIssue ? (
            <p role="alert" className="border-l-2 border-no pl-3 text-sm">
              {shownIssue}
            </p>
          ) : null}

          {step < 4 ? (
            <div className="flex flex-wrap gap-3 border-t border-line pt-6">
              {step > 0 ? (
                <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}>
                  <ArrowLeft data-icon="inline-start" />
                  Back
                </Button>
              ) : null}
              <Button size="lg" onClick={next}>
                Continue
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 border-t border-line pt-6">
              <div role="note" className="flex gap-3 border border-maybe/50 bg-maybe/10 p-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-maybe" />
                <p className="text-sm">
                  <strong className="font-semibold">After ARM, these parameters cannot be changed.</strong>{" "}
                  <span className="text-dim">
                    Not by you, not by the beneficiary, and not by anyone operating this site. There is no admin.
                  </span>
                </p>
              </div>

              {!address ? <p className="text-sm text-dim">Connect a wallet to create this commitment.</p> : null}
              {address && !canTransact ? (
                <p className="text-sm text-maybe">Transactions are disabled until your wallet is on GenLayer StudioNet and the contract is verified.</p>
              ) : null}

              <ol className="grid gap-3 sm:grid-cols-3">
                <SequenceStep n={1} title="Create" done={!!created} detail={created ? `Recorded as ${created.condition_id}` : "Record the terms as a draft"}>
                  {!created ? (
                    <Button disabled={!address || !canTransact || busy || issues.some(Boolean)} onClick={doCreate}>
                      Create commitment
                    </Button>
                  ) : null}
                </SequenceStep>
                <SequenceStep n={2} title="Fund" done={funded} detail={`Deposit exactly ${formatGen(bountyAtto)}`}>
                  {created && !funded ? (
                    <Button disabled={!canTransact || busy} onClick={doFund}>
                      Fund bounty
                    </Button>
                  ) : null}
                </SequenceStep>
                <SequenceStep n={3} title="ARM" done={armed} detail="Freeze terms and lock the bounty">
                  {funded && !armed ? (
                    <Button disabled={!canTransact || busy} onClick={doArm}>
                      <Lock data-icon="inline-start" />
                      ARM commitment
                    </Button>
                  ) : null}
                </SequenceStep>
              </ol>

              {tx ? (
                <div className="border border-line bg-well p-5">
                  <p className="tag mb-4">{tx.label} transaction</p>
                  <TxTracker state={tx.state} />
                </div>
              ) : null}

              {armed && created ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border border-yes/50 bg-yes/10 p-5">
                  <p>
                    <strong className="font-semibold">{created.condition_id} is armed.</strong>{" "}
                    <span className="text-dim">Its terms are locked and the bounty is held until settlement.</span>
                  </p>
                  <Link href={`/commitments/${created.condition_id}`} className={buttonVariants()}>
                    Open commitment
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SequenceStep({ n, title, detail, done, children }: { n: number; title: string; detail: string; done: boolean; children?: React.ReactNode }) {
  return (
    <li className={`grid content-start gap-3 border p-4 ${done ? "border-yes/50" : "border-line"}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-dim">0{n}</span>
        {done ? <span className="text-xs text-yes">Done</span> : null}
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-dim">{detail}</p>
      </div>
      {children}
    </li>
  );
}

function Review(props: {
  conditionText: string;
  policy: PolicyInput;
  observationStart: number;
  deadline: number;
  bountyAtto: bigint;
  beneficiary: string;
  creator?: string;
}) {
  const { policy } = props;
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid gap-1 border-b border-line px-5 py-4 last:border-0 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="text-sm text-dim">{k}</dt>
      <dd className="min-w-0 text-sm break-words">{v}</dd>
    </div>
  );
  return (
    <section className="border border-line bg-well" aria-label="Commitment preview">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <Lock className="size-4 text-signal" />
        <span className="tag">Immutable terms preview</span>
      </header>
      <dl>
        {row("Condition", <span className="text-base">{props.conditionText}</span>)}
        {row("Creator", props.creator ? <span className="font-mono text-xs">{props.creator}</span> : "Connect a wallet")}
        {row("Beneficiary", <span className="font-mono text-xs">{props.beneficiary}</span>)}
        {row("Bounty", <span className="font-mono">{formatGen(props.bountyAtto)}</span>)}
        {row("Observation window", `${formatTime(props.observationStart)} to ${formatTime(props.deadline)}`)}
        {row(
          "Allowed sources",
          <ul className="grid gap-2">
            {policy.sources.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.label}</span> <span className="text-dim">· {sourceKindLabel(s.kind)}</span>
                <span className="block font-mono text-xs break-all text-dim">{s.url}</span>
              </li>
            ))}
          </ul>,
        )}
        {row(
          "Required facts",
          <ul className="grid gap-2">
            {policy.facts.map((f, i) => (
              <li key={i}>
                {f.description}
                {f.expected ? <span className="text-dim"> · expected “{f.expected}”</span> : null}
              </li>
            ))}
          </ul>,
        )}
        {row("Independent confirmation", policy.requireIndependentSources ? "Required, from two or more different sites" : "Not required")}
        {policy.instructions ? row("Reading instructions", policy.instructions) : null}
        {row(
          "Consequence",
          <ul className="grid gap-1">
            <li>Satisfied: bounty to {shortAddress(props.beneficiary)}</li>
            <li>Not satisfied or Undetermined: bounty back to the creator</li>
          </ul>,
        )}
      </dl>
    </section>
  );
}
