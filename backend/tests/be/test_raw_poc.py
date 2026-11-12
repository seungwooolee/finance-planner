"""Meaningful persistence and concurrency checks; no financial model tests."""

import json
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from app.be.raw_store import FIELD_STATES, WIRE_VERSION, PocError, RawAnswerStore


def income_answer(amount="00300.0000"):
    return {
        "wire_version": WIRE_VERSION,
        "question_ref": {
            "namespace": "DION-DESIGN",
            "design_id": "F03",
            "definition_version": "1.2",
            "definition_ref": "fixture:question-v1.2:F03",
            "definition_text": "월평균 세후소득은 얼마인가요?",
            "option_labels": {},
        },
        "subject_refs": {"person_ref": "person_self"},
        "context": {
            "scope_ref": "scope_personal",
            "as_of": "2026-11-10",
            "period_start": "2026-10-01",
            "period_end": "2026-10-31",
            "source_ref": "fixture:customer-input",
            "basis": "USER_REPORTED",
        },
        "fields": {
            "monthly_net_income": {"state": "KNOWN", "raw_value": amount, "unit": "KRW_10000"},
            "includes_one_off": {
                "state": "UNKNOWN",
                "raw_value": {"code": "unknown", "label": "잘 모르겠음"},
                "unit": "CHOICE",
            },
        },
    }


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "raw.sqlite3"
        self.store = RawAnswerStore(self.path)
        self.store.create_case("actor_A", "case_A")

    def tearDown(self):
        self.temp.cleanup()

    def save(self, envelope=None, version=0, key="save_1", actor="actor_A", case="case_A"):
        return self.store.save_answer(actor, case, version, key, envelope or income_answer())

    def expect_error(self, code, callback):
        with self.assertRaises(PocError) as caught:
            callback()
        self.assertEqual(caught.exception.code, code)

    def test_raw_payload_and_units_roundtrip(self):
        original = income_answer()
        self.save(original)
        original["fields"]["monthly_net_income"]["raw_value"] = "999"
        loaded = self.store.restore("actor_A", "case_A")["answers"][0]["envelope"]
        self.assertEqual(loaded, income_answer())

    def test_restores_after_a_separate_process_restart(self):
        self.save()
        child = "from app.be.raw_store import RawAnswerStore; import sys,json; print(json.dumps(RawAnswerStore(sys.argv[1]).restore('actor_A','case_A'),ensure_ascii=False))"
        result = subprocess.run(
            [sys.executable, "-c", child, str(self.path)],
            cwd=Path(__file__).resolve().parents[2],
            capture_output=True,
            text=True,
            check=True,
        )
        loaded = json.loads(result.stdout)
        self.assertEqual(loaded["answers"][0]["envelope"], income_answer())

    def test_all_value_states_are_distinct(self):
        e = income_answer()
        e["fields"] = {s: {"state": s, "raw_value": "0" if s == "KNOWN" else None, "unit": "RAW"} for s in FIELD_STATES}
        self.save(e)
        actual = self.store.restore("actor_A", "case_A")["answers"][0]["envelope"]["fields"]
        self.assertEqual(actual, e["fields"])

    def test_partial_card_keeps_known_and_unknown_fields(self):
        self.save()
        fields = self.store.restore("actor_A", "case_A")["answers"][0]["envelope"]["fields"]
        self.assertEqual(fields["monthly_net_income"]["state"], "KNOWN")
        self.assertEqual(fields["includes_one_off"]["state"], "UNKNOWN")
        self.assertEqual(fields["includes_one_off"]["raw_value"]["label"], "잘 모르겠음")

    def test_edit_appends_revision_and_keeps_original(self):
        first = self.save()
        second = self.save(income_answer("320"), version=1, key="save_2")
        history = self.store.history("actor_A", "case_A")
        self.assertEqual(len(history), 2)
        self.assertEqual(history[1]["prior_revision_id"], first["answer_revision_id"])
        self.assertEqual(history[0]["envelope"], income_answer())
        self.assertEqual(
            self.store.restore("actor_A", "case_A")["answers"][0]["answer_revision_id"], second["answer_revision_id"]
        )

    def test_retry_returns_original_receipt_after_later_edit(self):
        first = self.save()
        second = self.save(income_answer("320"), 1, "save_2")
        self.assertEqual(self.save(), first)
        self.assertEqual(len(self.store.history("actor_A", "case_A")), 2)
        self.assertEqual(
            self.store.restore("actor_A", "case_A")["answers"][0]["answer_revision_id"], second["answer_revision_id"]
        )

    def test_reused_request_key_with_different_payload_conflicts(self):
        self.save()
        self.expect_error("IDEMPOTENCY_CONFLICT", lambda: self.save(income_answer("320")))
        self.assertEqual(len(self.store.history("actor_A", "case_A")), 1)

    def test_stale_window_cannot_overwrite_latest(self):
        self.save()
        self.expect_error("VERSION_CONFLICT", lambda: self.save(income_answer("320"), 0, "other_window"))
        self.assertEqual(self.store.restore("actor_A", "case_A")["input_version"], 1)

    def test_future_and_boolean_versions_are_rejected(self):
        self.expect_error("VERSION_CONFLICT", lambda: self.save(version=5))
        self.expect_error("INVALID_ENVELOPE", lambda: self.save(version=True))
        self.assertEqual(self.store.history("actor_A", "case_A"), [])

    def test_another_actor_cannot_read_write_or_access_receipt(self):
        self.save()
        for fn in [
            lambda: self.store.restore("actor_B", "case_A"),
            lambda: self.store.history("actor_B", "case_A"),
            lambda: self.save(actor="actor_B"),
        ]:
            self.expect_error("NO_ACCESS", fn)

    def test_cases_do_not_share_raw_answers(self):
        self.store.create_case("actor_B", "case_B")
        self.save()
        self.save(income_answer("500"), actor="actor_B", case="case_B")
        a = self.store.restore("actor_A", "case_A")["answers"][0]["envelope"]
        b = self.store.restore("actor_B", "case_B")["answers"][0]["envelope"]
        self.assertNotEqual(a, b)

    def test_repeated_people_have_separate_heads(self):
        self.save()
        partner = income_answer("250")
        partner["subject_refs"]["person_ref"] = "person_partner"
        self.save(partner, 1, "partner")
        self.assertEqual(len(self.store.restore("actor_A", "case_A")["answers"]), 2)

    def test_new_definition_version_is_not_auto_migrated(self):
        self.save()
        newer = income_answer("300")
        newer["question_ref"]["definition_version"] = "1.3"
        self.save(newer, 1, "definition_1_3")
        versions = {
            x["envelope"]["question_ref"]["definition_version"]
            for x in self.store.restore("actor_A", "case_A")["answers"]
        }
        self.assertEqual(versions, {"1.2", "1.3"})

    def test_changed_definition_under_same_version_conflicts(self):
        self.save()
        changed = income_answer()
        changed["question_ref"]["definition_text"] = "바뀐 질문 문구"
        self.expect_error("DEFINITION_VERSION_CONFLICT", lambda: self.save(changed, 1, "bad_definition"))
        self.assertEqual(len(self.store.history("actor_A", "case_A")), 1)

    def test_namespace_is_not_a_legacy_id_mapping(self):
        self.save()
        legacy = income_answer("300")
        legacy["question_ref"]["namespace"] = "LEGACY-QID"
        self.save(legacy, 1, "legacy")
        self.assertEqual(len(self.store.restore("actor_A", "case_A")["answers"]), 2)

    def test_period_and_scope_changes_are_distinct_raw_groups(self):
        self.save()
        new_period = income_answer("310")
        new_period["context"].update(period_start="2026-11-01", period_end="2026-11-30")
        self.save(new_period, 1, "new_period")
        new_scope = income_answer("600")
        new_scope["context"]["scope_ref"] = "scope_household"
        self.save(new_scope, 2, "new_scope")
        self.assertEqual(len(self.store.restore("actor_A", "case_A")["answers"]), 3)

    def test_raw_snapshot_remains_original_after_edit_and_restart(self):
        self.save()
        frozen = self.store.freeze_raw_answers("actor_A", "case_A", 1, "freeze")
        self.save(income_answer("320"), 1, "save_2")
        restored = RawAnswerStore(self.path).read_raw_snapshot("actor_A", "case_A", frozen["raw_snapshot_id"])
        self.assertFalse(restored["is_current"])
        self.assertEqual(restored["answers"][0]["envelope"], income_answer())
        self.assertEqual(restored["kind"], "RAW_ANSWERS_ONLY")

    def test_snapshot_request_is_idempotent(self):
        self.save()
        first = self.store.freeze_raw_answers("actor_A", "case_A", 1, "freeze")
        self.assertEqual(first, self.store.freeze_raw_answers("actor_A", "case_A", 1, "freeze"))

    def test_snapshot_access_is_case_and_actor_scoped(self):
        self.save()
        frozen = self.store.freeze_raw_answers("actor_A", "case_A", 1, "freeze")
        self.expect_error(
            "NO_ACCESS", lambda: self.store.read_raw_snapshot("actor_B", "case_A", frozen["raw_snapshot_id"])
        )
        self.store.create_case("actor_A", "case_other")
        self.expect_error(
            "SNAPSHOT_NOT_FOUND",
            lambda: self.store.read_raw_snapshot("actor_A", "case_other", frozen["raw_snapshot_id"]),
        )

    def test_failure_after_insert_rolls_back_revision_head_and_version(self):
        actual_append = self.store._append_revision

        def failing(conn, values):
            actual_append(conn, values)
            raise sqlite3.OperationalError("injected disk failure")

        with patch.object(self.store, "_append_revision", side_effect=failing):
            self.expect_error("STORAGE_FAILURE", self.save)
        self.assertEqual(
            self.store.restore("actor_A", "case_A"), {"case_id": "case_A", "input_version": 0, "answers": []}
        )
        self.assertEqual(self.store.history("actor_A", "case_A"), [])
        self.assertEqual(self.save()["input_version"], 1)

    def test_two_concurrent_writers_only_one_can_commit(self):
        barrier = threading.Barrier(2)

        def writer(index):
            barrier.wait(timeout=5)
            try:
                self.save(income_answer(str(300 + index)), 0, "writer_" + str(index))
                return "SAVED"
            except PocError as exc:
                return exc.code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(writer, [1, 2]))
        self.assertCountEqual(results, ["SAVED", "VERSION_CONFLICT"])
        self.assertEqual(len(self.store.history("actor_A", "case_A")), 1)

    def test_decimal_numbers_must_arrive_as_strings(self):
        for value in [300.25, float("nan"), float("inf")]:
            e = income_answer()
            e["fields"]["monthly_net_income"]["raw_value"] = value
            self.expect_error("FLOAT_NOT_ALLOWED", lambda: self.save(e))
        e = income_answer("9999999999999999999999999999999999999999.0000")
        self.save(e)
        self.assertEqual(self.store.restore("actor_A", "case_A")["answers"][0]["envelope"], e)

    def test_invalid_envelopes_are_not_saved(self):
        candidates = []
        e = income_answer()
        e["fields"]["monthly_net_income"]["raw_value"] = None
        candidates.append(e)
        e = income_answer()
        e["fields"]["monthly_net_income"]["state"] = []
        candidates.append(e)
        e = income_answer()
        e["context"]["period_end"] = "2026-02-30"
        candidates.append(e)
        for value in candidates:
            self.expect_error("INVALID_ENVELOPE", lambda: self.save(value))
        self.assertEqual(self.store.history("actor_A", "case_A"), [])

    def test_money_integer_token_must_also_be_original_text(self):
        e = income_answer()
        e["fields"]["monthly_net_income"]["raw_value"] = 300
        self.expect_error("DECIMAL_TEXT_REQUIRED", lambda: self.save(e))
        self.assertEqual(self.store.history("actor_A", "case_A"), [])

    def test_noop_save_does_not_create_a_revision(self):
        first = self.save()
        second = self.save(income_answer(), 1, "save_no_changes")
        self.assertFalse(second["created"])
        self.assertEqual(first["answer_revision_id"], second["answer_revision_id"])
        self.assertEqual(second["input_version"], 1)

    def test_omitted_fields_do_not_silently_remove_saved_answers(self):
        self.save()
        changed = income_answer("320")
        del changed["fields"]["includes_one_off"]
        self.expect_error("PARTIAL_CARD_UNSUPPORTED", lambda: self.save(changed, 1, "partial_card"))
        self.assertEqual(self.store.restore("actor_A", "case_A")["answers"][0]["envelope"], income_answer())

    def test_explicit_clear_is_a_new_revision_not_a_missing_field(self):
        self.save()
        changed = income_answer()
        changed["fields"]["monthly_net_income"] = {"state": "NOT_ENTERED", "raw_value": None, "unit": "KRW_10000"}
        self.save(changed, 1, "clear_amount")
        self.assertEqual(self.store.restore("actor_A", "case_A")["answers"][0]["envelope"], changed)
        self.assertEqual(self.store.history("actor_A", "case_A")[0]["envelope"], income_answer())

    def test_empty_case_does_not_fill_unanswered_questions_with_zero(self):
        self.assertEqual(self.store.restore("actor_A", "case_A")["answers"], [])

    def test_database_blocks_accidental_revision_mutation(self):
        saved = self.save()
        from contextlib import closing

        with closing(sqlite3.connect(self.path)) as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "UPDATE answer_revisions SET envelope_json='{}' WHERE revision_id=?", (saved["answer_revision_id"],)
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
