"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { validateDeployment } from "@/lib/contracts/statelock";
import { walletErrorMessage } from "@/lib/genlayer/tx";
import { useStatelock } from "@/providers/app-providers";

export function useDeployment() {
  const { client, config } = useStatelock();
  return useQuery({
    queryKey: ["deployment", config.contractAddress],
    queryFn: () => validateDeployment(client, config),
    staleTime: 10 * 60_000,
  });
}

/** Is the connected wallet on the network STATELOCK is deployed to? */
export function useNetwork() {
  const { config } = useStatelock();
  const { chainId, status } = useConnection();
  const connected = status === "connected";
  return { connected, chainId, expected: config.chainId, correct: connected && chainId === config.chainId };
}

export function NetworkPill() {
  const net = useNetwork();
  const deployment = useDeployment();
  const bad = deployment.data && !deployment.data.ok;
  const wrong = net.connected && !net.correct;
  const tone = bad || wrong ? "bg-no" : net.correct && deployment.data?.ok ? "bg-yes" : "bg-dim";
  const label = bad ? "Contract not verified" : wrong ? "Wrong network" : "GenLayer StudioNet";
  return (
    <span className="hidden items-center gap-2 border border-line px-2.5 py-1.5 font-mono text-[11px] text-dim md:flex">
      <span className={`size-1.5 ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Explicit, blocking notices: a wallet on the wrong network, or a configured
 * address that is not a STATELOCK deployment. Switching is offered only as a
 * button the user presses; nothing switches silently.
 */
export function NetworkNotices() {
  const net = useNetwork();
  const deployment = useDeployment();
  const switchChain = useSwitchChain();

  return (
    <>
      {deployment.data && !deployment.data.ok ? (
        <div role="alert" className="border-b border-no/40 bg-no/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-6">
            <strong className="font-semibold text-no">This app is not connected to a verified STATELOCK contract.</strong>
            <span className="text-dim">{deployment.data.reason} Transactions are disabled.</span>
          </div>
        </div>
      ) : null}
      {net.connected && !net.correct ? (
        <div role="alert" className="border-b border-maybe/40 bg-maybe/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-6">
            <strong className="font-semibold text-maybe">Your wallet is on the wrong network.</strong>
            <span className="text-dim">
              STATELOCK runs on GenLayer StudioNet (chain {net.expected}). Your wallet reports chain {net.chainId}. No
              transaction will be sent until this matches.
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={switchChain.isPending}
              onClick={() => switchChain.mutate({ chainId: net.expected })}
            >
              {switchChain.isPending ? "Waiting for wallet…" : "Switch to StudioNet"}
            </Button>
            {switchChain.error ? (
              <span className="text-no">{walletErrorMessage(switchChain.error)}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
