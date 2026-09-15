# STATELOCK

> Conditional reality verification on GenLayer: precommit a real-world
> condition, freeze the sources and facts that may prove it, lock a bounty
> against a fixed consequence, and let validator consensus decide from the
> live web whether reality satisfied it — then settle exactly once, after
> finality.

**Lock the condition. Let reality decide.** One Intelligent Contract and a
static web app. No backend, no admin, no oracle, no server-side key.

---

## The problem

A deterministic contract enforces this perfectly:

```python
if timestamp > deadline:
    transfer(creator)
```

It cannot establish this at all:

> Did genlayer-js publish version 1.1.8 as a public release before the
> deadline, according to its GitHub release record and the npm registry?

Conditional commitments — bounties on shipped releases, grants on
published results, bets on public facts — all hinge on a question like
that. Today someone answers it: an oracle operator, a platform, a backend
holding a model API key. Whoever answers controls the money.

## The design

STATELOCK splits the question from the consequence and gives each to the
layer that can actually handle it.

```
      GenLayer validator consensus              Deterministic contract code
      reports FACTS                             decides EVERYTHING ELSE

      per required fact: confirmed /            the verdict, from fixed rules
        contradicted / not found                which sources count (frozen)
      the value each source shows               the deadline and the window
      which sources support it                  who is paid, how much, when
      when the event happened                   finality gate, exactly-once settlement
```

The model is **never allowed to name an outcome, an amount or a
recipient**. It returns per-fact findings; `_derive` turns them into
SATISFIED, NOT_SATISFIED or UNDETERMINED under the frozen policy, and the
consequence is a constant:

| Verdict | Consequence |
|---|---|
| SATISFIED | the exact bounty to the beneficiary |
| NOT_SATISFIED | the exact bounty back to the creator |
| UNDETERMINED | the exact bounty back to the creator |

## Why GenLayer

Everything except the reading could run on any chain. The reading needs
live web pages interpreted by something, and anywhere else that something
is a trusted party. On GenLayer the leader and every validator fetch the
frozen sources and read them independently, the result stands only if
their complete stored results match, and the protocol's own appeal and
finality rules apply. The contract can hold GEN against the outcome
without trusting any single reader — including whoever runs the website.

## Lifecycle

```
DRAFT ──fund──► FUNDED ──arm──► ARMED ──observe──► OBSERVING ──observe──┐
  │               │               │                    │                │
  └──cancel───────┴──cancel──► CANCELLED              (not conclusive)   ▼
                                  └────────observe (conclusive)──────► ACCEPTED
                                                                          │ 600 s
  ARMED / OBSERVING ── deadline + 7 days, never conclusive ──┐           ▼
                                                              └──────► FINALIZED ──settle──► SETTLED
```

- **create** (anyone, becomes the creator): condition text, verification
  policy, observation window, deadline, bounty terms, beneficiary.
- **fund** (creator): the transaction value must equal the bounty terms.
  A deposit that cannot fund — wrong amount, wrong sender, wrong state — is
  sent straight back in the same transaction.
- **arm** (creator, before the window opens): the terms freeze and the
  bounty locks. Nothing can change or be withdrawn afterwards.
- **observe** (anyone, inside the window or up to 7 days after the
  deadline): one consensus observation. Inside the window only SATISFIED is
  conclusive; after the deadline every observation is.
- **finalize** (anyone): 600 s after a conclusive result, or as
  UNDETERMINED / NOT_OBSERVED if nobody observed in time.
- **settle** (anyone, once): pays the destination the verdict fixes.

The prompt's conceptual PROPOSED stage is GenLayer's own leader phase
inside the observe transaction, not a contract status — see
[CONTRACT.md](docs/CONTRACT.md#lifecycle).

## Time

The contract's clock is the transaction's datetime
(`datetime.now(timezone.utc)` inside GenVM). No method takes "now" as an
argument and no method advances a clock. Every node executing a
transaction reads the same instant, so the window, the deadline, the
7-day grace and the finality delay are decided identically everywhere.

## Evidence

- Up to four `https://` sources, frozen at creation, each with a kind and
  a label the creator declares (and the prompt marks as claims).
- Up to six required facts, each with an optional expected value.
- Optional independence: every fact confirmed by sources on two or more
  different hosts, checked in code.
- Only those URLs are fetched. A source is readable with HTTP 2xx and a
  body of 1 byte to 1 MB; JSON is compacted, HTML stripped, control
  characters and the fence markers `<<<` `>>>` removed, 6000 characters
  per source.
- Evidence is untrusted data inside numbered fences; text in a page that
  addresses the reader has no authority.

## Consensus

`observe_condition` is one `gl.vm.run_nondet_unsafe(leader_fn,
validator_fn)` round. The validator repeats the fetch, the model call and
the derivation, then agrees only if its **complete stored result** equals
the leader's: verdict, reason, temporal result, conclusiveness, every
fact's stored status, value and independence, and which sources were
readable.

Consensus is required on what has a consequence, and only that. A fact
the model calls "contradicted" and one it calls "not found" are stored as
one status, `NOT_CONFIRMED`, because they lead to the same result; the
stored value of a confirmed fact is the policy's expected value, not the
model's wording; independence is compared only when the policy requires
it. Malformed model output raises `[LLM_ERROR]`, so the round rotates
instead of recording it.

## Settlement

From FINALIZED only: validate the verdict, refuse a second settlement,
read the ledger, resolve the destination from the constant consequence
table, zero the ledger, record the settlement, mark SETTLED, and only then
emit the transfer through an empty `@gl.evm.contract_interface`. The
finality guarantee is the contract's own gate — on the pinned runner
`emit_transfer` takes no stage argument.

## Quick start

```bash
pip install -r requirements.txt

genvm-lint check contracts/statelock.py --json        # lint
pytest tests/direct -v                                # 86 tests, offline
SKIP_INTEGRATION=0 pytest tests/integration -v -s     # live StudioNet, no keys needed
python scripts/deploy.py                              # deploy HEAD, byte-verify, print app env
python scripts/inspect.py <address> --condition SL-000001   # read it all back
```

The live suite creates throwaway accounts, funds them from the StudioNet
faucet, deploys the contract (plus a disposable probe for the appeal test)
and drives three commitments whose outcomes are known in advance. It waits
out real windows and the finality delay, so it takes about 45 minutes.
`gltest tests/integration -v -s` collects the same tests. Set
`STATELOCK_CONTRACT=<address>` to reuse a deployment (see `.env.example`).

## The app

```bash
cd app && npm ci
cp .env.example .env.local        # contract address below
npm run dev                       # http://localhost:3000
npm test                          # 27 tests
```

```text
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS=0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d
```

Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui, wagmi + viem
(EIP-6963 wallet discovery), TanStack Query, Zod, genlayer-js 1.1.8.
Landing, dashboard, a five-step creation flow, and a commitment page that
separates ON-CHAIN state from EXTERNAL EVIDENCE and offers every verb to
the party the contract allows. Writes are signed by the user's injected
wallet; a write shows as done only when the contract's own view reflects
it, and GenLayer finality is tracked separately. The app refuses to start
on any chain but 61999 and disables every transaction unless the wallet is
on StudioNet and the configured address exposes STATELOCK's exact schema.

## Proven live on StudioNet

- Contract: [`0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d`](https://explorer-studio.genlayer.com/address/0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d)
- Deploy tx: `0x5055fad5ae2aa97d9299d8c64c28dd0c44c9e72a3dda8759af67b7b9ac158ca1` (FINALIZED)
- Source: `contracts/statelock.py`, 56 944 bytes, sha256
  `a78ac0dbf7649db97bfb16204fb2773e5797781f4132c546bdd307aa90292093`
- **Repository = deployment.** `python scripts/inspect.py
  0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d` compares the chain's stored
  code with git: MATCH
- Runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
- Every transaction, hash and balance: [docs/E2E.md](docs/E2E.md)

### The integration suite — 18 passed in 46m19s

| Commitment | Observed | Verdict | Why |
|---|---|---|---|
| genlayer-js releases 1.1.8 (GitHub release record + npm) | inside the window | **SATISFIED** | both facts confirmed, both sources readable |
| genlayer-js's latest stable release is 99.0.0 (GitHub latest + npm dist-tags) | after the deadline | **NOT_SATISFIED** | the required fact not confirmed, every source readable |
| genlayer-js releases 99.0.0 (a release page that returns 404) | after the deadline | **UNDETERMINED** | no source readable |

Refused on-chain, each with the contract's own sentence: a past start,
funding with no value, cancel after ARM, observing before the window,
settling while only ACCEPTED, finalizing before the delay, settling twice.
Returned in the same transaction: a deposit 1 atto short and a deposit
from a third party — both senders' balances unchanged. Before settlement
the contract held exactly the three bounties; after it, zero. The
beneficiary gained 0.01 GEN and the creator 0.02 GEN.

### Through the app — SL-000001 on the deployment of record

Connect (EIP-6963) → wrong-network notice → switch → create in five steps
→ fund → ARM → observe at 22:38 UTC: **SATISFIED** → finalize at 22:48 UTC
→ settle. The beneficiary went from 0 to exactly 0.01 GEN, the contract
from 0.01 GEN to 0, and every transaction ended FINALIZED with validator
votes agree ×3. The browser used had no wallet extension, so a throwaway
EIP-6963 test wallet was injected as harness; the app's own code path did
the rest ([app-e2e.json](docs/app-e2e.json)).

### What the live runs taught (14 Sep)

- **A refused payable transaction keeps its value.** The first runs sent a
  deposit 1 atto short and one from a third party; the contract refused
  both, and StudioNet still credited both values to the contract
  (`value_credited: true` on an ERROR execution). With no admin, that GEN
  was stranded. `fund_condition` now never refuses a deposit that carries
  value: it returns it and records why (`get_returned_deposits`).
- **An appeal on StudioNet erases the appealed contract.** Run 1 filed a
  protocol appeal on the lifecycle contract's accepted observation; the
  rounds went Accepted → Validator Appeal Successful → a re-execution
  failing `invalid_contract absent_runner_comment`, and the contract's code
  was gone. Reproduced on a 16-line counter
  ([docs/evidence/](docs/evidence)). The suite now appeals only a
  disposable probe, and checks the lifecycle contract is untouched.
- **The app's first live run found four UI faults** — a transaction dock
  covering the ARM button, a tracker that never reached Finalized, a
  stale time check disabling Create without a reason, and overflow at
  phone width. All fixed in the commit that records the run.

## Documentation

| | |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | deterministic and nondeterministic execution, web observation, LLM adjudication, Equivalence Principle, Optimistic Democracy, finality, settlement, the frontend, and the research record |
| [CONTRACT.md](docs/CONTRACT.md) | storage, every method, lifecycle, policy rules, the derivation table, funding and settlement, views |
| [SECURITY.md](docs/SECURITY.md) | invariants, the build prompt's security matrix mapped to its tests, prompt injection, malicious sources, web failures, replay, wallet and network safety, the platform issues |
| [E2E.md](docs/E2E.md) | the live integration run and the in-app run, every hash and balance |
| [deployment.json](docs/deployment.json) | the deployment of record and its verification |

## Testing

```
genvm-lint check              passes — 15 methods (8 view, 7 write)
pytest tests/direct           86 passed
pytest tests/integration      18 passed on StudioNet, real panel, real windows (46m19s)
contract mutation sweep       25/25 guards broken on purpose, all caught
app: npm test                 27 passed
app mutation sweep            12/12 guards broken on purpose, all caught
app: npm run build            succeeds
```

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs the contract job (runner bundle,
`genvm-lint`, direct tests) and the app job (typecheck, lint, tests, build) on every push.
The live StudioNet suite runs there only when started by hand (**Run workflow** with
*integration* ticked) and cannot fail the workflow.

The direct suite runs on GenLayer's official direct mode: web responses
and model answers are mocked with its own mechanisms, transaction time is
moved only with `direct_vm.warp()`, and — by replaying the contract's
captured validator closure with `direct_vm.run_validator()` — validators
are shown to fetch and read for themselves and to refuse a leader whose
result their own reading does not support. Every adversarial test asserts
that **money did not move**, not merely that a status changed. The app
suite drives the real genlayer-js client through a mock EIP-1193 wallet
to prove writes are signed by the wallet and carry exactly the right
value, and covers the wrong-network and wrong-contract rows of the
security matrix.

## Known limitations

- **The creator chooses the sources.** A creator who picks a page they
  control can shade the reading. The policy is frozen and visible before
  ARM, source kinds and labels are marked as the creator's claims, and
  independence can be required — but judging a source's credibility is the
  beneficiary's job before accepting the terms.
- **Sources are read as served, not rendered.** `gl.nondet.web.get`
  fetches the raw response: pages behind logins, personalised pages and
  content built by JavaScript are unreadable, and only the first 6000
  extracted characters of each source are read. Stable, public, structured
  endpoints (release APIs, registries) work best.
- **Dates are coarse where sources are.** A date without a time covers the
  whole UTC day; a date-time without a timezone covers ±14 hours. An event
  that close to the deadline is UNDETERMINED rather than guessed.
- **The finality delay is a fixed 600 s.** Contract code cannot read
  another transaction's protocol status, so the delay stands in for it —
  twenty times StudioNet's 30-second window. A network with a much longer
  appeal window would need a longer delay.
- **Nobody is paid to observe.** Observation and settlement are
  permissionless but cost the caller a transaction; the beneficiary (or
  the creator, after the deadline) is expected to trigger them. If nobody
  does, the condition expires to UNDETERMINED and refunds the creator.
- **StudioNet platform behaviour.** An appeal currently erases the appealed
  contract, and value sent to a method that is not payable cannot be
  returned by any contract. The app attaches value only to `fund_condition`.
- **Panel capture is out of scope.** A compromised validator majority can
  agree on a false reading; that is GenLayer's trust model.
- **Test network, unaudited.** StudioNet GEN has no value, and the contract
  has not been audited.
