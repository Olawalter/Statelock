import { describe, expect, it } from "vitest";

import schema from "./fixtures/statelock-schema.json";
import { parseConfig, type AppConfig } from "@/lib/config";
import { checkSchema, validateDeployment } from "@/lib/contracts/statelock";
import type { GenLayerClient } from "@/lib/genlayer/client";
import { preflight } from "@/lib/wallet/preflight";

// Security matrix rows "Wrong network" and "Wrong contract address" (build prompt §43).

const ADDRESS = "0x1111111111111111111111111111111111111111";
const good = {
  NEXT_PUBLIC_GENLAYER_CHAIN_ID: "61999",
  NEXT_PUBLIC_GENLAYER_RPC_URL: "https://studio.genlayer.com/api",
  NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS: ADDRESS,
};
const config = (parseConfig(good) as { ok: true; config: AppConfig }).config;

describe("configuration validation", () => {
  it("accepts StudioNet with a well-formed contract address", () => {
    const r = parseConfig(good);
    expect(r.ok).toBe(true);
  });

  it("refuses any other chain id", () => {
    for (const id of ["1", "61997", "4221", "abc"]) {
      const r = parseConfig({ ...good, NEXT_PUBLIC_GENLAYER_CHAIN_ID: id });
      expect(r.ok, id).toBe(false);
    }
  });

  it("refuses a missing, malformed or zero contract address", () => {
    for (const a of [undefined, "", "0x123", "not-an-address", "0x" + "0".repeat(40)]) {
      const r = parseConfig({ ...good, NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS: a });
      expect(r.ok, String(a)).toBe(false);
    }
  });

  it("refuses a non-https RPC", () => {
    expect(parseConfig({ ...good, NEXT_PUBLIC_GENLAYER_RPC_URL: "http://studio.genlayer.com/api" }).ok).toBe(false);
  });
});

describe("deployment validation", () => {
  it("accepts the schema GenLayer generates for contracts/statelock.py", () => {
    expect(checkSchema(schema)).toBeNull();
  });

  it("refuses a contract missing a STATELOCK method", () => {
    const methods = { ...(schema as { methods: Record<string, unknown> }).methods };
    delete methods.settle_condition;
    expect(checkSchema({ methods })).toMatch(/no settle_condition method/);
  });

  it("refuses a contract whose method takes different parameters", () => {
    const methods = structuredClone((schema as { methods: Record<string, { params: string[][] }> }).methods);
    methods.create_condition.params.reverse();
    expect(checkSchema({ methods })).toMatch(/different parameters/);
  });

  it("refuses an address with no contract, or a contract that is not STATELOCK", async () => {
    const empty = { getContractSchema: async () => Promise.reject(new Error("not found")) } as unknown as GenLayerClient;
    expect(await validateDeployment(empty, config)).toMatchObject({ ok: false });

    const impostor = {
      getContractSchema: async () => schema,
      readContract: async () => ({
        version: "SOMETHING-ELSE-1.0.0", condition_count: 0, total_locked: 0, time_source: "", failure_behavior: "",
        limits: { max_sources: 4, max_facts: 6, max_condition_text: 500, max_instructions: 1000, max_url: 300,
          max_source_label: 80, max_fact_name: 40, max_fact_description: 240, max_expected: 80, max_policy_json: 6000,
          max_early_observations: 4, observation_grace_seconds: 1, finality_delay_seconds: 600, max_horizon_seconds: 1 },
      }),
    } as unknown as GenLayerClient;
    expect(await validateDeployment(impostor, config)).toMatchObject({ ok: false, reason: expect.stringMatching(/does not identify itself/) });
  });
});

describe("wallet pre-flight", () => {
  const connected = { status: "connected", address: ADDRESS, chainId: 61999, hasConnector: true };

  it("lets a connected StudioNet wallet send to a verified contract", () => {
    expect(preflight(connected, config, true)).toBeNull();
  });

  it("stops a wallet on the wrong network before anything is signed", () => {
    expect(preflight({ ...connected, chainId: 1 }, config, true)).toMatch(/another network/);
  });

  it("stops when no wallet is connected", () => {
    expect(preflight({ status: "disconnected", hasConnector: false }, config, true)).toMatch(/Connect a wallet/);
  });

  it("stops when the contract is unverified or not yet verified", () => {
    expect(preflight(connected, config, false)).toMatch(/not verified/);
    expect(preflight(connected, config, undefined)).toMatch(/still being verified/);
  });
});
