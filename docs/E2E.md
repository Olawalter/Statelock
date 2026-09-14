# STATELOCK live verification

Everything below happened on GenLayer StudioNet (chain 61999, RPC
`https://studio.genlayer.com/api`, protocol finality window 30 s) and can be re-checked by
anyone: every hash opens at `https://explorer-studio.genlayer.com/tx/<hash>`, every address at
`https://explorer-studio.genlayer.com/address/<address>`, and `python scripts/inspect.py
<address> --condition SL-000001` reads the records back.

Two distinct things are reported for every transaction, and they are not the same:

| Term | Meaning |
|---|---|
| **submitted / ACCEPTED** | the transaction was signed and a validator majority accepted it; it is still inside the appeal window |
| **FINALIZED** | the protocol finality window closed; GenLayer's result is final |
| **executed / refused** | whether the contract ran the method (`SUCCESS`) or refused it with its own sentence (`ERROR`) — a refused transaction can still be FINALIZED |
| **contract FINALIZED** | the contract's own state, reached only 600 s after a result was accepted |

## Deployment of record

| | |
|---|---|
| Contract | [`0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d`](https://explorer-studio.genlayer.com/address/0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d) |
| Deploy transaction | `0x5055fad5ae2aa97d9299d8c64c28dd0c44c9e72a3dda8759af67b7b9ac158ca1` — FINALIZED, MAJORITY_AGREE |
| Source | `contracts/statelock.py`, 56,944 bytes, sha256 `a78ac0dbf7649db97bfb16204fb2773e5797781f4132c546bdd307aa90292093` |
| Verification | `gen_getContractCode` returns the same 56,944 bytes (`scripts/deploy.py`, `scripts/inspect.py`; record in [`deployment.json`](deployment.json)) |

## 1. Integration suite — `tests/integration`, run 3 (the code of record)

```bash
SKIP_INTEGRATION=0 pytest tests/integration -v -s
```

Result: **18 passed in 46 min 19 s** (14 Sep 2026, 21:30–22:16 UTC). Record:
[`live-e2e.json`](live-e2e.json). The harness deployed the current contract twice from the
working tree: a lifecycle contract [`0xc07bc3843F6dbbfcff40D4320ffcFBFD8E3C3e6D`](https://explorer-studio.genlayer.com/address/0xc07bc3843F6dbbfcff40D4320ffcFBFD8E3C3e6D)
and a disposable appeal probe `0x607f001703eFF601a812Df5DaF67bA317879D0D0`. Throwaway creator,
beneficiary and third-party accounts were funded from the faucet; no key was reused or stored.

Three commitments were chosen so their outcomes are known at test time:

| Commitment | Condition and sources | Observed | Verdict | Reason | Readable | Facts |
|---|---|---|---|---|---|---|
| SL-000001 | genlayer-js releases 1.1.8 — GitHub release record + npm version document | inside the window | **SATISFIED** | REQUIRED_FACTS_CONFIRMED, BEFORE_DEADLINE | S1, S2 | released_version CONFIRMED `1.1.8`; public_release CONFIRMED |
| SL-000002 | genlayer-js's latest stable release is 99.0.0 — GitHub latest release + npm dist-tags | after the deadline | **NOT_SATISFIED** | REQUIRED_FACT_NOT_CONFIRMED | S1, S2 | latest_version NOT_CONFIRMED |
| SL-000003 | genlayer-js releases 99.0.0 — its GitHub release record (HTTP 404) | after the deadline | **UNDETERMINED** | SOURCES_UNAVAILABLE | none | released_version NOT_CONFIRMED |

Each observation transaction reached protocol FINALIZED with validator votes
`agree, agree, agree` (two idle).

### Every transaction

| Step | Transaction | Protocol | Contract |
|---|---|---|---|
| create with a past start | `0xda3acaad29cab9b10688b89519788feb1a9cdc45d18f15060833469d1e07d5a5` | ACCEPTED, MAJORITY_AGREE | refused: observation_start must be after the creation time |
| create SL-000001 | `0xa2984b769acbc7900997d6592ebb25f8aa83177523be65273fd4f810c8558594` | ACCEPTED | executed |
| create SL-000002 | `0x9701262aa5683d0a1d60317109a8e0bfd2e59742327b074536c2cff85597b1b9` | ACCEPTED | executed |
| create SL-000003 | `0x5c72109eded63c9981df9ccedb75f2841ea3ea1a7bf2950b23f45eb11d9641d8` | ACCEPTED | executed |
| fund SL-000001 with 1 atto short | `0xe1b750970a0caee6b94f11ad47906b65abb7388c622fe3bacdbb942e496e5bb3` | ACCEPTED | executed: deposit **returned** to the creator (funding must equal the bounty terms exactly) |
| fund SL-000001 from a third party | `0x04045168b5c558718a67ee21b7209c411c557915def798dc47858e69aefbca47` | ACCEPTED | executed: deposit **returned** to the third party (only the creator may do this) |
| fund SL-000001 with no value | `0x2cfd1917db8d136683f68f8148ce6b84f5b0371f99fcec7acf64a893a9ba09bd` | ACCEPTED | refused: funding must equal the bounty terms exactly |
| fund SL-000001 | `0x30f82e4ffc7f0596bb27efa40c54de74d9d9892def07acde4a3b318ca617a1f9` | ACCEPTED | executed |
| arm SL-000001 | `0x36757509f2d9dd941d89b3e8c04342cdea63afc4b73c637d6d32b39e7f8843ed` | ACCEPTED | executed |
| fund SL-000002 | `0x0f3cdb7dd7eb0e2c95d94647efa941a0e98dd7d0f9a471ded4dd4d40dfcdaacf` | ACCEPTED | executed |
| arm SL-000002 | `0x1b3bf0b8518a7c46dc8da0262f9cbf1c47ad6959a734e3fa19028450de024f1d` | ACCEPTED | executed |
| fund SL-000003 | `0xfaa2db9c47b8347db127b5669f92f336fff80f5dc2fae3417ce6d4afff7ce19c` | ACCEPTED | executed |
| arm SL-000003 | `0xaecfbd159833190efaea665962181bfcd6ef8ab2ec34ea4aedd1dc9883c3d496` | ACCEPTED | executed |
| cancel SL-000001 after ARM | `0x54e9b6ed83c0d798a59012ff4ed5c127350394217b47a9beddb5e4d325e85af1` | ACCEPTED | refused: illegal transition from ARMED |
| observe SL-000001 before its window | `0x78130f469c27cd184dc8814e5ab9e70cd217638fc73f70a314b0d350fd23a5be` | ACCEPTED | refused: observation window opens at … |
| observe SL-000001 | `0x87eb3831f5ae0a71792f86ee76247dfcf717df3c29cce67dfc2ce14da12c8f22` | FINALIZED | executed: SATISFIED |
| observe SL-000002 | `0x5a785956d521f0ccc37904369a1731f849a457058f6cafa6d455cd758a0b7cc5` | FINALIZED | executed: NOT_SATISFIED |
| observe SL-000003 | `0xa6d37b5a61dd2f7a1e8f03e84afb355879a342476624fc9ae03e16c141e632e7` | FINALIZED | executed: UNDETERMINED |
| settle SL-000001 while ACCEPTED | `0xb146c1cbbbbf660958c6c4e81e00f111a8420a972467acacfc0d411473e4ba5b` | ACCEPTED | refused: illegal transition from ACCEPTED |
| finalize SL-000001 before the delay | `0x3ee58d2f2b31db3d87fc43e193a65da6c6dc9f2217ce95f76a03f89201df3cad` | ACCEPTED | refused: result can be finalized from … |
| finalize SL-000001 | `0xc41f0aea16b53b39ff9e1bc30fe2b327ac32d1b5eb345ae3e29c23df082abc14` | ACCEPTED | executed |
| finalize SL-000002 | `0xc274883c6795172933cbd00c5869ba255e4352e2bac937eebc0db50ca8ae3e05` | ACCEPTED | executed |
| finalize SL-000003 | `0x84f9b6413a65820d01d1bf73a596f0ca9a4cfc51b2627d4fdfb973d2c11d00e5` | ACCEPTED | executed |
| settle SL-000001 | `0x5367bf1476759b5016b89b1c6e52daae161235e49c8972e0c44ab6bada49111e` | FINALIZED | executed: 0.01 GEN to the beneficiary |
| settle SL-000002 | `0xb6ad6af36e1dd1033f495f5a538fb4156cde23b12615db943927bc082ba54ea8` | FINALIZED | executed: 0.01 GEN to the creator |
| settle SL-000003 | `0x6f468db4b9bc83aa69e1aeaafc87a7363eaf98cbc2955d2788e16dc93daac1d4` | FINALIZED | executed: 0.01 GEN to the creator |
| settle SL-000001 a second time | `0x3082b0e17e41326108968647c1bdb96e4271e3416a6d44a3fbd20d19507fe8cd` | ACCEPTED | refused: illegal transition from SETTLED |

### Exact balance movement (atto-GEN)

| Account | Before settlement | After | Change |
|---|---|---|---|
| Contract | 30,000,000,000,000,000 | 0 | −30,000,000,000,000,000 (the three bounties, nothing else) |
| Beneficiary | 1,000,000,000,000,000,000 | 1,010,000,000,000,000,000 | +10,000,000,000,000,000 (SATISFIED) |
| Creator | 960,000,000,000,000,000 | 980,000,000,000,000,000 | +20,000,000,000,000,000 (NOT_SATISFIED + UNDETERMINED refunds) |

Returned deposits, before arming: the third party held 1,000,000,000,000,000,000 before and
after its returned deposit; the creator likewise. `get_returned_deposits` lists both, with
their reasons.

## 2. Through the application, on the deployment of record

The web app (`app/`, `npm run dev`) configured with the deployment of record, driven step by
step in a browser on 14 Sep 2026, 22:23–22:51 UTC. Record read back from the chain:
[`app-e2e.json`](app-e2e.json).

**About the wallet.** The browser used for this run has no wallet extension, so an EIP-6963
provider was injected into the page as test harness: a throwaway key generated in page memory,
funded from the faucet, signing `eth_sendTransaction` locally. It is not part of the app and
was never stored. The app's code path is the production one — it discovered the wallet through
EIP-6963 and sent every write through `writeContract` with the connected address and that
provider. The same steps work with Rabby, MetaMask, Trust Wallet or Coinbase Wallet.

| Party | Address |
|---|---|
| Creator (test wallet) | `0x14a95642Bcb2B43ac0aF4EDC4865f01c50AFE61B` |
| Beneficiary (fresh address, balance 0) | `0x7f7dC7d0A133fF6eEAbb243552C296A5d27b6Af5` |

| # | Step (build prompt §54) | What the app showed | Chain |
|---|---|---|---|
| 1 | Open the application | landing page reading `STATELOCK-1.0.0` from the contract; no "not verified" notice, so the configured address passed the schema check | — |
| 2 | Connect an injected wallet | wallet dialog listed "E2E Test Wallet" by its EIP-6963 announcement; header shows `0x14a9…E61B` | — |
| 3 | Confirm the network | wallet switched to chain 1: blocking notice "Your wallet is on the wrong network … No transaction will be sent until this matches"; **Switch to StudioNet** issued `wallet_switchEthereumChain` and the notice cleared | — |
| 4–9 | Condition, policy, window, bounty, beneficiary, review | five steps; "genlayer-js publishes version 1.1.8 as a public release"; sources: GitHub release record `v1.1.8`, npm version document `1.1.8`; facts `released_version` = 1.1.8 and `public_release`; window 22:38 UTC → deadline 15 Sep 22:29 UTC; 0.01 GEN; review with "After ARM, these parameters cannot be changed." | — |
| — | (validation) | Create stayed disabled while the window opened less than five minutes ahead; the time was corrected before creating | — |
| 10–11 | Create and fund, confirmed in the wallet | Awaiting wallet → Signed → Submitted → Confirming → Confirmed → Contract state updated, for each; "Recorded as SL-000001" | create `0x1a6254901c9d2da75d097d4136b7ec1b5151d4593747048953111ee54009b3b3`; fund `0x68381a6c45ce3a9101247a8633a657b6cf5286185b829797073060b00e044c7e` (value 10,000,000,000,000,000) |
| 12–13 | ARM, confirmed in the wallet | "SL-000001 is armed. Its terms are locked and the bounty is held until settlement." | `0x263718de6fd32c24997bf73edf8141e3738587e8a0c217f93d404f54a56451c7` |
| 14 | Locked state | detail page: Armed; "Frozen: cannot be changed by anyone"; Observe disabled until 22:38 UTC; creator-only actions gone | — |
| 15–16 | Observe when eligible | Observe now at 22:38 UTC | `0xd2abe6bcd77423c7d0f3c8af95c7bf633dbed9674cbd67969d2e95f673ead7db` |
| 17 | Consensus and finality | GenLayer status Accepted, "appeal window open"; contract "Result accepted", "finality delay ends 22:48 UTC"; Finalize disabled until then | observation FINALIZED, votes agree ×3 |
| 18 | Final adjudicated result | **Satisfied** — every required fact confirmed, before the deadline; both sources readable; `released_version` Confirmed 1.1.8, `public_release` Confirmed; EXTERNAL EVIDENCE shown apart from ON-CHAIN state | finalize `0x3746db6941f4eb526fad123506824869bfb973290e261d68b87a3a58649a7852` (22:48:57 UTC) |
| 19–20 | Settle (permissionless), confirmed | "Settled. 0.01 GEN was paid to the beneficiary." | settle `0x7979b74faaa13d3e593582f3f68f2281145080c329473bfbef31513693b49be8`; the contract's transfer `0x81c0222c9ba553917b725de705e016a4a4e5853776be9ab249f29ece5176dd46` (value 10,000,000,000,000,000) |
| 21 | Exact balance movement | beneficiary 0 → **10,000,000,000,000,000**; contract 10,000,000,000,000,000 → **0**; creator unchanged by settlement (990,000,000,000,000,000) | balances read before clicking Settle and after |
| 22 | Terminal | status Settled; no action offered; "This commitment is settled and closed. It cannot be settled again." (the contract's refusal of a second settlement is exercised live in section 1) | — |

Every transaction above ended FINALIZED on StudioNet with execution SUCCESS. The detail page
lists the same hashes, read from `sim_getTransactionsForAddress`, not from app state.

### Issues this run found in the app, fixed in the same commit as the record

- the fixed transaction dock sat over the ARM button, so a click landed on the dock;
- the action panel's tracker kept a snapshot and stayed at "Accepted, appeal window open" after
  GenLayer finalized the transaction;
- the review step could hold a stale time check, leaving Create disabled with no reason shown;
- the detail page overflowed horizontally at phone width.

## Appeals on StudioNet

The brief asks for appeal and finality behaviour to be tested under the current protocol. On
StudioNet, filing `appeal_transaction` on an accepted transaction was observed to **erase the
contract that was appealed**. Evidence:

| Where | Transaction | What happened |
|---|---|---|
| Run 1, lifecycle contract `0x20CC91FA4b15F0fe37261b72D213d8810Fe75969` | `0x95da9da21f8bebe14c8cef4929b714119e3ff2add9f4767f86a503f3adffc6d7` (observe, ACCEPTED, SUCCESS) | appeal filed → consensus rounds `Accepted, Validator Appeal Successful, Accepted`; the re-execution failed `invalid_contract absent_runner_comment`; `gen_getContractCode` then returned 0 bytes and `gen_getContractSchema` "Contract not deployed". Every later write failed the same way, so 13 of 17 tests failed. Record: [`evidence/live-run-1-appeal-erased-contract.json`](evidence/live-run-1-appeal-erased-contract.json) (its `protocol_appeal` field was overwritten by the harness re-running the failed phase — since fixed) |
| Minimal reproduction, a 16-line counter | [`evidence/studionet_appeal_repro.py`](evidence/studionet_appeal_repro.py) | deploy → `bump` (ACCEPTED) → appeal → within 6 s the same three rounds and "Contract not deployed" |
| Run 2 probe `0xaE90E65fce0d7070900028E4e43CC4547BCf37E3` | `0x99ad194c98b7829758f8045b428208752e1e3823512eb088202fed0417f437bd` | same rounds; code 54,357 bytes before, unreadable after |
| Run 3 probe `0x607f001703eFF601a812Df5DaF67bA317879D0D0` | `0x356b194d75eb1f601f1a69bb1b2910e2761027954f217e54acb6d14c4e59b631` | same rounds; code 56,944 bytes before, unreadable after; the lifecycle contract, never appealed, still 56,944 bytes |

The live suite therefore asserts what the protocol did (an appeal round ran; the transaction
ended FINALIZED) against a disposable deployment, and that the contract holding the bounties
is untouched. STATELOCK's own guarantee is independent of this: nothing can settle until
600 s after a result is accepted, twenty times the protocol window.

## Value on refused transactions

Run 2 (record [`evidence/live-run-2-before-deposit-return.json`](evidence/live-run-2-before-deposit-return.json),
18/18 on the previous contract) showed a second platform behaviour. The two funding attempts
the contract refused (`0xef10395ca6119e63…` 1 atto short, `0xd9d034321d25351d…` third party)
carry `value_credited: true` although their execution was ERROR; the contract's balance before
settlement was 49,999,999,999,999,999 atto against 30,000,000,000,000,000 of live bounties,
and the senders never got the difference back. The contract was changed so that a deposit
that cannot fund is returned in the same transaction instead of refused; run 3 above verifies
it live.
