"""Minimal StudioNet appeal reproduction: does appealing an ACCEPTED write erase the contract?"""
import base64, json, time, urllib.request
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

RPC = "https://studio.genlayer.com/api"
def rpc(m, p):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 Chrome/131.0"})
    return json.load(urllib.request.urlopen(req, timeout=120))

CODE = b'''# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


class Counter(gl.Contract):
    n: u256

    def __init__(self):
        self.n = u256(0)

    @gl.public.write
    def bump(self) -> None:
        self.n = u256(int(self.n) + 1)

    @gl.public.view
    def get(self) -> int:
        return int(self.n)
'''
acct = Account.create()
rpc("sim_fundAccount", [acct.address, 10 ** 18])
time.sleep(5)
c = create_client(chain=studionet, account=acct)
tx = c.deploy_contract(code=CODE)
r = c.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED, interval=3000, retries=100)
addr = r["data"]["contract_address"]
print("deployed", addr, "code bytes", len(base64.b64decode(rpc("gen_getContractCode", [addr])["result"])))
c.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.FINALIZED, interval=5000, retries=100)

w = c.write_contract(address=addr, function_name="bump", args=[])
w = w.hex() if hasattr(w, "hex") else str(w)
c.wait_for_transaction_receipt(transaction_hash=w, status=TransactionStatus.ACCEPTED, interval=2000, retries=100)
print("bump accepted; n =", c.read_contract(address=addr, function_name="get", args=[]))
try:
    c.appeal_transaction(transaction_id=w)
    print("appeal submitted")
except Exception as e:
    print("appeal error", str(e)[:300])

for i in range(40):
    t = rpc("eth_getTransactionByHash", [w])["result"]
    rounds = [x.get("consensus_round") for x in (t.get("consensus_history") or {}).get("consensus_results", [])]
    code = rpc("gen_getContractCode", [addr])
    n = len(base64.b64decode(code["result"])) if "result" in code else f"error {code.get('error')}"
    print(f"t+{i*6:>3}s status={t['status']} rounds={rounds} code_bytes={n}")
    if t["status"] == "FINALIZED" and len(rounds) >= 2:
        break
    time.sleep(6)
lr = t["consensus_data"]["leader_receipt"]; lr = lr[0] if isinstance(lr, list) else lr
print("final exec:", lr.get("execution_result"), base64.b64decode(lr["result"]) if isinstance(lr.get("result"), str) else lr.get("result"))
print("schema after:", json.dumps(rpc("gen_getContractSchema", [addr]))[:160])
