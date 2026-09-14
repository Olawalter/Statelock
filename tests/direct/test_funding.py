"""Funding, the terms-vs-deposited ledger, cancellation and ARM funding."""
from .conftest import BOUNTY, GEN, hex_of


def fund(direct_vm, deployed, sender, cid, value):
    direct_vm.sender = sender
    direct_vm.value = value
    try:
        deployed.fund_condition(cid)
    finally:
        direct_vm.value = 0


def test_exact_funding_moves_terms_into_the_ledger(direct_vm, deployed, direct_alice, drafted):
    before = deployed.get_condition(drafted)
    assert before["bounty_terms"] == BOUNTY and before["bounty_deposited"] == 0
    fund(direct_vm, deployed, direct_alice, drafted, BOUNTY)
    c = deployed.get_condition(drafted)
    assert c["status"] == "FUNDED"
    assert c["bounty_deposited"] == BOUNTY
    assert deployed.get_protocol_info()["total_locked"] == BOUNTY


def test_underfunding_overfunding_and_zero_are_refused(direct_vm, deployed, direct_alice, drafted):
    for value in (BOUNTY - 1, BOUNTY + 1, 0, 1 * GEN):
        with direct_vm.expect_revert("funding must equal the bounty terms exactly"):
            fund(direct_vm, deployed, direct_alice, drafted, value)
    c = deployed.get_condition(drafted)
    assert c["status"] == "DRAFT" and c["bounty_deposited"] == 0


def test_only_the_creator_funds(direct_vm, deployed, direct_bob, direct_charlie, drafted):
    for other in (direct_bob, direct_charlie):
        with direct_vm.expect_revert("only the creator may do this"):
            fund(direct_vm, deployed, other, drafted, BOUNTY)


def test_double_funding_is_refused(direct_vm, deployed, direct_alice, funded):
    with direct_vm.expect_revert("illegal transition from FUNDED"):
        fund(direct_vm, deployed, direct_alice, funded, BOUNTY)
    assert deployed.get_condition(funded)["bounty_deposited"] == BOUNTY


def test_arm_requires_funding(direct_vm, deployed, direct_alice, drafted):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("illegal transition from DRAFT"):
        deployed.arm_condition(drafted)


def test_cancel_a_draft(direct_vm, deployed, direct_alice, drafted, transfers):
    direct_vm.sender = direct_alice
    deployed.cancel_condition(drafted)
    c = deployed.get_condition(drafted)
    assert c["status"] == "CANCELLED" and c["terminal"] is True
    assert transfers == []


def test_cancel_a_funded_condition_refunds_the_creator_exactly(
    direct_vm, deployed, direct_alice, funded, transfers
):
    direct_vm.sender = direct_alice
    deployed.cancel_condition(funded)
    c = deployed.get_condition(funded)
    assert c["status"] == "CANCELLED"
    assert c["bounty_deposited"] == 0 and c["settled_amount"] == BOUNTY
    assert transfers == [(hex_of(direct_alice).lower(), BOUNTY)]
    assert deployed.get_protocol_info()["total_locked"] == 0


def test_only_the_creator_cancels(direct_vm, deployed, direct_bob, direct_charlie, funded, transfers):
    for other in (direct_bob, direct_charlie):
        direct_vm.sender = other
        with direct_vm.expect_revert("only the creator may do this"):
            deployed.cancel_condition(funded)
    assert transfers == [] and deployed.get_condition(funded)["bounty_deposited"] == BOUNTY


def test_armed_bounty_cannot_be_withdrawn(direct_vm, deployed, direct_alice, armed, transfers):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("illegal transition from ARMED"):
        deployed.cancel_condition(armed)
    with direct_vm.expect_revert("illegal transition from ARMED"):
        fund(direct_vm, deployed, direct_alice, armed, BOUNTY)
    assert transfers == [] and deployed.get_condition(armed)["bounty_deposited"] == BOUNTY


def test_bounties_are_isolated_per_condition(direct_vm, deployed, direct_alice, direct_bob,
                                              direct_charlie, funded, transfers):
    """Cancelling one commitment can only return that commitment's deposit."""
    from .conftest import create
    other = create(deployed, direct_vm, direct_charlie, direct_bob, bounty=7 * GEN)
    fund(direct_vm, deployed, direct_charlie, other, 7 * GEN)
    assert deployed.get_protocol_info()["total_locked"] == BOUNTY + 7 * GEN
    direct_vm.sender = direct_charlie
    deployed.cancel_condition(other)
    assert transfers == [(hex_of(direct_charlie).lower(), 7 * GEN)]
    assert deployed.get_condition(funded)["bounty_deposited"] == BOUNTY
    assert deployed.get_protocol_info()["total_locked"] == BOUNTY
