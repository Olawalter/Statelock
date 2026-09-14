import { describe, expect, it } from "vitest";

import { actionsFor } from "@/components/commitment/actions-panel";
import { parseConfig, type AppConfig } from "@/lib/config";
import type { Condition } from "@/lib/contracts/statelock";
import type { GenLayerClient } from "@/lib/genlayer/client";
import { finalityOf, refusalOf, runWrite, walletErrorMessage, type TxState } from "@/lib/genlayer/tx";

const config = (
  parseConfig({
    NEXT_PUBLIC_GENLAYER_CHAIN_ID: "61999",
    NEXT_PUBLIC_GENLAYER_RPC_URL: "https://studio.genlayer.com/api",
    NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS: "0x3333333333333333333333333333333333333333",
  }) as { ok: true; config: AppConfig }
).config;

const HASH = ("0x" + "cd".repeat(32)) as `0x${string}`;
const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

function fakeClient(statuses: string[], leader: { execution_result: string; result?: unknown }) {
  let i = 0;
  return {
    writeContract: async () => HASH,
    getTransaction: async () => ({
      statusName: statuses[Math.min(i++, statuses.length - 1)],
      consensus_data: { leader_receipt: [leader] },
    }),
  } as unknown as GenLayerClient;
}

async function run(client: GenLayerClient, reconciled: () => Promise<boolean>) {
  const seen: TxState[] = [];
  const final = await runWrite({
    config,
    client,
    poller: client,
    functionName: "settle_condition",
    args: ["SL-000001"],
    value: 0n,
    reconciled,
    pollMs: 1,
    onUpdate: (s) => seen.push(s),
  });
  return { final, stages: [...new Set(seen.map((s) => s.stage))] };
}

describe("the write lifecycle never reports success early", () => {
  it("walks every stage in order and ends only when the contract shows the change", async () => {
    const client = fakeClient(["PENDING", "ACCEPTED"], { execution_result: "SUCCESS" });
    const { final, stages } = await run(client, async () => true);
    expect(stages).toEqual([
      "AWAITING_WALLET",
      "USER_CONFIRMED",
      "SUBMITTED",
      "CONFIRMING",
      "CONFIRMED",
      "CONTRACT_STATE_UPDATED",
    ]);
    expect(final.hash).toBe(HASH);
    expect(final.finality).toBe("accepted"); // accepted is not finalized
  }, 20_000);

  it("a contract refusal is FAILED with the contract's own sentence", async () => {
    const client = fakeClient(["ACCEPTED"], {
      execution_result: "ERROR",
      result: { payload: b64("[EXPECTED] illegal transition from SETTLED; expected one of ['FINALIZED']") },
    });
    const { final, stages } = await run(client, async () => true);
    expect(stages).not.toContain("CONFIRMED");
    expect(final.stage).toBe("FAILED");
    expect(final.message).toBe("[EXPECTED] illegal transition from SETTLED; expected one of ['FINALIZED']");
  });

  it("an accepted write whose effect never appears in the contract is FAILED, not success", async () => {
    const client = fakeClient(["ACCEPTED"], { execution_result: "SUCCESS" });
    const { final, stages } = await run(client, async () => false);
    expect(stages).toContain("CONFIRMED");
    expect(stages).not.toContain("CONTRACT_STATE_UPDATED");
    expect(final.stage).toBe("FAILED");
    expect(final.message).toMatch(/not caught up/);
  });

  it("no majority is FAILED, not success", async () => {
    const client = fakeClient(["UNDETERMINED"], { execution_result: "SUCCESS" });
    const { final } = await run(client, async () => true);
    expect(final.stage).toBe("FAILED");
  });

  it("a declined signature is FAILED before anything is submitted", async () => {
    const client = {
      writeContract: async () => Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 })),
    } as unknown as GenLayerClient;
    const { final, stages } = await run(client, async () => true);
    expect(stages).toEqual(["AWAITING_WALLET", "FAILED"]);
    expect(final.message).toMatch(/declined/);
  });
});

describe("receipt reading", () => {
  it("finds the refusal in a plain-text or base64 leader result", () => {
    expect(refusalOf({ consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: "[EXPECTED] already settled" }] } })).toBe(
      "[EXPECTED] already settled",
    );
    expect(refusalOf({ consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: "x" }] } })).toBeNull();
  });

  it("distinguishes accepted, appealed and finalized", () => {
    expect(finalityOf("COMMITTING")).toBe("pending_consensus");
    expect(finalityOf("ACCEPTED")).toBe("accepted");
    expect(finalityOf("APPEAL_COMMITTING")).toBe("appealed");
    expect(finalityOf("FINALIZED")).toBe("finalized");
  });

  it("humanizes wallet errors", () => {
    expect(walletErrorMessage({ code: 4001, message: "User rejected" })).toMatch(/declined/);
    expect(walletErrorMessage(new Error("Rate limit exceeded: 30 requests per minute"))).toMatch(/rate limiting/);
  });
});

// Every contract verb is reachable from the interface, for the party the contract allows.
const CREATOR = "0x4444444444444444444444444444444444444444";
const OTHER = "0x5555555555555555555555555555555555555555";
const T = 1_800_000_000;
function condition(patch: Partial<Condition>): Condition {
  return {
    condition_id: "SL-000001", creator: CREATOR, beneficiary: OTHER, condition_text: "x", policy_hash: "", terms_hash: "",
    observation_start: T + 3600, deadline: T + 86400, observation_closes: T + 8 * 86400, bounty_terms: 10n, bounty_deposited: 0n,
    status: "DRAFT", locked: false, terminal: false, created_at: T, funded_at: 0, armed_at: 0, observation_count: 0,
    early_observations: 0, early_observations_allowed: 4, last_observed_at: 0, accepted_at: 0, finalizable_at: 0, finalized_at: 0,
    settled_at: 0, cancelled_at: 0, result_verdict: "", result_reason: "", result_temporal: "", result_observation: 0,
    settled_to: "", settled_amount: 0n, ...patch,
  };
}
const open = (c: Condition, me: string, now: number) =>
  actionsFor(c, me, now).filter((a) => !a.blocked).map((a) => a.verb).sort();

describe("every verb is reachable in the interface", () => {
  it("creator: fund and cancel a draft, arm and cancel a funded commitment", () => {
    expect(open(condition({ status: "DRAFT" }), CREATOR, T)).toEqual(["cancel", "fund"]);
    expect(open(condition({ status: "FUNDED" }), CREATOR, T)).toEqual(["arm", "cancel"]);
    expect(open(condition({ status: "FUNDED" }), OTHER, T)).toEqual([]);
  });

  it("anyone: observe in the window, finalize after the delay, settle once final", () => {
    expect(open(condition({ status: "ARMED" }), OTHER, T)).toEqual([]);
    expect(open(condition({ status: "ARMED" }), OTHER, T + 7200)).toEqual(["observe"]);
    expect(open(condition({ status: "ACCEPTED", finalizable_at: T + 600 }), OTHER, T + 100)).toEqual([]);
    expect(open(condition({ status: "ACCEPTED", finalizable_at: T + 600 }), OTHER, T + 601)).toEqual(["finalize"]);
    expect(open(condition({ status: "FINALIZED", result_verdict: "SATISFIED" }), OTHER, T)).toEqual(["settle"]);
    expect(open(condition({ status: "OBSERVING" }), OTHER, T + 9 * 86400)).toEqual(["finalize"]);
  });

  it("nothing is offered on a settled or cancelled commitment", () => {
    expect(actionsFor(condition({ status: "SETTLED", terminal: true }), CREATOR, T)).toEqual([]);
    expect(actionsFor(condition({ status: "CANCELLED", terminal: true }), CREATOR, T)).toEqual([]);
  });
});
