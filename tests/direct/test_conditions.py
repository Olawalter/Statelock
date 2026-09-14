"""Creation, stored terms, views and invalid input."""
import json

from .conftest import (BOUNTY, CONDITION_TEXT, DAY, DEADLINE, HOUR, OBSERVATION_START, POLICY,
                       T0, create, hex_of)


def test_create_records_the_commitment(direct_vm, deployed, direct_alice, direct_bob, drafted):
    c = deployed.get_condition(drafted)
    assert drafted == "SL-000001"
    assert c["status"] == "DRAFT"
    assert c["creator"].lower() == hex_of(direct_alice).lower()
    assert c["beneficiary"].lower() == hex_of(direct_bob).lower()
    assert c["condition_text"] == CONDITION_TEXT
    assert c["observation_start"] == OBSERVATION_START and c["deadline"] == DEADLINE
    assert c["bounty_terms"] == BOUNTY and c["bounty_deposited"] == 0
    assert c["created_at"] == T0
    assert c["terms_hash"].startswith("sha256:") and c["policy_hash"].startswith("sha256:")
    assert c["consequence"] == {"SATISFIED": "BENEFICIARY", "NOT_SATISFIED": "CREATOR",
                                "UNDETERMINED": "CREATOR"}
    assert c["result_verdict"] == "" and c["locked"] is False and c["terminal"] is False


def test_views_list_and_index_by_creator(direct_vm, deployed, direct_alice, direct_bob,
                                          direct_charlie, drafted):
    create(deployed, direct_vm, direct_charlie, direct_bob, text="Second condition")
    everything = deployed.list_conditions(0, 10)
    assert everything["total"] == 2
    assert [r["condition_id"] for r in everything["rows"]] == ["SL-000001", "SL-000002"]
    mine = deployed.list_conditions_by_creator(hex_of(direct_alice), 0, 10)
    assert [r["condition_id"] for r in mine["rows"]] == ["SL-000001"]
    assert deployed.list_conditions_by_creator("0x" + "1" * 40, 0, 10)["total"] == 0
    page = deployed.list_conditions(1, 500)
    assert page["offset"] == 1 and page["count"] == 1


def test_protocol_info(direct_vm, deployed):
    info = deployed.get_protocol_info()
    assert info["version"] == "STATELOCK-1.0.0"
    assert info["outcomes"] == ["NOT_SATISFIED", "SATISFIED", "UNDETERMINED"]
    assert info["failure_behavior"] == "UNDETERMINED_REFUNDS_CREATOR"
    assert info["limits"]["finality_delay_seconds"] == 600
    assert info["total_locked"] == 0


def test_invalid_condition_text(direct_vm, deployed, direct_alice, direct_bob):
    for text, message in (("", "condition text must be 1..500"),
                          ("x" * 501, "condition text must be 1..500")):
        with direct_vm.expect_revert(message):
            create(deployed, direct_vm, direct_alice, direct_bob, text=text)


def test_invalid_time_boundary(direct_vm, deployed, direct_alice, direct_bob):
    cases = [
        (T0, T0 + DAY, "observation_start must be after the creation time"),
        (T0 - HOUR, T0 + DAY, "observation_start must be after the creation time"),
        (T0 + HOUR, T0 + HOUR, "deadline must be after observation_start"),
        (T0 + 2 * HOUR, T0 + HOUR, "deadline must be after observation_start"),
        (T0 + HOUR, T0 + 367 * DAY, "deadline is more than"),
    ]
    for start, end, message in cases:
        with direct_vm.expect_revert(message):
            create(deployed, direct_vm, direct_alice, direct_bob, start=start, deadline=end)


def test_invalid_bounty(direct_vm, deployed, direct_alice, direct_bob):
    for bounty in (0, -1):
        with direct_vm.expect_revert("bounty must be greater than zero"):
            create(deployed, direct_vm, direct_alice, direct_bob, bounty=bounty)


def test_invalid_beneficiary(direct_vm, deployed, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("beneficiary is not a valid address"):
        deployed.create_condition(CONDITION_TEXT, json.dumps(POLICY), OBSERVATION_START,
                                  DEADLINE, BOUNTY, "not-an-address")
    with direct_vm.expect_revert("beneficiary cannot be the zero address"):
        deployed.create_condition(CONDITION_TEXT, json.dumps(POLICY), OBSERVATION_START,
                                  DEADLINE, BOUNTY, "0x" + "0" * 40)


def test_unknown_condition(direct_vm, deployed):
    for view in ("get_condition", "get_policy", "get_observation", "get_final_result"):
        with direct_vm.expect_revert("unknown condition SL-999999"):
            getattr(deployed, view)("SL-999999")
