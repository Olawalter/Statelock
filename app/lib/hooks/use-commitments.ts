"use client";

import { useQuery } from "@tanstack/react-query";
import { abi } from "genlayer-js";

import { listAll, reads, type Condition } from "@/lib/contracts/statelock";
import { useStatelock } from "@/providers/app-providers";

export function useProtocol() {
  const { client, config } = useStatelock();
  return useQuery({ queryKey: ["protocol"], queryFn: () => reads.protocol(client, config), staleTime: 60_000 });
}

export function useConditions(creator?: string) {
  const { client, config } = useStatelock();
  return useQuery({
    queryKey: ["conditions", creator?.toLowerCase() ?? "all"],
    queryFn: () => listAll(client, config, creator),
  });
}

export function useCondition(id: string) {
  const { client, config } = useStatelock();
  return useQuery({ queryKey: ["condition", id], queryFn: () => reads.condition(client, config, id), retry: false });
}

export function usePolicy(id: string) {
  const { client, config } = useStatelock();
  return useQuery({ queryKey: ["policy", id], queryFn: () => reads.policy(client, config, id), staleTime: Infinity });
}

export function useObservations(id: string) {
  const { client, config } = useStatelock();
  return useQuery({ queryKey: ["observations", id], queryFn: () => reads.observations(client, config, id) });
}

export function useFinalResult(id: string) {
  const { client, config } = useStatelock();
  return useQuery({ queryKey: ["final", id], queryFn: () => reads.finalResult(client, config, id) });
}

export type ChainTx = {
  hash: string;
  method: string;
  args: unknown[];
  from: string;
  status: string;
  createdAt: number;
  value: string;
  execution: string;
};

function decodeCall(b64: unknown): { method: string; args: unknown[] } {
  if (typeof b64 !== "string") return { method: "", args: [] };
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const decoded = abi.calldata.decode(bytes) as unknown;
    const get = (k: string) =>
      decoded instanceof Map ? decoded.get(k) : (decoded as Record<string, unknown> | null)?.[k];
    const method = get("method");
    const args = get("args");
    return { method: typeof method === "string" ? method : "", args: Array.isArray(args) ? args : [] };
  } catch {
    return { method: "", args: [] };
  }
}

/**
 * Transactions sent to the contract, as GenLayer StudioNet records them
 * (`sim_getTransactionsForAddress`). The contract itself stores no hashes;
 * this is the chain's own history, read directly — there is no indexer.
 */
export function useContractHistory() {
  const { client, config } = useStatelock();
  return useQuery({
    queryKey: ["history", config.contractAddress],
    queryFn: async (): Promise<ChainTx[]> => {
      const raw = (await (client.request as (a: { method: string; params: unknown[] }) => Promise<unknown>)({
        method: "sim_getTransactionsForAddress",
        params: [config.contractAddress],
      })) as Record<string, unknown>[];
      return (Array.isArray(raw) ? raw : [])
        .filter((t) => String(t.to_address ?? "").toLowerCase() === config.contractAddress.toLowerCase())
        .map((t) => {
          const call = decodeCall((t.data as { calldata?: unknown } | undefined)?.calldata);
          const lr = (t.consensus_data as { leader_receipt?: unknown } | undefined)?.leader_receipt;
          const leader = (Array.isArray(lr) ? lr[0] : lr) as { execution_result?: string } | undefined;
          return {
            hash: String(t.hash),
            method: call.method,
            args: call.args,
            from: String(t.from_address ?? ""),
            status: String(t.status ?? ""),
            createdAt: Math.floor(Date.parse(String(t.created_at)) / 1000) || 0,
            value: String(t.value ?? "0"),
            execution: leader?.execution_result ?? "",
          };
        });
    },
  });
}

/** This commitment's transactions: calls naming its id, and the creation that produced it. */
export function historyFor(history: ChainTx[], c: Condition): ChainTx[] {
  return history
    .filter((t) => {
      if (t.method === "create_condition") {
        return t.from.toLowerCase() === c.creator.toLowerCase() && t.args[0] === c.condition_text && t.execution === "SUCCESS" && Math.abs(t.createdAt - c.created_at) < 900;
      }
      return t.args[0] === c.condition_id;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}
