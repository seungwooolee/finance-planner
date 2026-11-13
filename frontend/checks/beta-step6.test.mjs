// node --experimental-strip-types --test checks/beta-step6.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { monthlyChecklist, productEmptyCause, readChecked, writeChecked } from "../src/lib/dion/beta-step6.ts";

test("checklist uses plan row and product allocations only when positive", () => {
  const result = { results: {
    "OUT-05": { calc_state: "CALCULATED", candidates: [{ strategy_id: "STABILITY_FIRST", rows: [{ period: "2026-11", protection_topup_krw: "100000", operating_refill_krw: "0", goal_deposits_krw: "200000", new_investment_krw: "300000" }] }] },
    "OUT-06": { products: [{ code: "A", name: "상품A" }], candidates: [{ strategy_id: "STABILITY_FIRST", rows: [{ period: "2026-11", allocations: [{ code: "A", review_allocated_krw: "150000" }, { code: "B", review_allocated_krw: "0" }] }] }] },
  } };
  const c = monthlyChecklist(result, "STABILITY_FIRST");
  assert.equal(c.period, "2026-11");
  assert.deepEqual(c.items.map(i => i.id), ["plan:protection_topup_krw", "plan:goal_deposits_krw", "plan:new_investment_krw", "product:A"]);
  assert.deepEqual(monthlyChecklist({ results: { "OUT-05": { calc_state: "NEEDS_INPUT" } } }, "STABILITY_FIRST").items, []);
});

test("empty product cause: investment question and evaluation date", () => {
  const base = { review_version: "x", catalog: { eligible_for_review_count: 0 }, product_policy: { reviewed_on: "2026-11-13" } };
  assert.deepEqual(productEmptyCause({ ...base, missing_question_ids: ["F15"] }, "2026-10-31"), { investment: true, date: { evaluationOn: "2026-10-31", policyFrom: "2026-11-13" } });
  assert.deepEqual(productEmptyCause({ ...base, missing_question_ids: ["F15"] }, "2026-11-13"), { investment: true, date: null });
  assert.deepEqual(productEmptyCause(base, "2026-10-31")?.investment, false);
  assert.equal(productEmptyCause(base, "2026-11-13"), null);
  assert.equal(productEmptyCause({ ...base, catalog: { eligible_for_review_count: 6 } }, "2026-10-31"), null);
});

test("storage helpers never throw without localStorage", () => {
  assert.deepEqual(readChecked("k"), []);
  assert.doesNotThrow(() => writeChecked("k", ["a"]));
});
