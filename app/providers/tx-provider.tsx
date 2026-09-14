"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { EIP1193Provider } from "viem";
import { useConnection } from "wagmi";

import { TxDock } from "@/components/settlement/tx-dock";
import { useStatelock } from "@/providers/app-providers";
import type { DeploymentCheck } from "@/lib/contracts/statelock";
import { writeClient } from "@/lib/genlayer/client";
import { preflight } from "@/lib/wallet/preflight";
import { initialTx, runWrite, type TxState } from "@/lib/genlayer/tx";

export type TxRecord = {
  id: number;
  title: string;
  /** What the write does, in words, shown once the contract reflects it. */
  effect: string;
  state: TxState;
  dismissed: boolean;
};

export type WriteRequest = {
  title: string;
  effect: string;
  functionName: string;
  args: (string | number | bigint)[];
  value: bigint;
  reconciled: () => Promise<boolean>;
};

type TxContextValue = {
  records: TxRecord[];
  send: (req: WriteRequest) => Promise<TxRecord>;
  dismiss: (id: number) => void;
};

const TxContext = createContext<TxContextValue | null>(null);

export function useTx(): TxContextValue {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTx outside TxProvider");
  return ctx;
}

export function TxProvider({ children }: { children: ReactNode }) {
  const { config } = useStatelock();
  const { address, chainId, connector, status } = useConnection();
  const queryClient = useQueryClient();
  const [records, setRecords] = useState<TxRecord[]>([]);
  const nextId = useRef(1);

  const update = useCallback((id: number, patch: Partial<TxRecord>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const send = useCallback(
    async (req: WriteRequest): Promise<TxRecord> => {
      const id = nextId.current++;
      let record: TxRecord = { id, title: req.title, effect: req.effect, state: initialTx, dismissed: false };
      setRecords((rs) => [...rs.slice(-4), record]);
      const failWith = (message: string) => {
        record = { ...record, state: { ...initialTx, stage: "FAILED", message } };
        update(id, record);
        return record;
      };

      // explicit wallet, network and contract validation before anything is signed
      const deployment = queryClient.getQueryData<DeploymentCheck>(["deployment", config.contractAddress]);
      const stop = preflight({ status, address, chainId, hasConnector: !!connector }, config, deployment?.ok);
      if (stop || !address || !connector) return failWith(stop ?? "Connect a wallet first.");
      let provider: EIP1193Provider;
      try {
        provider = (await connector.getProvider()) as EIP1193Provider;
      } catch {
        return failWith("The connected wallet did not provide a signing interface.");
      }

      const final = await runWrite({
        config,
        client: writeClient(config, address, provider),
        functionName: req.functionName,
        args: req.args,
        value: req.value,
        reconciled: req.reconciled,
        onUpdate: (state) => {
          record = { ...record, state };
          update(id, { state });
          if (state.stage === "CONTRACT_STATE_UPDATED" || state.stage === "FAILED") {
            void queryClient.invalidateQueries();
          }
        },
      });
      record = { ...record, state: final };
      return record;
    },
    [address, chainId, config, connector, queryClient, status, update],
  );

  const dismiss = useCallback((id: number) => update(id, { dismissed: true }), [update]);

  return (
    <TxContext.Provider value={{ records, send, dismiss }}>
      {children}
      <TxDock records={records} onDismiss={dismiss} />
    </TxContext.Provider>
  );
}
