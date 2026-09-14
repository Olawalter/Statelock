"""Settlement: exact amount, fixed destination, exactly once, only after finality."""
from .conftest import (BOUNTY, CONFIRMED_BOTH, DEADLINE, DOCS_URL, FINALITY_DELAY, HOUR,
                       OBSERVATION_GRACE, OBSERVATION_START, REPO_URL, fact, findings, hex_of,
                       observe, warp_to)

MISSING = findings(fact("released_version", "NOT_FOUND"), fact("public_release", "NOT_FOUND"))


def finalize(direct_vm, deployed, sender, cid):
    c = deployed.get_condition(cid)
    warp_to(direct_vm, c["accepted_at"] + FINALITY_DELAY)
    direct_vm.sender = sender
    deployed.finalize_condition(cid)


def test_satisfied_pays_the_beneficiary_exactly(direct_vm, deployed, direct_bob, direct_charlie,
                                                 accepted_satisfied, transfers):
    finalize(direct_vm, deployed, direct_charlie, accepted_satisfied)
    assert deployed.get_final_result(accepted_satisfied)["destination"].lower() == hex_of(direct_bob).lower()
    deployed.settle_condition(accepted_satisfied)

    c = deployed.get_condition(accepted_satisfied)
    r = deployed.get_final_result(accepted_satisfied)
    assert transfers == [(hex_of(direct_bob).lower(), BOUNTY)]
    assert c["status"] == "SETTLED" and c["terminal"] is True
    assert c["bounty_deposited"] == 0 and c["settled_amount"] == BOUNTY
    assert c["settled_to"].lower() == hex_of(direct_bob).lower()
    assert r["settled"] is True and r["verdict"] == "SATISFIED"
    assert deployed.get_protocol_info()["total_locked"] == 0


def test_not_satisfied_refunds_the_creator(direct_vm, deployed, direct_alice, direct_charlie,
                                           armed, transfers):
    observe(direct_vm, deployed, direct_charlie, armed, DEADLINE + HOUR, MISSING)
    finalize(direct_vm, deployed, direct_charlie, armed)
    deployed.settle_condition(armed)
    assert deployed.get_final_result(armed)["verdict"] == "NOT_SATISFIED"
    assert transfers == [(hex_of(direct_alice).lower(), BOUNTY)]


def test_undetermined_refunds_the_creator(direct_vm, deployed, direct_alice, direct_charlie,
                                          armed, transfers):
    observe(direct_vm, deployed, direct_charlie, armed, DEADLINE + HOUR, CONFIRMED_BOTH,
            sources={REPO_URL: (503, b""), DOCS_URL: (503, b"")})
    finalize(direct_vm, deployed, direct_charlie, armed)
    deployed.settle_condition(armed)
    assert deployed.get_final_result(armed)["verdict"] == "UNDETERMINED"
    assert transfers == [(hex_of(direct_alice).lower(), BOUNTY)]


def test_never_observed_refunds_the_creator(direct_vm, deployed, direct_alice, direct_charlie,
                                            armed, transfers):
    warp_to(direct_vm, DEADLINE + OBSERVATION_GRACE + 1)
    direct_vm.sender = direct_charlie
    deployed.finalize_condition(armed)
    deployed.settle_condition(armed)
    assert transfers == [(hex_of(direct_alice).lower(), BOUNTY)]


def test_settlement_before_finality_is_refused(direct_vm, deployed, direct_charlie,
                                               accepted_satisfied, transfers):
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("illegal transition from ACCEPTED"):
        deployed.settle_condition(accepted_satisfied)
    assert transfers == []
    assert deployed.get_condition(accepted_satisfied)["bounty_deposited"] == BOUNTY


def test_settlement_happens_exactly_once(direct_vm, deployed, direct_bob, direct_charlie,
                                         accepted_satisfied, transfers):
    finalize(direct_vm, deployed, direct_charlie, accepted_satisfied)
    deployed.settle_condition(accepted_satisfied)
    for sender in (direct_charlie, direct_bob):
        direct_vm.sender = sender
        with direct_vm.expect_revert("illegal transition from SETTLED"):
            deployed.settle_condition(accepted_satisfied)
    assert transfers == [(hex_of(direct_bob).lower(), BOUNTY)], "one transfer, ever"


def test_settlement_is_permissionless_but_its_destination_is_not(
    direct_vm, deployed, direct_bob, direct_charlie, accepted_satisfied, transfers
):
    """Anyone may trigger settlement; nobody who triggers it can redirect it."""
    finalize(direct_vm, deployed, direct_charlie, accepted_satisfied)
    direct_vm.sender = direct_charlie
    deployed.settle_condition(accepted_satisfied)
    assert transfers == [(hex_of(direct_bob).lower(), BOUNTY)]


def test_settlement_does_not_touch_other_commitments(direct_vm, deployed, direct_alice, direct_bob,
                                                     direct_charlie, accepted_satisfied, transfers):
    from .conftest import GEN, T0, create
    warp_to(direct_vm, T0 + 60)
    other = create(deployed, direct_vm, direct_charlie, direct_alice, bounty=3 * GEN)
    direct_vm.value = 3 * GEN
    deployed.fund_condition(other)
    direct_vm.value = 0
    assert deployed.get_protocol_info()["total_locked"] == BOUNTY + 3 * GEN

    finalize(direct_vm, deployed, direct_charlie, accepted_satisfied)
    deployed.settle_condition(accepted_satisfied)
    assert transfers == [(hex_of(direct_bob).lower(), BOUNTY)]
    assert deployed.get_condition(other)["bounty_deposited"] == 3 * GEN
    assert deployed.get_protocol_info()["total_locked"] == 3 * GEN
