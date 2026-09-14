import { isAddress } from "viem";
import { z } from "zod";

import { SOURCE_KINDS } from "@/lib/contracts/statelock";
import { parseGen } from "@/lib/present";

/**
 * The creation form's checks. They mirror the contract's own rules so a
 * mistake is caught before a signature, but they decide nothing: the
 * contract re-validates every field and its refusal is final.
 */

export const LIMITS = {
  conditionText: 500,
  instructions: 1000,
  sources: 4,
  facts: 6,
  url: 300,
  sourceLabel: 80,
  factName: 40,
  factDescription: 240,
  expected: 80,
  policyJson: 6000,
  horizonSeconds: 366 * 86400,
} as const;

export const conditionStep = z.object({
  conditionText: z
    .string()
    .trim()
    .min(1, "Describe the condition.")
    .max(LIMITS.conditionText, `Keep the condition under ${LIMITS.conditionText} characters.`),
});

const source = z.object({
  url: z
    .string()
    .trim()
    .max(LIMITS.url, `A source address can be at most ${LIMITS.url} characters.`)
    .refine((u) => /^https:\/\/\S+$/.test(u) && u.length > 8, "Each source needs a full https:// address with no spaces."),
  kind: z.enum(SOURCE_KINDS),
  label: z
    .string()
    .trim()
    .min(1, "Name each source.")
    .max(LIMITS.sourceLabel, `A source name can be at most ${LIMITS.sourceLabel} characters.`),
});

const fact = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,39}$/, "A fact key is lowercase letters, digits and underscores, starting with a letter."),
  description: z
    .string()
    .trim()
    .min(1, "Describe what must be true.")
    .max(LIMITS.factDescription, `A fact description can be at most ${LIMITS.factDescription} characters.`),
  expected: z.string().trim().max(LIMITS.expected, `An expected value can be at most ${LIMITS.expected} characters.`),
});

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export const policyStep = z
  .object({
    sources: z.array(source).min(1, "Allow at least one source.").max(LIMITS.sources, `At most ${LIMITS.sources} sources.`),
    facts: z.array(fact).min(1, "Require at least one fact.").max(LIMITS.facts, `At most ${LIMITS.facts} facts.`),
    requireIndependentSources: z.boolean(),
    instructions: z
      .string()
      .trim()
      .max(LIMITS.instructions, `Instructions can be at most ${LIMITS.instructions} characters.`),
  })
  .superRefine((p, ctx) => {
    const urls = p.sources.map((s) => s.url.trim().toLowerCase().replace(/\/+$/, ""));
    if (new Set(urls).size !== urls.length) ctx.addIssue({ code: "custom", message: "Two sources have the same address." });
    const names = p.facts.map((f) => f.name.trim());
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "Two facts share the same key." });
    if (p.requireIndependentSources && new Set(p.sources.map((s) => hostOf(s.url))).size < 2) {
      ctx.addIssue({ code: "custom", message: "Independent confirmation needs sources on at least two different sites." });
    }
  });

export const timeStep = z
  .object({
    observationStart: z.number().int(),
    deadline: z.number().int(),
    now: z.number().int(),
  })
  .superRefine((t, ctx) => {
    // the contract compares against its own transaction time; leave room for signing and consensus
    if (t.observationStart <= t.now + 300) {
      ctx.addIssue({ code: "custom", message: "The observation window must open at least five minutes from now." });
    }
    if (t.deadline <= t.observationStart) {
      ctx.addIssue({ code: "custom", message: "The deadline must come after the window opens." });
    }
    if (t.deadline > t.now + LIMITS.horizonSeconds) {
      ctx.addIssue({ code: "custom", message: "The deadline can be at most 366 days away." });
    }
  });

export const consequenceStep = z.object({
  bounty: z
    .string()
    .refine((v) => {
      const atto = parseGen(v);
      return atto !== null && atto > 0n;
    }, "Enter a bounty greater than zero, up to 18 decimal places."),
  beneficiary: z
    .string()
    .trim()
    .refine((a) => isAddress(a, { strict: false }), "Enter the beneficiary's 0x wallet address.")
    .refine((a) => !/^0x0{40}$/i.test(a), "The beneficiary cannot be the zero address."),
});

export type PolicyInput = z.infer<typeof policyStep>;

/** The exact JSON the contract receives. */
export function policyJson(p: PolicyInput): string {
  return JSON.stringify({
    sources: p.sources.map((s) => ({ url: s.url.trim(), kind: s.kind, label: s.label.trim() })),
    required_facts: p.facts.map((f) => ({
      name: f.name.trim(),
      description: f.description.trim(),
      expected: f.expected.trim(),
    })),
    temporal_rule: "EVENT_BY_DEADLINE",
    require_independent_sources: p.requireIndependentSources,
    instructions: p.instructions.trim(),
  });
}

export function firstIssue(result: { success: boolean; error?: { issues: { message: string }[] } }): string | null {
  return result.success ? null : (result.error?.issues[0]?.message ?? "Check this step.");
}
