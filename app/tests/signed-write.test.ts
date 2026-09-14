import { afterEach, describe, expect, it, vi } from "vitest";

import { parseConfig, type AppConfig } from "@/lib/config";
import { createCall, verbCall } from "@/lib/contracts/statelock";
import { writeClient } from "@/lib/genlayer/client";

/**
 * A write is signed by the user's injected wallet, never by the app. This
 * drives the real genlayer-js client with a mock EIP-1193 wallet and a
 * stubbed RPC, and records where each request goes.
 */

const USER = "0x2222222222222222222222222222222222222222" as const;
const CONTRACT = "0x3333333333333333333333333333333333333333";
const config = (
  parseConfig({
    NEXT_PUBLIC_GENLAYER_CHAIN_ID: "61999",
    NEXT_PUBLIC_GENLAYER_RPC_URL: "https://studio.genlayer.com/api",
    NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS: CONTRACT,
  }) as { ok: true; config: AppConfig }
).config;

const TX_HASH = "0x" + "ab".repeat(32);

function harness() {
  const rpcMethods: string[] = [];
  const walletCalls: { method: string; params?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { method, id } = JSON.parse(init.body);
      rpcMethods.push(method);
      const result =
        method === "eth_getTransactionCount" ? "0x5" : method === "eth_estimateGas" ? "0x30d40" : method === "eth_gasPrice" ? "0x0" : null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }));
    }),
  );
  const provider = {
    request: vi.fn(async ({ method, params }: { method: string; params?: unknown }) => {
      walletCalls.push({ method, params });
      if (method === "eth_sendTransaction") return TX_HASH;
      if (method === "eth_chainId") return "0xf22f";
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [USER];
      throw new Error(`unexpected wallet method ${method}`);
    }),
    on: () => undefined,
    removeListener: () => undefined,
  };
  return { rpcMethods, walletCalls, provider };
}

afterEach(() => vi.unstubAllGlobals());

describe("signed writes go through the user's wallet", () => {
  it("fund_condition: the wallet is asked to send, from the user, carrying exactly the bounty", async () => {
    const h = harness();
    const client = writeClient(config, USER, h.provider as never);
    const bounty = 10n ** 18n * 7n;
    const hash = await client.writeContract({ address: CONTRACT, ...verbCall("fund", "SL-000001", bounty) });

    expect(hash).toBe(TX_HASH);
    const sends = h.walletCalls.filter((c) => c.method === "eth_sendTransaction");
    expect(sends).toHaveLength(1);
    const [tx] = sends[0].params as { from: string; to: string; value: string; data: string }[];
    expect(tx.from.toLowerCase()).toBe(USER);
    expect(BigInt(tx.value)).toBe(bounty);
    expect(tx.data.length).toBeGreaterThan(10);
    // the app never signs or broadcasts itself
    expect(h.rpcMethods).not.toContain("eth_sendRawTransaction");
    expect(h.rpcMethods).not.toContain("eth_sendTransaction");
  });

  it("non-payable verbs and creation carry zero value", async () => {
    for (const call of [verbCall("arm", "SL-000001", 7n), verbCall("settle", "SL-000001", 7n), verbCall("observe", "SL-000001", 7n), createCall({
      conditionText: "x", policyJson: "{}", observationStart: 1, deadline: 2, bountyAtto: 5n, beneficiary: USER,
    })]) {
      const h = harness();
      const client = writeClient(config, USER, h.provider as never);
      await client.writeContract({ address: CONTRACT, ...call });
      const [tx] = h.walletCalls.find((c) => c.method === "eth_sendTransaction")!.params as { value: string }[];
      expect(BigInt(tx.value), call.functionName).toBe(0n);
    }
  });

  it("a wallet that declines leaves nothing sent", async () => {
    const h = harness();
    h.provider.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_sendTransaction") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      return null as never;
    });
    const client = writeClient(config, USER, h.provider as never);
    await expect(client.writeContract({ address: CONTRACT, ...verbCall("observe", "SL-000001") })).rejects.toThrow(/rejected/);
    expect(h.rpcMethods).not.toContain("eth_sendRawTransaction");
  });
});
