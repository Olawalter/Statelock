import type { AppConfig } from "@/lib/config";

export type WalletSnapshot = {
  status: string;
  address?: string;
  chainId?: number;
  hasConnector: boolean;
};

/**
 * The checks every write passes before a wallet is asked to sign. Returns
 * the reason to stop, or null. A wallet on another chain is never sent a
 * transaction: genlayer-js skips its own chain check on Studio networks, so
 * this is the only guard.
 */
export function preflight(w: WalletSnapshot, config: AppConfig, deploymentOk: boolean | undefined): string | null {
  if (w.status !== "connected" || !w.address || !w.hasConnector) return "Connect a wallet first.";
  if (w.chainId !== config.chainId) {
    return `Your wallet is on another network. Switch it to GenLayer StudioNet (chain ${config.chainId}) and try again.`;
  }
  if (deploymentOk === false) return "The configured contract is not verified as STATELOCK, so no transaction is sent.";
  if (deploymentOk === undefined) return "The contract is still being verified. Try again in a moment.";
  return null;
}
