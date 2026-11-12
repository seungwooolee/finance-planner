"""Copy metadata compatibility preserves immutable definitions and full raw history."""
import json
from copy import deepcopy

import pytest

from app.be.raw_store import PocError
from app.be.store import BackendStore
from tests.be.test_raw_poc import income_answer


@pytest.mark.parametrize("qid", ["NEW-01", "F04", "F09+F10+D08", "NEW-06"])
def test_exact_archive_source_alias_preserves_registered_definition(tmp_path, qid):
    store = BackendStore(tmp_path / "aliases.sqlite")
    store.create_case("owner", "case")
    original = income_answer()
    q = original["question_ref"]
    q.update(design_id=qid, definition_version="1.2.1",
             definition_ref="DION_questions_20261110_v1.zip:docs/questions/v1.2/"
                            "DION_Adaptive_Question_Contract_v1_2.json#" + qid)
    store.save_answer("owner", "case", 0, "first", original)
    changed = deepcopy(original)
    changed["question_ref"]["definition_ref"] = q["definition_ref"].split(":", 1)[1]
    store.save_answer("owner", "case", 1, "alias", changed)
    assert [r["envelope"] for r in store.history("owner", "case")] == [original, changed]
    with store._transaction() as conn:
        assert json.loads(conn.execute("SELECT definition_json FROM question_definitions").fetchone()[0]) == q


@pytest.mark.parametrize("registered_marker", [False, True])
def test_copy_marker_is_compatible_without_rewriting_definition_or_history(tmp_path, registered_marker):
    store = BackendStore(tmp_path / "definitions.sqlite")
    store.create_case("owner", "case")
    original = income_answer()
    if registered_marker:
        original["question_ref"]["option_labels"]["ui_presentation_version"] = "DION-FE-COPY-1.1"
    first = store.save_answer("owner", "case", 0, "first", original)
    with store._transaction() as conn:
        definition_before = tuple(conn.execute("SELECT * FROM question_definitions").fetchone())
    changed = deepcopy(original)
    labels = changed["question_ref"]["option_labels"]
    if registered_marker:
        del labels["ui_presentation_version"]
    else:
        labels["ui_presentation_version"] = "DION-FE-COPY-1.1"
    changed["fields"]["monthly_net_income"]["raw_value"] = "00320.0000"
    second = store.save_answer("owner", "case", 1, "second", changed)
    assert second["input_version"] == 2
    assert store.save_answer("owner", "case", 1, "second", changed) == second
    history = store.history("owner", "case")
    assert [r["envelope"] for r in history] == [original, changed]
    assert history[1]["prior_revision_id"] == first["answer_revision_id"]
    with store._transaction() as conn:
        assert tuple(conn.execute("SELECT * FROM question_definitions").fetchone()) == definition_before
        assert json.loads(definition_before[-1]) == original["question_ref"]


@pytest.mark.parametrize("mutation", ["text", "options", "reference", "unknown_copy", "namespace"])
def test_real_contract_changes_still_conflict_atomically(tmp_path, mutation):
    store = BackendStore(tmp_path / "conflict.sqlite")
    store.create_case("owner", "case")
    original = income_answer()
    if mutation == "namespace":
        original["question_ref"]["namespace"] = "OTHER"
    store.save_answer("owner", "case", 0, "first", original)
    changed = deepcopy(original)
    q = changed["question_ref"]
    q["option_labels"]["ui_presentation_version"] = "DION-FE-COPY-1.1"
    if mutation == "text":
        q["definition_text"] += " changed"
    elif mutation == "options":
        q["option_labels"]["new-option"] = "changed"
    elif mutation == "reference":
        q["definition_ref"] += "changed"
    elif mutation == "unknown_copy":
        q["option_labels"]["ui_presentation_version"] = "UNREVIEWED-COPY"
    with pytest.raises(PocError, match="DEFINITION_VERSION_CONFLICT"):
        store.save_answer("owner", "case", 1, "bad", changed)
    assert store.restore("owner", "case")["input_version"] == 1
    assert len(store.history("owner", "case")) == 1
