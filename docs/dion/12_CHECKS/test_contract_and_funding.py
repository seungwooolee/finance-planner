"""Independent source preservation and FIN-MAP fixed-answer regression checks."""
from __future__ import annotations

import copy
import importlib.util
import json
import re
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("funding_ledger", ROOT / "09_UPDATED_FILES/tools/funding_ledger.py")
funding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(funding)


def load_fixture(name):
    data = json.loads((ROOT / "12_CHECKS/funding_fixtures.json").read_text())
    return copy.deepcopy(data[name])


class ContractAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit = json.loads((ROOT / "09_UPDATED_FILES/DION_Question_Contract_Audit.json").read_text())
        cls.source = json.loads((ROOT / "09_UPDATED_FILES/reference/DION_Question_Source_v1_1.json").read_text())
        cls.rows = {row["design_id"]: row for row in cls.audit["questions"]}

    def test_all_current_rows_and_304_option_rows_exact(self):
        rows = self.source["sheets"]["질문 수정안"]
        self.assertEqual([r["source_question"] for r in self.audit["questions"]], [dict(zip(rows[0], row)) for row in rows[1:]])
        self.assertEqual(self.audit["source_options"], self.source["sheets"]["선택지 목록"][1:])
        self.assertEqual(len(self.rows), 40)
        self.assertEqual(len(self.audit["source_options"]), 304)

    def test_37_to_40_additions_no_deletion(self):
        self.assertEqual({k for k, row in self.rows.items() if row["delta_from_37"]["kind"] == "ADDED"}, {"NEW-10", "NEW-11", "NEW-12"})
        self.assertEqual(sum(row["delta_from_37"]["old_xlsx_row"] is not None for row in self.rows.values()), 37)

    def test_60_qids_preserved_and_all_links_exist(self):
        inventory = {row["qid"] for row in self.audit["legacy_inventory"]}
        self.assertEqual(len(inventory), 60)
        links = {link["qid"] for row in self.rows.values() for link in row["legacy_links"]}
        self.assertTrue(links <= inventory)
        self.assertEqual(len(links), 47)
        self.assertTrue(all(row["disposition"] == "PRESERVE_NO_DELETE_OR_RENUMBER" for row in self.audit["legacy_inventory"]))

    def test_no_migration_or_unseen_production_binding(self):
        self.assertFalse(self.audit["automatic_migration_enabled"])
        for row in self.rows.values():
            self.assertIsNone(row["actual_binding"]["api_field"])
            self.assertIsNone(row["actual_binding"]["db_field"])
            self.assertFalse(row["response_migration"]["allowed"])
            self.assertTrue(all(not link["auto_migrate"] for link in row["legacy_links"]))
        self.assertFalse(self.rows["NEW-10"]["legacy_links"])
        self.assertFalse(self.rows["NEW-11"]["legacy_links"])
        self.assertFalse(self.rows["NEW-12"]["legacy_links"])

    def test_quick_eleven_and_deep_direct_entry_from_flow(self):
        flow = self.source["sheets"]["상담 흐름 설계"][1:]
        basics = [row for row in flow if re.fullmatch(r"FAST-\d{2}", row[2])]
        self.assertEqual(len(basics), 11)
        self.assertEqual(len([row for row in flow if row[2] in {"EXTRA-01", "EXTRA-03"}]), 2)
        self.assertIn("정밀진단에 빠른진단 완료 요구 금지", flow[0][7])
        self.assertEqual({row["화면 ID(설계용)"] for row in self.rows["F06"]["input_screens"]}, {"FAST-05", "DET-06"})

    def test_changed_field_enum_and_conditional_guards(self):
        self.assertIn("employment_type_raw", self.rows["D01"]["source_question"]["저장 필드(제안)"])
        self.assertIn("fx_preference_raw_v2", self.rows["D18"]["source_question"]["저장 필드(제안)"])
        self.assertIn("연 금리", self.rows["F09+F10+D08"]["source_question"]["고객에게 보여줄 질문"])
        rules = self.audit["runtime_conditions"]
        self.assertEqual(rules["D01.employment_type_raw"]["show_if_occupation_in"], ["OCC_EMPLOYEE", "OCC_PUBLIC"])
        self.assertIn("OWNS_REAL_ESTATE_03", rules["F08/N03"]["show_for"])
        self.assertIn("PRESENCE_03", rules["F09+F10+D08"]["show_for"])
        self.assertEqual(len(self.audit["policy_states"]), 8)
        self.assertTrue(any(row["id"] == "SCOPE-01" for row in self.audit["open_conflicts"]))

    def test_five_plus_five_result_views_only(self):
        views = {v for row in self.rows.values() for v in row["related_result_views_proposed"]}
        self.assertEqual(views, {f"FE-{mode}{i}" for mode in "QD" for i in range(1, 6)})

    def test_inspected_legacy_fields_never_become_current_adapters_or_db(self):
        evidence = json.loads((ROOT / "09_UPDATED_FILES/DION_Repository_Field_Evidence.json").read_text())
        fields = {row["path"] for row in evidence["request_contract"]["required_leaf_fields"]}
        self.assertEqual(len(fields), 11)
        self.assertEqual(self.audit["counts"]["current_questions_with_partial_legacy_api_references"], 9)
        self.assertEqual(evidence["engine_contract"]["git_blob_sha"], "8466d79e48639b9de9e2090be17b131251c0136c")
        for row in self.rows.values():
            binding = row["actual_binding"]
            self.assertEqual(binding["repository_commit"], evidence["source_commit"])
            self.assertTrue(set(binding["legacy_api_fields"]) <= fields)
            self.assertFalse(binding["new40_api_adapter_implemented"])
            self.assertEqual(binding["db_binding_status"], "NOT_IMPLEMENTED_IN_PINNED_SOURCE")
        self.assertFalse(self.rows["NEW-10"]["actual_binding"]["legacy_api_fields"])
        self.assertFalse(self.rows["NEW-11"]["actual_binding"]["legacy_api_fields"])
        self.assertFalse(self.rows["NEW-12"]["actual_binding"]["legacy_api_fields"])

    def test_reference_source_and_studio_bytes_preserved(self):
        archive = ROOT.parents[1] / "project_sources/01-DION_Account_Handoff_20261109.zip"
        if not archive.exists():
            self.skipTest("original attachment not present; source fingerprints can still be checked")
        rename_file = ROOT.parents[1] / "PATH_RENAMES.json"
        rename_rows = json.loads(rename_file.read_text())["renames"] if rename_file.exists() else []
        renames = {row["old_path"]: row["new_path"] for row in rename_rows}
        with zipfile.ZipFile(archive) as z:
            for n in z.namelist():
                rel = Path(n).relative_to("DION_Account_Handoff_20261109")
                if str(rel).startswith(("07_REFERENCE_SNAPSHOTS/", "08_ORIGINAL_INPUTS/", "10_UI_PROTOTYPES/", "11_BRAND_ASSETS/")) or str(rel) in {"09_UPDATED_FILES/DION_Current_Question_Source.json", "09_UPDATED_FILES/LifePath_Question_Table_Starter.csv", "09_UPDATED_FILES/AGENTS.md"} or (str(rel).startswith("09_UPDATED_FILES/") and rel.suffix == ".html"):
                    local_path = ROOT.parents[1] / renames.get("docs/dion/" + rel.as_posix(), "docs/dion/" + rel.as_posix())
                    self.assertEqual(local_path.read_bytes(), z.read(n), str(rel))


class FundingTests(unittest.TestCase):
    def test_fast_demo02_fixed_answer(self):
        result = funding.validate(load_fixture("FAST-DEMO-02"))
        self.assertEqual(result["monthly"]["monthly_budget_cap_krw"], "300000")
        self.assertEqual(result["monthly"]["allocation_difference_krw"], "0")
        self.assertEqual(result["stock"]["rows"][0]["investment_budget_cap_krw"], "4000000")
        self.assertEqual(result["monthly"]["state"], "RECONCILED")

    def test_ui_inv01_cap110_is_conditional_not_error_or_recommendation(self):
        result = funding.validate(load_fixture("UI-INV-01"))
        self.assertEqual(result["monthly"]["monthly_budget_cap_krw"], "1100000")
        self.assertEqual(result["monthly"]["allocation_difference_krw"], "0")
        self.assertTrue(result["monthly"]["conditional_excludes_unconfirmed_goals"])
        self.assertEqual(result["monthly"]["state"], "NEEDS_INPUT")
        self.assertFalse(result["recommendation"])

    def test_mixed_examples_exceed_income_by60(self):
        doc = load_fixture("UI-INV-01")
        doc["monthly"]["kept"] = [{"contribution_id": "old-invest", "amount_krw": "400000", "purpose": "INVESTMENT"}]
        doc["monthly"]["targets"] = [{"target_id": "housing", "purpose": "GOAL", "total_contribution_krw": "200000", "kept_contribution_ids": [], "budget_basis": "PLAN_SELECTED"}]
        result = funding.validate(doc)["monthly"]
        self.assertEqual(result["allocation_difference_krw"], "-600000")
        self.assertEqual(result["state"], "INVALID_ALLOCATION")

    def test_mx09_existing_goal_not_deducted_twice(self):
        doc = load_fixture("UI-INV-01")
        doc["monthly"].update(goal_status="KNOWN", new_investment_krw="400000")
        doc["monthly"]["kept"] = [{"contribution_id": "g-old", "target_id": "g", "purpose": "GOAL", "schedule_ref": "monthly-1", "amount_krw": "200000"}]
        doc["monthly"]["targets"] = [{"target_id": "g", "purpose": "GOAL", "schedule_ref": "monthly-1", "total_contribution_krw": "700000", "kept_contribution_ids": ["g-old"], "budget_basis": "PLAN_SELECTED"}]
        result = funding.validate(doc)["monthly"]
        self.assertEqual(result["additional_targets"][0]["additional_krw"], "500000")
        self.assertEqual(result["monthly_budget_cap_krw"], "400000")
        self.assertEqual(result["allocation_difference_krw"], "0")
        doc["monthly"]["targets"][0]["kept_contribution_ids"] = []
        self.assertEqual(funding.validate(doc)["monthly"]["state"], "INVALID_INPUT")

    def test_source_overallocation_not_clamped_away(self):
        doc = load_fixture("UI-INV-01")
        doc["stock"]["allocations"][1]["amount_krw"] = "6600000"
        row = funding.validate(doc)["stock"]
        self.assertEqual(row["state"], "INVALID_ALLOCATION")
        self.assertEqual(row["rows"][0]["unassigned_krw"], "-1000000")

    def test_same_money_cannot_be_reserved_again_after_future_use(self):
        doc = load_fixture("UI-INV-01")
        doc["stock"]["allocations"].append({"allocation_id": "later-goal", "source_id": "cash", "purpose": "GOAL", "use_on": "2027-11-30", "amount_krw": "4000001"})
        self.assertEqual(funding.validate(doc)["stock"]["state"], "INVALID_ALLOCATION")

    def test_unconfirmed_sale_and_late_availability_never_pass(self):
        doc = load_fixture("UI-INV-01")
        doc["stock"]["sources"][0].update(kind="REAL_ESTATE", realization_confirmed=False, available_on="2026-12-01")
        result = funding.validate(doc)["stock"]
        self.assertEqual(result["state"], "NEEDS_INPUT")
        self.assertIn("SOURCE_NOT_AVAILABLE_BY_USE", [i["code"] for i in result["issues"]])
        self.assertIn("REALIZATION_UNCONFIRMED", [i["code"] for i in result["issues"]])

    def test_mx26_middle_of_month_cash_shortfall(self):
        result = funding.validate(load_fixture("MX-26"))["timing"]
        self.assertEqual(result["minimum_balance_krw"], "-300000")
        self.assertEqual(result["state"], "INFEASIBLE")

    def test_same_day_order_unknown_does_not_assume_income_first(self):
        doc = load_fixture("MX-26")
        doc["timing"]["events"][1]["on"] = "2026-11-05"
        result = funding.validate(doc)["timing"]
        self.assertEqual(result["state"], "NEEDS_INPUT")
        self.assertIsNone(result["minimum_balance_krw"])

    def test_zero_and_unknown_affect_only_dependent_scope(self):
        doc = load_fixture("UI-INV-01")
        doc["monthly"].update(debt_payment_krw=None)
        result = funding.validate(doc)
        self.assertEqual(result["monthly"]["state"], "NEEDS_INPUT")
        self.assertEqual(result["stock"]["state"], "RECONCILED")
        doc["monthly"].update(debt_payment_krw="0", new_investment_krw="1300000", goal_status="NONE")
        self.assertEqual(funding.validate(doc)["monthly"]["allocation_difference_krw"], "0")

    def test_unsafe_numeric_formats_rejected(self):
        for bad in [3000000, 1.0, True, "1e6", "NaN", "Infinity", "-1", "3,000", "0.1", " 0 "]:
            doc = load_fixture("UI-INV-01")
            doc["monthly"]["income_krw"] = bad
            self.assertEqual(funding.validate(doc)["monthly"]["state"], "INVALID_INPUT", repr(bad))

    def test_large_integer_precision_and_determinism(self):
        doc = load_fixture("UI-INV-01")
        doc["monthly"].update(income_krw="9007199254740993", living_krw="0", debt_payment_krw="0", h_krw="0", new_investment_krw="9007199254740993", goal_status="NONE")
        a, b = funding.validate(doc), funding.validate(copy.deepcopy(doc))
        self.assertEqual(a, b)
        self.assertEqual(a["monthly"]["monthly_budget_cap_krw"], "9007199254740993")

    def test_mx23_reduction_permission_not_reset(self):
        self.assertEqual(funding.expense_change("1800000", "1200000", "200000", "150000", "200000"), {"final_living_krw": "1600000", "additional_change_krw": "50000"})
        with self.assertRaises(funding.InvalidInput):
            funding.expense_change("1800000", "1200000", "200000", "150000", "350000")

    def test_valid_deficit_is_financial_result(self):
        doc = load_fixture("UI-INV-01")
        doc["monthly"].update(income_krw="1500000", living_krw="1600000", debt_payment_krw="200000", h_krw="0", new_investment_krw="0", goal_status="NONE")
        result = funding.validate(doc)["monthly"]
        self.assertEqual(result["monthly_unallocated_raw_krw"], "-300000")
        self.assertEqual(result["monthly_budget_cap_krw"], "0")
        self.assertEqual(result["state"], "INFEASIBLE")

    def test_same_event_replayed_once_conflict_rejected(self):
        doc = load_fixture("MX-26")
        doc["timing"]["events"].append(copy.deepcopy(doc["timing"]["events"][0]))
        self.assertEqual(funding.validate(doc)["timing"]["duplicates_ignored"], 1)
        doc["timing"]["events"][-1]["amount_krw"] = "1"
        self.assertEqual(funding.validate(doc)["timing"]["state"], "INVALID_INPUT")

    def test_duplicate_sources_cannot_inflate_budget(self):
        doc = load_fixture("UI-INV-01")
        item = copy.deepcopy(doc["stock"]["sources"][0]); item["source_id"] = "second"
        doc["stock"]["sources"].append(item)
        self.assertEqual(funding.validate(doc)["stock"]["state"], "INVALID_INPUT")

    def test_strategy_generation_policy_gate_stays_closed(self):
        for name in ["FAST-DEMO-02", "UI-INV-01", "MX-26"]:
            result = funding.validate(load_fixture(name))
            self.assertEqual(result["generation"]["state"], "NEEDS_POLICY")
            self.assertIsNone(result["generation"]["candidates"])
            self.assertFalse(result["recommendation"])
            self.assertEqual(result["adoption_state"], "NOT_IMPLEMENTED")

    def test_missing_context_version_does_not_validate(self):
        doc = load_fixture("UI-INV-01"); del doc["context"]["snapshot_id"]
        self.assertEqual(funding.validate(doc)["input_state"], "NEEDS_INPUT")

    def test_malformed_scope_is_reported_without_crashing_other_scopes(self):
        doc = load_fixture("UI-INV-01"); doc["stock"] = None
        result = funding.validate(doc)
        self.assertEqual(result["stock"]["state"], "INVALID_INPUT")
        self.assertEqual(result["timing"]["state"], "INVALID_INPUT")
        self.assertEqual(result["monthly"]["monthly_budget_cap_krw"], "1100000")

    def test_unknown_later_order_does_not_erase_known_earlier_shortfall(self):
        doc = load_fixture("MX-26")
        doc["timing"]["events"].append({"event_id": "other-out", "on": "2026-11-25", "direction": "OUT", "amount_krw": "1"})
        result = funding.validate(doc)["timing"]
        self.assertEqual(result["minimum_known_prefix_krw"], "-300000")
        self.assertIn("INTERMEDIATE_CASH_SHORTFALL", [i["code"] for i in result["issues"]])

    def test_goal_none_cannot_mask_explicit_goal_allocation(self):
        doc = load_fixture("FAST-DEMO-02"); doc["monthly"]["goal_status"] = "NONE"
        self.assertEqual(funding.validate(doc)["monthly"]["state"], "INVALID_INPUT")


if __name__ == "__main__":
    unittest.main(verbosity=2)
