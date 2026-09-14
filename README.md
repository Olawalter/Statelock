<p align="center"><img src="app/app/icon.svg" width="120" alt="STATELOCK"/></p>

# STATELOCK - Conditional Reality Verification

**Lock the condition. Let reality decide.**

A creator precommits a real-world condition, freezes the sources and facts that may prove it,
sets a deadline, and locks a bounty with a fixed consequence. GenLayer validators then read
those sources from the live web, and each must agree on what they show. Contract code — not a
model, not an operator — turns their findings into Satisfied, Not satisfied or Undetermined, and
settles the exact bounty once the result is final.

Deployment of record: [`0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d`](https://explorer-studio.genlayer.com/address/0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d)
on GenLayer StudioNet, byte-identical to `contracts/statelock.py` (see [`docs/deployment.json`](docs/deployment.json)).

## What it is

- **A precommitment.** The condition, allowed sources, required facts, observation window,
  bounty and beneficiary are recorded at creation and frozen at ARM. Nothing can change after.
- **An exact escrow.** The bounty is the transaction value and must equal the terms. A wrong
  deposit is sent straight back in the same transaction.
- **An adjudication from the live web.** Only the frozen sources are fetched; evidence is
  fenced, bounded, untrusted data.
- **A verdict derived in code.** Validators report per-fact findings; `_derive` applies fixed
  rules, including every temporal and source-failure case.
- **A fixed consequence.** Satisfied pays the beneficiary. Not satisfied and Undetermined
  refund the creator. Exactly once, after finality, by anyone.

There is no backend, no admin, no marketplace, and no server-side key.

## Why GenLayer is required

"Did this happen by the deadline, according to these sources?" has no deterministic on-chain
answer: someone has to read live pages and interpret them. Anywhere else that reader is a
trusted party — an oracle operator, a backend, a model API key. On GenLayer the leader and every
validator read the sources independently, the result stands only if they agree, and the
protocol's own appeal and finality rules apply. The contract can hold GEN against the outcome
without trusting any single reader, including whoever runs this site.

## How it works

### For a creator

1. **Define** the condition as a statement that is true or not by a deadline.
2. **Choose the evidence**: up to four https sources and up to six required facts, optionally
   requiring independent confirmation from different sites.
3. **Set the window** (it must open after ARM) and the deadline.
4. **Lock the consequence**: the bounty and the beneficiary. Review the immutable terms.
5. **Create, fund, ARM** — three wallet transactions. After ARM nothing can be changed or withdrawn.

### For anyone

1. **Observe** once the window opens. GenLayer reads the sources and records a consensus observation.
2. **Finalize** 10 minutes after a conclusive result (or as Undetermined if nobody observed
   within 7 days after the deadline).
3. **Settle**. The destination and amount are fixed by the contract; the caller chooses nothing.

## Outcomes

| Verdict | When | Consequence |
|---|---|---|
| Satisfied | every required fact confirmed by readable sources, with the event by the deadline | bounty to the beneficiary |
| Not satisfied | every source readable and a required fact not confirmed after the deadline, or the event happened after the deadline | bounty to the creator |
| Undetermined | a source unreadable, sources contradicting each other, independence not met, the event time unknown, or nobody observed in time | bounty to the creator |

Inside the window only Satisfied is conclusive; a negative reading keeps observing (up to 4
times). After the deadline the next observation is conclusive either way.

## Lifecycle

```text
DRAFT ──fund──► FUNDED ──arm──► ARMED ──observe──► OBSERVING ──observe──┐
  │               │               │                    │                │
  └──cancel───────┴──cancel──► CANCELLED              (not conclusive)   ▼
                                  └────────observe (conclusive)──────► ACCEPTED
                                                                          │ 600 s
  ARMED / OBSERVING ── deadline + 7 days, never conclusive ──┐           ▼
                                                              └──────► FINALIZED ──settle──► SETTLED
```

| Status | Meaning |
|---|---|
| Draft | terms recorded, nothing deposited |
| Funded | exact bounty deposited; creator can still cancel (full refund) |
| Armed | terms frozen, bounty locked, waiting for the window |
| Observing | observed, no conclusive result yet |
| Result accepted | consensus accepted a conclusive result; 10-minute finality delay running |
| Finalized | result final; anyone may settle |
| Settled | bounty paid; closed |
| Cancelled | withdrawn before ARM |

## GenLayer consensus functions

| Function | Kind | What runs under consensus |
|---|---|---|
| `observe_condition` | nondeterministic (`gl.vm.run_nondet_unsafe`) | each node fetches the frozen sources (`gl.nondet.web.get`), asks a model for per-fact findings (`gl.nondet.exec_prompt`), derives the result in code; validators compare every stored field against their own |
| every other write | deterministic | terms, ledger, lifecycle, finality gate, settlement |

## Contract

| | |
|---|---|
| Network | GenLayer StudioNet |
| Chain ID | 61999 |
| RPC | `https://studio.genlayer.com/api` |
| Explorer | https://explorer-studio.genlayer.com |
| Address | [`0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d`](https://explorer-studio.genlayer.com/address/0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d) |
| Source | [`contracts/statelock.py`](contracts/statelock.py), runner `py-genlayer:1jb45aa8…`, sha256 `a78ac0db…0292093` |

### Write methods

| Method | Who | Payable | Notes |
|---|---|---|---|
| `create_condition(condition_text, policy_json, observation_start, deadline, bounty_terms, beneficiary)` | anyone | no | returns `SL-000001`, … |
| `fund_condition(condition_id)` | creator | **yes** | value must equal the bounty terms; any unusable deposit is returned |
| `cancel_condition(condition_id)` | creator | no | Draft or Funded only; refunds |
| `arm_condition(condition_id)` | creator | no | Funded, before the window |
| `observe_condition(condition_id)` | anyone | no | the consensus observation |
| `finalize_condition(condition_id)` | anyone | no | 600 s after acceptance, or expiry |
| `settle_condition(condition_id)` | anyone | no | Finalized, once |

### Read methods

`get_protocol_info`, `get_condition`, `get_policy`, `get_observation`, `get_final_result`,
`list_conditions`, `list_conditions_by_creator`, `get_returned_deposits`.

### Consensus guarantees

- The model returns findings only; no amount, recipient, deadline, source or verdict.
- Validators independently fetch, read and derive, then require their complete stored result
  to equal the leader's.
- Distinctions without consequence (contradicted vs. not found; independence when not required)
  are not stored, so honest validators do not split on them.
- A malformed model answer rotates the leader instead of being recorded.

Full reference: [`docs/CONTRACT.md`](docs/CONTRACT.md).

## Verified end-to-end

All on StudioNet, all re-checkable by hash. Details: [`docs/E2E.md`](docs/E2E.md).

```text
Integration suite, run 3 (tests/integration)            18 passed in 46 min 19 s
  SL-000001  observe inside window   SATISFIED        REQUIRED_FACTS_CONFIRMED  S1,S2 readable
  SL-000002  observe after deadline  NOT_SATISFIED    REQUIRED_FACT_NOT_CONFIRMED
  SL-000003  observe after deadline  UNDETERMINED     SOURCES_UNAVAILABLE (HTTP 404)
  refused    past start, cancel after ARM, early observe, settle while accepted,
             finalize before the delay, second settlement
  returned   1-atto-short deposit and third-party deposit, sender balances unchanged
  balances   contract 30,000,000,000,000,000 -> 0
             beneficiary +10,000,000,000,000,000   creator +20,000,000,000,000,000

Through the app, deployment of record 0x9e4Ae09e…Acd9d
  connect (EIP-6963) -> wrong-network notice -> switch -> create -> fund -> ARM
  observe 22:38 UTC  SATISFIED -> finalize 22:48 UTC -> settle
  beneficiary 0 -> 10,000,000,000,000,000   contract 10,000,000,000,000,000 -> 0
  every transaction FINALIZED, validator votes agree x3
```

Tests that ran and passed on the final code:

| Suite | Result |
|---|---|
| `genvm-lint check contracts/statelock.py --json` | ok (lint 3/3, schema valid; I200 note on a newer runner, see ARCHITECTURE) |
| `pytest tests/direct` (GenLayer direct mode) | 86 passed |
| Contract mutation sweep (each guard broken in a scratch copy) | 25/25 caught |
| `SKIP_INTEGRATION=0 pytest tests/integration` (live StudioNet) | 18 passed |
| `npm test` in `app/` | 27 passed |
| Frontend mutation sweep | 12/12 caught |
| `npm run build` in `app/` | succeeds |

Two StudioNet platform behaviours were found live and are documented with transaction hashes:
an appeal of an accepted transaction erases the appealed contract, and a refused payable
transaction's value is still credited to the contract (which is why deposits are returned, not
refused).

## Architecture

```text
browser: Next.js app ── reads ──► genlayer-js ──► StudioNet RPC ──► Statelock contract
                     └─ writes ─► injected wallet (EIP-6963) ─────────┘      │
                                                                             └─► allowed https sources
```

The app is presentation only: every state shown is read from the contract; every write is
signed by the user's wallet. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (deterministic
and nondeterministic execution, web observation, LLM adjudication, Equivalence Principle,
Optimistic Democracy, finality, settlement) and [`docs/SECURITY.md`](docs/SECURITY.md).

## Tech stack

| Layer | Technology |
|---|---|
| Contract | GenLayer Intelligent Contract (Python), runner `py-genlayer:1jb45aa8…` |
| Contract tooling | genvm-linter 0.11.0, genlayer-test 0.29.2 (direct mode), genlayer-py 0.16.3 |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide |
| Wallet and chain | wagmi 3 + viem 2 (EIP-6963), genlayer-js 1.1.8 |
| Data and validation | TanStack Query 5, Zod 4 |
| Frontend tests | Vitest |

## Repository

```text
contracts/statelock.py         the Intelligent Contract
tests/direct/                  direct-mode tests (conditions, policy, funding, state machine,
                               observation, settlement, security)
tests/integration/             live StudioNet tests (create, fund/arm, observation, consensus,
                               undetermined, finalization)
scripts/deploy.py              deploy the committed source, byte-verify, print frontend env
scripts/inspect.py             read code, schema and records back from the chain
app/                           the Next.js frontend
docs/ARCHITECTURE.md  CONTRACT.md  SECURITY.md  E2E.md
docs/deployment.json  live-e2e.json  app-e2e.json  evidence/
```

## Getting started

### Prerequisites

Python 3.12, Node.js 22, git. For live tests and deployment, network access to StudioNet (the
faucet funds throwaway accounts; no key is needed). For the app, a browser wallet.

### Contract: lint and test

```bash
pip install -r requirements.txt
```

```bash
genvm-lint check contracts/statelock.py --json
```

```bash
pytest tests/direct -v
```

```bash
SKIP_INTEGRATION=0 pytest tests/integration -v -s
```

The live suite takes about 45 minutes (real observation windows and the 10-minute finality
delay) and writes `docs/live-e2e.json`. `SKIP_INTEGRATION=0 gltest tests/integration -v -s`
collects and runs the same 18 tests (the harness binds to StudioNet itself); the recorded live
runs were made with `pytest`.

### Deploy

```bash
python scripts/deploy.py
```

Deploys `contracts/statelock.py` as committed at `HEAD` from a throwaway faucet-funded account,
waits for FINALIZED, requires the on-chain code to be byte-identical, writes
`docs/deployment.json`, and prints the three frontend variables. Inspect any deployment:

```bash
python scripts/inspect.py 0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d --condition SL-000001
```

### Frontend

```bash
cd app && npm ci
```

Create `app/.env.local` (public values only; see `app/.env.example`):

```text
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS=0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d
```

```bash
npm run dev
```

```bash
npm test
```

### Wallet and network

Add GenLayer StudioNet to your wallet (chain ID 61999, RPC `https://studio.genlayer.com/api`,
currency GEN) — the app offers a **Switch to StudioNet** button when your wallet is elsewhere.
Test GEN comes from the StudioNet faucet. The app refuses to send anything while the wallet is
on another chain or the configured address is not a verified STATELOCK deployment.

### E2E flow

Connect → Create (five steps) → Fund → ARM → wait for the window → Observe → wait 10 minutes →
Finalize → Settle → check the beneficiary's balance and that nothing more can be done. Every
step, hash and balance of the recorded run is in [`docs/E2E.md`](docs/E2E.md).

## Security

- Terms are hashed and re-checked on every transition; nothing changes after ARM.
- The bounty cannot leave before FINALIZED; settlement zeroes the ledger before transferring, once.
- Evidence is untrusted: frozen URLs only, fenced and bounded text, no instruction authority.
- Uncertainty never forces a result: partial outages, conflicts and unknown dates are Undetermined.
- No owner, admin, pause, upgrade, backend or server key.

## Design notes

- The finality delay (600 s) is twenty times StudioNet's protocol window, because contract code
  cannot read another transaction's finality.
- A condition must be armed before its window opens, so the outcome is unobserved when the
  terms lock.
- A conclusive result stores only what has a consequence, so validators agree on consequences
  rather than on wording.

## Disclaimer

STATELOCK runs on GenLayer StudioNet, a test network. GEN there has no monetary value. The
contract has not been audited.
