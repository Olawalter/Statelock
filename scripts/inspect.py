"""Inspect a deployed STATELOCK contract: code, schema, and on-chain records.

    python scripts/inspect.py <address> [--revision HEAD] [--condition SL-000001]

Everything printed is read from GenLayer StudioNet, never from this
repository or the frontend:

  code       `gen_getContractCode` compared byte-for-byte with
             contracts/statelock.py at the revision (exit 1 on any difference)
  schema     the public methods GenLayer derived from the deployed code
  protocol   `get_protocol_info` (version, limits, time source, consequences)
  conditions every condition id, with status and verdict
  condition  with --condition: the frozen terms, the policy, every
             observation record, and the final result / settlement
"""
import pathlib
import sys

# This file is named inspect.py, which would shadow the standard library's
# `inspect` for every dependency imported below. Take its folder off the path.
_HERE = pathlib.Path(__file__).resolve().parent
sys.path[:] = [p for p in sys.path if pathlib.Path(p or ".").resolve() != _HERE]

import argparse  # noqa: E402
import base64  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import subprocess  # noqa: E402
import urllib.request  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://studio.genlayer.com/api"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json", "User-Agent": UA})
    out = json.load(urllib.request.urlopen(req, timeout=120))
    if "error" in out:
        raise SystemExit(f"RPC error from {method}: {out['error']}")
    return out["result"]


def show(title, value):
    print(f"\n── {title} ──")
    print(json.dumps(value, indent=2, default=str))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("address")
    ap.add_argument("--revision", default="HEAD")
    ap.add_argument("--condition")
    args = ap.parse_args()

    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.chains import studionet

    client = create_client(chain=studionet, account=Account.create())   # read-only, never funded

    def view(fn, *a):
        return client.read_contract(address=args.address, function_name=fn, args=list(a))

    source = subprocess.run(["git", "show", f"{args.revision}:contracts/statelock.py"], cwd=ROOT,
                            capture_output=True, check=True).stdout
    code = base64.b64decode(rpc("gen_getContractCode", [args.address]))
    match = code == source
    print(f"on-chain  {args.address}  {len(code)} bytes  sha256 {hashlib.sha256(code).hexdigest()}")
    print(f"git       {args.revision:<42}  {len(source)} bytes  sha256 {hashlib.sha256(source).hexdigest()}")
    print("MATCH - the deployment is byte-identical to the repository source" if match
          else "DIFFER - the deployment is not this source")

    schema = client.get_contract_schema(args.address)
    show("schema methods", {name: {"params": m.get("params"), "readonly": m.get("readonly"),
                                   "payable": m.get("payable")}
                            for name, m in sorted((schema.get("methods") or {}).items())})
    show("get_protocol_info", view("get_protocol_info"))

    page = view("list_conditions", 0, 50)
    show(f"list_conditions(0, 50) — {page['total']} total",
         [{"condition_id": c["condition_id"], "status": c["status"],
           "verdict": c["result_verdict"], "bounty": c["bounty_terms"]} for c in page["rows"]])

    if args.condition:
        cid = args.condition
        show(f"get_condition({cid})", view("get_condition", cid))
        show(f"get_policy({cid})", view("get_policy", cid))
        show(f"get_observation({cid})", view("get_observation", cid))
        show(f"get_final_result({cid})", view("get_final_result", cid))
    return 0 if match else 1


if __name__ == "__main__":
    raise SystemExit(main())
