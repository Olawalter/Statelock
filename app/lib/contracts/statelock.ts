import { z } from "zod";

import type { AppConfig } from "@/lib/config";
import type { GenLayerClient } from "@/lib/genlayer/client";

/**
 * The STATELOCK contract as GenLayer describes it. Every method name and
 * argument order below was read from `gen_getContractSchema` for the deployed
 * contract (see scripts/inspect.py); every view is parsed with Zod, so a
 * response that is not what the contract returns is an error, never a guess.
 */

export const STATUSES = ["DRAFT", "FUNDED", "ARMED", "OBSERVING", "ACCEPTED", "FINALIZED", "SETTLED", "CANCELLED"] as const;
export const VERDICTS = ["SATISFIED", "NOT_SATISFIED", "UNDETERMINED"] as const;
export const SOURCE_KINDS = [
  "OFFICIAL_REPOSITORY",
  "OFFICIAL_DOCUMENTATION",
  "OFFICIAL_ANNOUNCEMENT",
  "OFFICIAL_API",
  "PUBLIC_REGISTRY",
  "OTHER",
] as const;
export const FACT_STATUSES = ["CONFIRMED", "NOT_CONFIRMED", "CONFLICTING"] as const;
export const TEMPORAL_RESULTS = ["BEFORE_DEADLINE", "AFTER_DEADLINE", "UNKNOWN", "NOT_APPLICABLE"] as const;
export const REASON_CODES = [
  "REQUIRED_FACTS_CONFIRMED",
  "REQUIRED_FACT_NOT_CONFIRMED",
  "EVENT_AFTER_DEADLINE",
  "EVENT_TIME_UNKNOWN",
  "SOURCES_CONFLICT",
  "SOURCES_UNAVAILABLE",
  "INDEPENDENCE_NOT_MET",
  "NOT_OBSERVED",
] as const;

/** The methods this app calls. A contract at the configured address that lacks any of them is not STATELOCK. */
export const REQUIRED_METHODS = {
  create_condition: ["condition_text", "policy_json", "observation_start", "deadline", "bounty_terms", "beneficiary"],
  fund_condition: ["condition_id"],
  cancel_condition: ["condition_id"],
  arm_condition: ["condition_id"],
  observe_condition: ["condition_id"],
  finalize_condition: ["condition_id"],
  settle_condition: ["condition_id"],
  get_protocol_info: [],
  get_condition: ["condition_id"],
  get_policy: ["condition_id"],
  get_observation: ["condition_id"],
  get_final_result: ["condition_id"],
  list_conditions: ["offset", "limit"],
  list_conditions_by_creator: ["creator", "offset", "limit"],
  get_returned_deposits: ["offset", "limit"],
} as const;

const int = z.number().int();
const amount = z.union([z.number(), z.string()]).transform((v) => BigInt(v));

export const conditionSchema = z.object({
  condition_id: z.string(),
  creator: z.string(),
  beneficiary: z.string(),
  condition_text: z.string(),
  policy_hash: z.string(),
  terms_hash: z.string(),
  observation_start: int,
  deadline: int,
  observation_closes: int,
  bounty_terms: amount,
  bounty_deposited: amount,
  status: z.enum(STATUSES),
  locked: z.boolean(),
  terminal: z.boolean(),
  created_at: int,
  funded_at: int,
  armed_at: int,
  observation_count: int,
  early_observations: int,
  early_observations_allowed: int,
  last_observed_at: int,
  accepted_at: int,
  finalizable_at: int,
  finalized_at: int,
  settled_at: int,
  cancelled_at: int,
  result_verdict: z.union([z.enum(VERDICTS), z.literal("")]),
  result_reason: z.string(),
  result_temporal: z.string(),
  result_observation: int,
  settled_to: z.string(),
  settled_amount: amount,
});
export type Condition = z.infer<typeof conditionSchema>;

export const pageSchema = z.object({
  total: int,
  offset: int,
  count: int,
  rows: z.array(conditionSchema),
});
export type ConditionPage = z.infer<typeof pageSchema>;

export const policySchema = z.object({
  sources: z.array(
    z.object({ id: z.string(), url: z.string(), host: z.string(), kind: z.enum(SOURCE_KINDS), label: z.string() }),
  ),
  required_facts: z.array(z.object({ name: z.string(), description: z.string(), expected: z.string() })),
  temporal_rule: z.string(),
  require_independent_sources: z.boolean(),
  instructions: z.string(),
  failure_behavior: z.string(),
  policy_hash: z.string(),
});
export type Policy = z.infer<typeof policySchema>;

export const observationSchema = z.object({
  index: int,
  observed_at: int,
  phase: z.enum(["WITHIN_WINDOW", "AFTER_DEADLINE"]),
  verdict: z.enum(VERDICTS),
  reason_code: z.string(),
  temporal_result: z.string(),
  conclusive: z.boolean(),
  facts: z.array(
    z.object({
      name: z.string(),
      status: z.enum(FACT_STATUSES),
      value: z.string(),
      independent: z.boolean().nullable(),
    }),
  ),
  sources_readable: z.array(z.string()),
});
export type Observation = z.infer<typeof observationSchema>;

export const finalResultSchema = z.object({
  condition_id: z.string(),
  status: z.enum(STATUSES),
  has_result: z.boolean(),
  final: z.boolean(),
  verdict: z.union([z.enum(VERDICTS), z.literal("")]),
  reason_code: z.string(),
  temporal_result: z.string(),
  observation_index: int,
  accepted_at: int,
  finalizable_at: int,
  finalized_at: int,
  destination: z.string(),
  settled: z.boolean(),
  settled_to: z.string(),
  settled_amount: amount,
  settled_at: int,
});
export type FinalResult = z.infer<typeof finalResultSchema>;

export const protocolSchema = z.object({
  version: z.string(),
  condition_count: int,
  total_locked: amount,
  time_source: z.string(),
  failure_behavior: z.string(),
  limits: z.object({
    max_sources: int,
    max_facts: int,
    max_condition_text: int,
    max_instructions: int,
    max_url: int,
    max_source_label: int,
    max_fact_name: int,
    max_fact_description: int,
    max_expected: int,
    max_policy_json: int,
    max_early_observations: int,
    observation_grace_seconds: int,
    finality_delay_seconds: int,
    max_horizon_seconds: int,
  }),
});
export type ProtocolInfo = z.infer<typeof protocolSchema>;

export const returnedPageSchema = z.object({
  total: int,
  offset: int,
  count: int,
  rows: z.array(
    z.object({
      index: int,
      condition_id: z.string(),
      sender: z.string(),
      amount: amount,
      reason: z.string(),
      returned_at: int,
    }),
  ),
});
export type ReturnedDeposits = z.infer<typeof returnedPageSchema>;

// ── reads ───────────────────────────────────────────────────────────────────

async function view<T>(client: GenLayerClient, config: AppConfig, fn: string, args: (string | number)[], schema: z.ZodType<T>) {
  const raw = await client.readContract({ address: config.contractAddress, functionName: fn, args, jsonSafeReturn: true });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`The contract's ${fn} answer did not match the STATELOCK interface.`);
  }
  return parsed.data;
}

export const reads = {
  protocol: (c: GenLayerClient, cfg: AppConfig) => view(c, cfg, "get_protocol_info", [], protocolSchema),
  condition: (c: GenLayerClient, cfg: AppConfig, id: string) => view(c, cfg, "get_condition", [id], conditionSchema),
  policy: (c: GenLayerClient, cfg: AppConfig, id: string) => view(c, cfg, "get_policy", [id], policySchema),
  observations: (c: GenLayerClient, cfg: AppConfig, id: string) =>
    view(c, cfg, "get_observation", [id], z.array(observationSchema)),
  finalResult: (c: GenLayerClient, cfg: AppConfig, id: string) => view(c, cfg, "get_final_result", [id], finalResultSchema),
  list: (c: GenLayerClient, cfg: AppConfig, offset: number, limit: number) =>
    view(c, cfg, "list_conditions", [offset, limit], pageSchema),
  byCreator: (c: GenLayerClient, cfg: AppConfig, creator: string, offset: number, limit: number) =>
    view(c, cfg, "list_conditions_by_creator", [creator.toLowerCase(), offset, limit], pageSchema),
  returned: (c: GenLayerClient, cfg: AppConfig, offset: number, limit: number) =>
    view(c, cfg, "get_returned_deposits", [offset, limit], returnedPageSchema),
};

/**
 * How a funding write is confirmed. The contract never keeps a deposit it
 * cannot use: it sends it straight back in the same transaction and records
 * why. So "done" is the condition showing FUNDED, and "declined" is a new
 * returned-deposit record from this sender for this condition.
 */
export async function fundingOutcome(c: GenLayerClient, cfg: AppConfig, conditionId: string, sender: string) {
  const before = (await reads.returned(c, cfg, 0, 1)).total;
  return async (): Promise<boolean | string> => {
    const page = await reads.returned(c, cfg, before, 50);
    const mine = page.rows.find(
      (r) => r.sender.toLowerCase() === sender.toLowerCase() && r.condition_id === conditionId,
    );
    if (mine) {
      const reason = mine.reason.charAt(0).toUpperCase() + mine.reason.slice(1);
      return `The contract did not accept this deposit and sent it straight back to your wallet. ${reason}.`;
    }
    return (await reads.condition(c, cfg, conditionId)).status === "FUNDED";
  };
}

/** Every condition, newest first, in pages of the contract's maximum. */
export async function listAll(c: GenLayerClient, cfg: AppConfig, creator?: string): Promise<Condition[]> {
  const rows: Condition[] = [];
  for (let offset = 0; offset < 2000; offset += 50) {
    const page = creator ? await reads.byCreator(c, cfg, creator, offset, 50) : await reads.list(c, cfg, offset, 50);
    rows.push(...page.rows);
    if (offset + page.count >= page.total || page.count === 0) break;
  }
  return rows.reverse();
}

// ── deployment validation ───────────────────────────────────────────────────

export type DeploymentCheck = { ok: true; version: string } | { ok: false; reason: string };

/**
 * Is the configured address really a STATELOCK deployment? The schema GenLayer
 * derived from the deployed code must expose every method this app calls with
 * the same parameters, and the protocol view must name itself STATELOCK.
 */
export function checkSchema(schema: unknown): string | null {
  const methods = (schema as { methods?: Record<string, { params?: [string, string][] }> })?.methods;
  if (!methods || typeof methods !== "object") return "No contract schema exists at the configured address.";
  for (const [name, params] of Object.entries(REQUIRED_METHODS)) {
    const m = methods[name];
    if (!m) return `The contract at the configured address has no ${name} method, so it is not STATELOCK.`;
    const names = (m.params ?? []).map((p) => p[0]);
    if (names.join(",") !== (params as readonly string[]).join(",")) {
      return `The contract's ${name} method takes different parameters than STATELOCK's.`;
    }
  }
  return null;
}

export async function validateDeployment(c: GenLayerClient, cfg: AppConfig): Promise<DeploymentCheck> {
  let schema: unknown;
  try {
    schema = await c.getContractSchema(cfg.contractAddress);
  } catch {
    return { ok: false, reason: "No contract could be read at the configured address on this network." };
  }
  const problem = checkSchema(schema);
  if (problem) return { ok: false, reason: problem };
  try {
    const info = await reads.protocol(c, cfg);
    if (!info.version.startsWith("STATELOCK")) {
      return { ok: false, reason: "The contract at the configured address does not identify itself as STATELOCK." };
    }
    return { ok: true, version: info.version };
  } catch {
    return { ok: false, reason: "The contract at the configured address did not answer as STATELOCK." };
  }
}

// ── writes ──────────────────────────────────────────────────────────────────

export type Verb = "fund" | "cancel" | "arm" | "observe" | "finalize" | "settle";

export const VERB_METHOD: Record<Verb, string> = {
  fund: "fund_condition",
  cancel: "cancel_condition",
  arm: "arm_condition",
  observe: "observe_condition",
  finalize: "finalize_condition",
  settle: "settle_condition",
};

export type CreateArgs = {
  conditionText: string;
  policyJson: string;
  observationStart: number;
  deadline: number;
  bountyAtto: bigint;
  beneficiary: string;
};

export function createCall(a: CreateArgs) {
  return {
    functionName: "create_condition",
    args: [a.conditionText, a.policyJson, a.observationStart, a.deadline, a.bountyAtto, a.beneficiary],
    value: 0n,
  };
}

export function verbCall(verb: Verb, conditionId: string, bountyAtto?: bigint) {
  return {
    functionName: VERB_METHOD[verb],
    args: [conditionId],
    // fund_condition is the only payable method: it must carry exactly the bounty terms
    value: verb === "fund" ? (bountyAtto ?? 0n) : 0n,
  };
}
