"""Lifecycle transitions and timing: ARM, observation eligibility, finality,
expiry and terminal states."""
from .conftest import (BOUNTY, CONFIRMED_BOTH, DEADLINE, FINALITY_DELAY, HOUR, OBSERVATION_GRACE,
                       OBSERVATION_START, T0, fact, findings, observe, warp_to)

NOT_FOUND = findings(
    fact("released_version", "NOT_FOUND", "", [], [], ""),
    fact("public_release", "NOT_FOUND", "", [], [], ""),
)


def test_arm_freezes_the_commitment(direct_vm, deployed, direct_alice, funded):
    warp_to(direct_vm, T0 + 60)
    direct_vm.sender = direct_alice
    deployed.arm_condition(funded)
    c = deployed.get_condition(funded)
    assert c["status"] == "ARMED" and c["armed_at"] == T0 + 60 and c["locked"] is True


def test_only_the_creator_arms(direct_vm, deployed, direct_bob, direct_charlie, funded):
    for other in (direct_bob, direct_charlie):
        direct_vm.sender = other
        with direct_vm.expect_revert("only the creator may do this"):
            deployed.arm_condition(funded)


def test_arm_must_precede_the_observation_window(direct_vm, deployed, direct_alice, funded):
    for at in (OBSERVATION_START, OBSERVATION_START + 1):
        warp_to(direct_vm, at)
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("must be armed before its observation window opens"):
            deployed.arm_condition(funded)
    assert deployed.get_condition(funded)["status"] == "FUNDED"


def test_arm_twice_is_refused(direct_vm, deployed, direct_alice, armed):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("illegal transition from ARMED"):
        deployed.arm_condition(armed)


def test_observation_requires_an_armed_condition(direct_vm, deployed, direct_charlie, drafted,
                                                   direct_alice):
    warp_to(direct_vm, OBSERVATION_START + HOUR)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("illegal transition from DRAFT"):
        deployed.observe_condition(drafted)


def test_observation_cannot_start_before_the_window(direct_vm, deployed, direct_charlie, armed):
    warp_to(direct_vm, OBSERVATION_START - 1)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("observation window opens at"):
        deployed.observe_condition(armed)
    assert deployed.get_condition(armed)["observation_count"] == 0


def test_early_negative_observation_is_not_conclusive(direct_vm, deployed, direct_charlie, armed):
    c = observe(direct_vm, deployed, direct_charlie, armed, OBSERVATION_START, NOT_FOUND)
    assert c["status"] == "OBSERVING"
    assert c["result_verdict"] == "" and c["observation_count"] == 1
    record = deployed.get_observation(armed)[0]
    assert record["verdict"] == "NOT_SATISFIED" and record["conclusive"] is False
    assert record["phase"] == "WITHIN_WINDOW"


def test_early_observations_are_capped(direct_vm, deployed, direct_charlie, armed):
    for i in range(4):
        observe(direct_vm, deployed, direct_charlie, armed, OBSERVATION_START + i * HOUR, NOT_FOUND)
    warp_to(direct_vm, OBSERVATION_START + 5 * HOUR)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("the 4 observations allowed before the deadline are used"):
        deployed.observe_condition(armed)
    # after the deadline, observation is allowed again — and it is conclusive
    c = observe(direct_vm, deployed, direct_charlie, armed, DEADLINE + 1, NOT_FOUND)
    assert c["status"] == "ACCEPTED" and c["result_verdict"] == "NOT_SATISFIED"
    assert c["observation_count"] == 5


def test_deadline_second_is_still_within_the_window(direct_vm, deployed, direct_charlie, armed):
    c = observe(direct_vm, deployed, direct_charlie, armed, DEADLINE, NOT_FOUND)
    assert c["status"] == "OBSERVING"
    assert deployed.get_observation(armed)[0]["phase"] == "WITHIN_WINDOW"


def test_resolved_conditions_are_not_observed_again(direct_vm, deployed, direct_charlie,
                                                     accepted_satisfied):
    warp_to(direct_vm, OBSERVATION_START + 2 * HOUR)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("illegal transition from ACCEPTED"):
        deployed.observe_condition(accepted_satisfied)


def test_finality_waits_the_delay(direct_vm, deployed, direct_charlie, accepted_satisfied):
    c = deployed.get_condition(accepted_satisfied)
    assert c["finalizable_at"] == c["accepted_at"] + FINALITY_DELAY
    for at in (c["accepted_at"], c["accepted_at"] + FINALITY_DELAY - 1):
        warp_to(direct_vm, at)
        direct_vm.sender = direct_charlie
        with direct_vm.expect_revert("result can be finalized from"):
            deployed.finalize_condition(accepted_satisfied)
        with direct_vm.expect_revert("illegal transition from ACCEPTED"):
            deployed.settle_condition(accepted_satisfied)
    warp_to(direct_vm, c["accepted_at"] + FINALITY_DELAY)
    deployed.finalize_condition(accepted_satisfied)
    after = deployed.get_condition(accepted_satisfied)
    assert after["status"] == "FINALIZED" and after["finalized_at"] == c["accepted_at"] + FINALITY_DELAY


def test_finalize_twice_is_refused(direct_vm, deployed, direct_charlie, accepted_satisfied):
    c = deployed.get_condition(accepted_satisfied)
    warp_to(direct_vm, c["finalizable_at"])
    direct_vm.sender = direct_charlie
    deployed.finalize_condition(accepted_satisfied)
    with direct_vm.expect_revert("illegal transition from FINALIZED"):
        deployed.finalize_condition(accepted_satisfied)


def test_finalize_refused_on_unarmed_conditions(direct_vm, deployed, direct_charlie, funded):
    warp_to(direct_vm, DEADLINE + OBSERVATION_GRACE + 1)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("illegal transition from FUNDED"):
        deployed.finalize_condition(funded)


def test_never_observed_condition_expires_as_undetermined(direct_vm, deployed, direct_charlie,
                                                          armed):
    closes = DEADLINE + OBSERVATION_GRACE
    warp_to(direct_vm, closes)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("the observation period runs until"):
        deployed.finalize_condition(armed)

    warp_to(direct_vm, closes + 1)
    with direct_vm.expect_revert("observation period ended at"):
        deployed.observe_condition(armed)
    deployed.finalize_condition(armed)
    r = deployed.get_final_result(armed)
    assert r["final"] is True and r["verdict"] == "UNDETERMINED"
    assert r["reason_code"] == "NOT_OBSERVED" and r["observation_index"] == 0


def test_inconclusive_observing_condition_expires_too(direct_vm, deployed, direct_charlie, armed):
    observe(direct_vm, deployed, direct_charlie, armed, OBSERVATION_START, NOT_FOUND)
    warp_to(direct_vm, DEADLINE + OBSERVATION_GRACE + 1)
    direct_vm.sender = direct_charlie
    deployed.finalize_condition(armed)
    assert deployed.get_final_result(armed)["reason_code"] == "NOT_OBSERVED"


def test_post_deadline_observation_within_grace(direct_vm, deployed, direct_charlie, armed):
    c = observe(direct_vm, deployed, direct_charlie, armed, DEADLINE + OBSERVATION_GRACE,
                CONFIRMED_BOTH)
    assert c["status"] == "ACCEPTED"
    record = deployed.get_observation(armed)[0]
    assert record["phase"] == "AFTER_DEADLINE"
    # event time 2026-09-15T10:00Z is before the deadline 2026-09-16T00:00Z
    assert record["verdict"] == "SATISFIED" and record["temporal_result"] == "BEFORE_DEADLINE"
    assert c["bounty_deposited"] == BOUNTY
