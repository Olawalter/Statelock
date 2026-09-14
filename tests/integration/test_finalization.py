"""Live: nothing settles before finality; settlement is exact and happens once."""
from .conftest import BOUNTY


def test_settlement_and_finalization_refused_before_finality(live, world):
    world.finalized()
    settle = live.record["refused_settle_before_final"]
    assert settle["refused"] and "illegal transition from ACCEPTED" in settle["refusal"]
    final = live.record["refused_finalize_early"]
    assert final["refused"] and "result can be finalized from" in final["refusal"]


def test_results_finalize_after_the_delay(live, world):
    world.finalized()
    for key, cid in world.ids.items():
        r = live.read("get_final_result", cid)
        assert r["final"] is True and r["finalized_at"] >= r["finalizable_at"]


def test_exact_settlement_and_balance_movement(live, world):
    balances = world.settled()
    ids = world.ids
    sat = live.read("get_final_result", ids["satisfied"])
    ns = live.read("get_final_result", ids["not_satisfied"])
    assert sat["settled_to"].lower() == live.beneficiary.address.lower() and sat["settled_amount"] == BOUNTY
    assert ns["settled_to"].lower() == live.creator.address.lower() and ns["settled_amount"] == BOUNTY
    assert balances["delta"]["beneficiary"] == BOUNTY
    assert balances["delta"]["contract"] == -3 * BOUNTY
    assert live.read("get_protocol_info")["total_locked"] == 0


def test_a_settled_commitment_cannot_settle_again(live, world):
    world.settled()
    again = live.record["refused_second_settlement"]
    assert again["refused"] and "illegal transition from SETTLED" in again["refusal"]
