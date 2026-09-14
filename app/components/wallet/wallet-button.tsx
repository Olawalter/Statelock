"use client";

import { LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { shortAddress } from "@/lib/present";
import { walletErrorMessage } from "@/lib/genlayer/tx";

/**
 * Injected wallets discovered through EIP-6963, listed by the name and icon
 * each wallet announces. The generic "Injected" entry is shown only when no
 * wallet announced itself.
 */
export function WalletButton() {
  const { address, status } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const [open, setOpen] = useState(false);

  const announced = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const listed = announced.length ? announced : connectors;

  if (status === "connected" && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden font-mono text-xs text-dim sm:inline" title={address}>
          {shortAddress(address)}
        </span>
        <Button variant="outline" size="icon" aria-label="Disconnect wallet" onClick={() => disconnect.mutate()}>
          <LogOut />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={status === "connecting" || status === "reconnecting"}>
        <Wallet data-icon="inline-start" />
        {status === "connecting" || status === "reconnecting" ? (
          "Connecting…"
        ) : (
          <>
            Connect<span className="hidden sm:inline">&nbsp;wallet</span>
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border border-line bg-well sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a wallet</DialogTitle>
            <DialogDescription className="text-dim">
              STATELOCK signs with your own browser wallet. It never asks for, sees, or stores a private key.
            </DialogDescription>
          </DialogHeader>
          {listed.length === 0 ? (
            <p className="border border-line bg-surface p-4 text-sm text-dim">
              No browser wallet was found. Install Rabby, MetaMask, Trust Wallet or Coinbase Wallet, then reload this
              page.
            </p>
          ) : (
            <ul className="grid gap-2">
              {listed.map((c) => (
                <li key={c.uid}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 border border-line bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-signal disabled:opacity-50"
                    disabled={connect.isPending}
                    onClick={() =>
                      connect.mutate({ connector: c }, { onSuccess: () => setOpen(false) })
                    }
                  >
                    {c.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.icon} alt="" className="size-6" />
                    ) : (
                      <Wallet className="size-5 text-dim" />
                    )}
                    <span className="flex-1">{c.id === "injected" ? "Browser wallet" : c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {connect.error ? <p className="text-sm text-no">{walletErrorMessage(connect.error)}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
