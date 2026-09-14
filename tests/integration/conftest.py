"""Live integration harness: GenLayer StudioNet, real validators, real web, real GEN.

    SKIP_INTEGRATION=0 pytest tests/integration -v -s
    (the gltest wrapper collects the same tests: SKIP_INTEGRATION=0 gltest tests/integration -v -s)

No keys are needed. The harness creates throwaway creator, beneficiary and
third-party accounts, funds them from the StudioNet faucet, deploys
contracts/statelock.py from the working tree (or uses STATELOCK_CONTRACT),
and drives three commitments whose outcomes are known at test time, so the
suite can assert them (build prompt §54):

    SATISFIED      "genlayer-js releases version 1.1.8" — GitHub's release record
                   and npm's version document, observed inside the window
    NOT_SATISFIED  "genlayer-js's latest release is 99.0.0" — GitHub's latest
                   release and npm's dist-tags, observed after the deadline
    UNDETERMINED   the only allowed source does not exist (HTTP 404)

The phases run lazily and in order from one shared `world`, so each test file
asserts its own stage whatever order pytest runs them in. A phase that fails
fails every test that needs it, once; it is never re-run. Every transaction —
hash, protocol status, consensus result, votes, execution result, and the
contract's own refusal text — is written to docs/live-e2e.json.

The protocol appeal is filed against an observation on a SECOND, disposable
STATELOCK deployment, never the one holding the lifecycle's bounties: on
StudioNet an appeal of an accepted transaction was observed to erase the
contract being appealed (see docs/E2E.md, "Appeals on StudioNet").
"""
import base64
import json
import os
import pathlib
import time
import urllib.request

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts" / "statelock.py"
RECORD = ROOT / "docs" / "live-e2e.json"
RPC = "https://studio.genlayer.com/api"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")
LIVE = os.environ.get("SKIP_INTEGRATION", "1") == "0"

BOUNTY = 10 ** 16            # 0.01 GEN per commitment
FINALITY_DELAY = 600

POLICY_SATISFIED = {
    "sources": [
        {"url": "https://api.github.com/repos/genlayerlabs/genlayer-js/releases/tags/v1.1.8",
         "kind": "OFFICIAL_REPOSITORY", "label": "genlayer-js GitHub release record"},
        {"url": "https://registry.npmjs.org/genlayer-js/1.1.8",
         "kind": "PUBLIC_REGISTRY", "label": "npm registry version document"},
    ],
    "required_facts": [
        {"name": "released_version", "description": "The version number of this published release",
         "expected": "1.1.8"},
        {"name": "public_release",
         "description": "The release is published and publicly available: not a draft and not a pre-release"},
    ],
    "temporal_rule": "EVENT_BY_DEADLINE",
    "require_independent_sources": False,
    "instructions": "A draft or pre-release does not count as publicly available.",
}
POLICY_NOT_SATISFIED = {
    "sources": [
        {"url": "https://api.github.com/repos/genlayerlabs/genlayer-js/releases/latest",
         "kind": "OFFICIAL_REPOSITORY", "label": "genlayer-js latest GitHub release"},
        {"url": "https://registry.npmjs.org/-/package/genlayer-js/dist-tags",
         "kind": "PUBLIC_REGISTRY", "label": "npm dist-tags for genlayer-js"},
    ],
    "required_facts": [
        {"name": "latest_version", "description": "The version marked as the latest stable release",
         "expected": "99.0.0"},
    ],
    "temporal_rule": "EVENT_BY_DEADLINE",
    "require_independent_sources": False,
    "instructions": "Only the stable 'latest' release counts; release candidates do not.",
}
POLICY_UNDETERMINED = {
    "sources": [
        {"url": "https://api.github.com/repos/genlayerlabs/genlayer-js/releases/tags/v99.0.0",
         "kind": "OFFICIAL_REPOSITORY", "label": "genlayer-js v99.0.0 release record"},
    ],
    "required_facts": [
        {"name": "released_version", "description": "The version number of this published release",
         "expected": "99.0.0"},
    ],
    "temporal_rule": "EVENT_BY_DEADLINE",
    "require_independent_sources": False,
    "instructions": "",
}


def rpc(method, params, attempts=8):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(attempts):
        try:
            req = urllib.request.Request(RPC, data=body, headers={
                "Content-Type": "application/json", "User-Agent": UA})
            out = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in out:
                raise RuntimeError(f"{method}: {out['error']}")
            return out["result"]
        except RuntimeError:
            raise
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(5 + 5 * i)


def _patch_transport():
    """The public RPC drops connections and serves CDN error pages mid-poll.
    Retry transport failures only; a JSON-RPC error is a real answer."""
    from genlayer_py.provider.provider import GenLayerProvider
    original = GenLayerProvider.make_request

    def make_request(self, method, params):
        for i in range(8):
            try:
                return original(self, method, params)
            except Exception as e:
                text = str(e)
                transient = any(s in text for s in (
                    "Connection", "timed out", "SSL", "502", "503", "504",
                    "<!DOCTYPE", "invalid JSON", "RemoteDisconnected", "reset"))
                if not transient or i == 7:
                    raise
                time.sleep(5 + 5 * i)
    GenLayerProvider.make_request = make_request


def _hex(tx):
    return tx.hex() if hasattr(tx, "hex") else str(tx)


def _utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _decode_payload(result):
    """A refusal's text: the leader result is base64 with a leading code byte."""
    payload = result.get("payload") if isinstance(result, dict) else result
    if isinstance(payload, str):
        try:
            raw = base64.b64decode(payload, validate=True)
            return raw[1:].decode("utf-8", "replace") if raw else ""
        except Exception:
            return payload
    return str(payload or "")


class Live:
    def __init__(self):
        from eth_account import Account
        from genlayer_py import create_client
        from genlayer_py.chains import studionet
        _patch_transport()
        self._create_client, self._chain = create_client, studionet
        self.creator = Account.create()
        self.beneficiary = Account.create()
        self.third = Account.create()               # a party to nothing
        self.reader = create_client(chain=studionet, account=Account.create())
        self.record = {"network": "GenLayer StudioNet", "chain_id": studionet.id, "rpc": RPC,
                       "finality_window_seconds": rpc("sim_getFinalityWindowTime", []),
                       "accounts": {"creator": self.creator.address,
                                    "beneficiary": self.beneficiary.address,
                                    "third_party": self.third.address},
                       "started_at": _utc(), "transactions": [], "commitments": {}}
        for acct in (self.creator, self.beneficiary, self.third):
            rpc("sim_fundAccount", [acct.address, 10 ** 18])
        for acct in (self.creator, self.beneficiary, self.third):
            self.await_(lambda a=acct: self.balance(a.address) > 0, "faucet")

        existing = os.environ.get("STATELOCK_CONTRACT")
        if existing:
            self.address = existing
            self.record["deployment"] = {"address": existing, "reused": True}
        else:
            self.address, self.record["deployment"] = self._deploy()
        self.await_(lambda: self.read("get_protocol_info") is not None, "deployment")
        self.record["contract"] = self.address
        # a disposable second deployment, the only contract a protocol appeal is ever filed on
        self.probe, self.record["appeal_probe_deployment"] = self._deploy()
        self.await_(lambda: self.read("get_protocol_info", address=self.probe) is not None, "probe deployment")

    def _deploy(self):
        code = CONTRACT.read_bytes().replace(b"\r\n", b"\n")
        c = self.client(self.creator)
        tx = c.deploy_contract(code=code)
        receipt = self.wait(c, tx, "ACCEPTED")
        address = (receipt.get("data") or {}).get("contract_address")
        return address, {"address": address, "tx": _hex(tx), "consensus": receipt.get("result_name")}

    def code_bytes(self, address):
        try:
            return len(base64.b64decode(rpc("gen_getContractCode", [address])))
        except Exception as e:
            return f"unreadable: {str(e)[:120]}"

    # ── plumbing ──
    def client(self, acct):
        return self._create_client(chain=self._chain, account=acct)

    def wait(self, c, tx, status):
        from genlayer_py.types import TransactionStatus
        return c.wait_for_transaction_receipt(transaction_hash=tx,
                                              status=TransactionStatus[status],
                                              interval=5000, retries=360)

    @staticmethod
    def await_(predicate, what, tries=60, pause=5):
        for _ in range(tries):
            try:
                if predicate():
                    return
            except Exception:
                pass
            time.sleep(pause)
        raise TimeoutError(f"timed out waiting for {what}")

    def role(self, acct):
        return {id(self.creator): "creator", id(self.beneficiary): "beneficiary",
                id(self.third): "third_party"}.get(id(acct), "other")

    def balance(self, address) -> int:
        return int(self.reader.get_balance(address))

    def read(self, fn, *args, address=None):
        return self.reader.read_contract(address=address or self.address, function_name=fn, args=list(args))

    def tx_facts(self, tx_hash) -> dict:
        t = rpc("eth_getTransactionByHash", [tx_hash]) or {}
        votes = (t.get("consensus_data") or {}).get("votes") or {}
        return {"status": t.get("status"), "consensus": t.get("result_name"),
                "appealed": t.get("appealed"), "votes": sorted(votes.values()) if isinstance(votes, dict) else votes,
                "created_timestamp": t.get("created_timestamp")}

    def write(self, acct, fn, *args, value=0, wait="ACCEPTED", step=None, commitment=None, address=None):
        c = self.client(acct)
        tx = c.write_contract(address=address or self.address, function_name=fn, args=list(args), value=value)
        receipt = self.wait(c, tx, wait)
        leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        result = leader.get("result") or {}
        entry = {"step": step or fn, "commitment": commitment, "function": fn,
                 "caller": self.role(acct), "tx": _hex(tx), "value": value,
                 "status": receipt.get("status_name"), "consensus": receipt.get("result_name"),
                 "execution": leader.get("execution_result"),
                 "refused": leader.get("execution_result") not in (None, "SUCCESS")}
        if entry["refused"]:
            entry["refusal"] = _decode_payload(result)
        self.record["transactions"].append(entry)
        print(f"  {entry['step']:<42} {entry['tx'][:18]}…  {entry['status']} {entry['consensus']}  "
              f"{entry['execution']}" + (f"  REFUSED: {entry['refusal'][:110]}" if entry["refused"] else ""))
        return entry

    @staticmethod
    def sleep_until(unix_seconds, margin=45, why=""):
        remaining = int(unix_seconds) + margin - time.time()
        if remaining > 0:
            print(f"  … waiting {int(remaining)}s of real time {why}")
            time.sleep(remaining)

    def save(self):
        self.record["finished_at"] = _utc()
        RECORD.write_text(json.dumps(self.record, indent=2, default=str) + "\n", encoding="utf-8")


class World:
    """The live lifecycle, advanced on demand, each phase exactly once."""

    def __init__(self, live: Live):
        self.live = live
        self.done = set()
        self.failed = {}
        self.ids = {}
        self.probe_id = None
        self.balances = {}

    def _once(self, name, fn):
        if name in self.failed:
            raise RuntimeError(f"phase {name} already failed: {self.failed[name]}")
        if name not in self.done:
            print(f"\nPHASE {name}")
            try:
                fn()
            except Exception as e:
                self.failed[name] = f"{type(e).__name__}: {str(e)[:300]}"
                self.live.record.setdefault("failed_phases", {})[name] = self.failed[name]
                raise
            self.done.add(name)

    # ── create ──
    def created(self):
        def run():
            live = self.live
            now = int(time.time())
            # ARM must precede the window: leave room for ~14 accepted transactions first
            start = now + 1500
            specs = {
                "satisfied": ("genlayer-js releases version 1.1.8", POLICY_SATISFIED,
                              start, start + 86400),
                "not_satisfied": ("genlayer-js's latest stable release is version 99.0.0",
                                  POLICY_NOT_SATISFIED, start, start + 300),
                "undetermined": ("genlayer-js releases version 99.0.0", POLICY_UNDETERMINED,
                                 start, start + 300),
            }
            refused = live.write(live.creator, "create_condition", "Starts in the past",
                                 json.dumps(POLICY_SATISFIED), now - 3600, now + 3600, BOUNTY,
                                 live.beneficiary.address, step="create with a past start (refused)")
            live.record["refused_create"] = refused
            for key, (text, policy, start, deadline) in specs.items():
                before = live.read("get_protocol_info")["condition_count"]
                live.write(live.creator, "create_condition", text, json.dumps(policy), start,
                           deadline, BOUNTY, live.beneficiary.address,
                           step=f"create_condition [{key}]", commitment=key)
                cid = f"SL-{before + 1:06d}"
                assert live.read("get_condition", cid)["condition_text"] == text
                self.ids[key] = cid
                live.record["commitments"][key] = {"condition_id": cid, "text": text,
                                                   "observation_start": start, "deadline": deadline}
            text, policy, pstart, pdeadline = specs["satisfied"]
            live.write(live.creator, "create_condition", text, json.dumps(policy), pstart, pdeadline, BOUNTY,
                       live.beneficiary.address, step="create_condition [appeal probe]",
                       commitment="appeal_probe", address=live.probe)
            self.probe_id = "SL-000001"
            assert live.read("get_condition", self.probe_id, address=live.probe)["condition_text"] == text
        self._once("create", run)
        return self.ids

    # ── fund + arm ──
    def armed(self):
        self.created()

        def run():
            live = self.live
            first = self.ids["satisfied"]
            # A deposit that cannot fund is RETURNED in the same transaction: the
            # chain credits a failed transaction's value to the contract, so a
            # refusal would strand it (observed in the first live runs).
            third_before = live.balance(live.third.address)
            creator_before = live.balance(live.creator.address)
            under = live.write(live.creator, "fund_condition", first, value=BOUNTY - 1,
                               step="fund with 1 atto short (returned)", commitment="satisfied")
            live.record["returned_underfund"] = under
            third = live.write(live.third, "fund_condition", first, value=BOUNTY,
                               step="fund by a third party (returned)", commitment="satisfied")
            live.record["returned_third_party_fund"] = third
            zero = live.write(live.creator, "fund_condition", first, value=0,
                              step="fund with no value (refused)", commitment="satisfied")
            live.record["refused_zero_fund"] = zero
            live.await_(lambda: live.balance(live.third.address) == third_before, "third party deposit returned",
                        tries=60, pause=10)
            live.await_(lambda: live.balance(live.creator.address) == creator_before,
                        "creator short deposit returned", tries=60, pause=10)
            live.record["returned_deposits"] = live.read("get_returned_deposits", 0, 50)
            live.record["balances_after_returns"] = {
                "third_party": {"before": third_before, "after": live.balance(live.third.address)},
                "creator": {"before": creator_before, "after": live.balance(live.creator.address)},
                "contract": live.balance(live.address)}
            for key, cid in self.ids.items():
                live.write(live.creator, "fund_condition", cid, value=BOUNTY,
                           step=f"fund_condition [{key}]", commitment=key)
                live.write(live.creator, "arm_condition", cid, step=f"arm_condition [{key}]",
                           commitment=key)
            live.write(live.creator, "fund_condition", self.probe_id, value=BOUNTY,
                       step="fund_condition [appeal probe]", commitment="appeal_probe", address=live.probe)
            live.write(live.creator, "arm_condition", self.probe_id, step="arm_condition [appeal probe]",
                       commitment="appeal_probe", address=live.probe)
            withdraw = live.write(live.creator, "cancel_condition", first,
                                  step="cancel after ARM (refused)", commitment="satisfied")
            live.record["refused_cancel_after_arm"] = withdraw
            early = live.write(live.third, "observe_condition", first,
                               step="observe before the window (refused)", commitment="satisfied")
            live.record["refused_early_observation"] = early
        self._once("fund_arm", run)
        return self.ids

    # ── observe ──
    def observed(self):
        self.armed()

        def run():
            live = self.live
            start = live.record["commitments"]["satisfied"]["observation_start"]
            live.sleep_until(start, why="for the observation window to open")
            obs = live.write(live.third, "observe_condition", self.ids["satisfied"],
                             step="observe_condition [satisfied] (within window)", commitment="satisfied")
            live.record["commitments"]["satisfied"]["observe_tx"] = obs["tx"]
            probe = live.write(live.third, "observe_condition", self.probe_id, address=live.probe,
                               step="observe_condition [appeal probe]", commitment="appeal_probe")
            self._appeal(probe["tx"])

            deadline = live.record["commitments"]["not_satisfied"]["deadline"]
            live.sleep_until(deadline, why="for the short deadlines to pass")
            obs_ns = live.write(live.third, "observe_condition", self.ids["not_satisfied"],
                                step="observe_condition [not_satisfied] (after deadline)",
                                commitment="not_satisfied")
            live.record["commitments"]["not_satisfied"]["observe_tx"] = obs_ns["tx"]
            obs_u = live.write(live.beneficiary, "observe_condition", self.ids["undetermined"],
                               step="observe_condition [undetermined] (after deadline)",
                               commitment="undetermined")
            live.record["commitments"]["undetermined"]["observe_tx"] = obs_u["tx"]
            for key, cid in self.ids.items():
                live.record["commitments"][key]["observations"] = live.read("get_observation", cid)
                live.record["commitments"][key]["after_observation"] = live.read("get_condition", cid)
        self._once("observe", run)
        return self.ids

    # ── protocol appeal on one accepted observation (disposable deployment) ──
    def _appeal(self, tx):
        """File a GenLayer protocol appeal on the probe's observation while its
        finality window is still open. The application implements no appeal of
        its own: this exercises the protocol's."""
        live = self.live
        outcome = {"tx": tx, "contract": live.probe, "status_before": live.tx_facts(tx)["status"],
                   "probe_code_bytes_before": live.code_bytes(live.probe)}
        try:
            live.client(live.third).appeal_transaction(transaction_id=tx)
            outcome["appeal_submitted"] = True
        except Exception as e:
            outcome["appeal_submitted"] = False
            outcome["appeal_error"] = str(e)[:300]
        print(f"  protocol appeal on {tx[:18]}…: {outcome}")
        live.record["protocol_appeal"] = outcome

    def appealed(self):
        self.observed()

        def run():
            live = self.live
            appeal = live.record["protocol_appeal"]
            tx = appeal["tx"]
            live.await_(lambda: live.tx_facts(tx)["status"] == "FINALIZED", "appealed observation finality",
                        tries=120, pause=10)
            t = rpc("eth_getTransactionByHash", [tx]) or {}
            leader = ((t.get("consensus_data") or {}).get("leader_receipt") or [{}])
            leader = leader[0] if isinstance(leader, list) else leader
            appeal.update({
                "status_after": t.get("status"),
                "rounds": [r.get("consensus_round") for r in
                           (t.get("consensus_history") or {}).get("consensus_results", [])],
                "final_execution": leader.get("execution_result"),
                "final_result_text": _decode_payload(leader.get("result")) if leader.get("execution_result") != "SUCCESS" else "",
                "probe_code_bytes_after": live.code_bytes(live.probe),
                "main_code_bytes_after": live.code_bytes(live.address),
            })
            print(f"  appeal outcome: {appeal}")
        self._once("appeal", run)
        return self.live.record["protocol_appeal"]

    # ── finalize ──
    def finalized(self):
        self.observed()

        def run():
            live = self.live
            for key, cid in self.ids.items():
                obs_tx = live.record["commitments"][key]["observe_tx"]
                live.await_(lambda t=obs_tx: live.tx_facts(t)["status"] == "FINALIZED",
                            f"protocol finality of {obs_tx[:10]}", tries=120, pause=10)
                live.record["commitments"][key]["observe_tx_final"] = live.tx_facts(obs_tx)

            cid = self.ids["satisfied"]
            early_settle = live.write(live.third, "settle_condition", cid,
                                      step="settle while ACCEPTED (refused)", commitment="satisfied")
            live.record["refused_settle_before_final"] = early_settle
            early_final = live.write(live.third, "finalize_condition", cid,
                                     step="finalize before the delay (refused)", commitment="satisfied")
            live.record["refused_finalize_early"] = early_final

            latest_accept = max(live.read("get_condition", c)["accepted_at"] for c in self.ids.values())
            live.sleep_until(latest_accept + FINALITY_DELAY, why="for the finality delay")
            for key, c in self.ids.items():
                live.write(live.third, "finalize_condition", c, step=f"finalize_condition [{key}]",
                           commitment=key)
                live.record["commitments"][key]["final_result"] = live.read("get_final_result", c)
        self._once("finalize", run)

    # ── settle ──
    def settled(self):
        self.finalized()

        def run():
            live = self.live
            before = {"creator": live.balance(live.creator.address),
                      "beneficiary": live.balance(live.beneficiary.address),
                      "contract": live.balance(live.address)}
            for key, cid in self.ids.items():
                live.write(live.third, "settle_condition", cid, wait="FINALIZED",
                           step=f"settle_condition [{key}]", commitment=key)
            # the contract holds exactly the three live bounties: nothing stranded
            assert before["contract"] == 3 * BOUNTY, before
            expected_beneficiary = before["beneficiary"] + BOUNTY
            live.await_(lambda: live.balance(live.beneficiary.address) == expected_beneficiary,
                        "beneficiary payout", tries=90, pause=10)
            live.await_(lambda: live.balance(live.address) == before["contract"] - 3 * BOUNTY,
                        "contract release", tries=90, pause=10)
            after = {"creator": live.balance(live.creator.address),
                     "beneficiary": live.balance(live.beneficiary.address),
                     "contract": live.balance(live.address)}
            self.balances = {"before": before, "after": after,
                             "delta": {k: after[k] - before[k] for k in before}}
            live.record["balances"] = self.balances
            again = live.write(live.third, "settle_condition", self.ids["satisfied"],
                               step="settle a second time (refused)", commitment="satisfied")
            live.record["refused_second_settlement"] = again
            for key, cid in self.ids.items():
                live.record["commitments"][key]["settled"] = live.read("get_final_result", cid)
        self._once("settle", run)
        return self.balances


@pytest.fixture(scope="session")
def live():
    if not LIVE:
        pytest.skip("set SKIP_INTEGRATION=0 to run against StudioNet")
    harness = Live()
    yield harness
    harness.save()


@pytest.fixture(scope="session")
def world(live):
    return World(live)
