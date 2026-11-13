// node --experimental-strip-types --test checks/product-empty.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { productEmptyCause } from "../src/lib/dion/product-empty.ts";

test("empty product cause: investment question and evaluation date", () => {
  const base = { review_version: "x", catalog: { eligible_for_review_count: 0 }, product_policy: { reviewed_on: "2026-11-13" } };
  assert.deepEqual(productEmptyCause({ ...base, missing_question_ids: ["F15"] }, "2026-10-31"), { investment: true, date: { evaluationOn: "2026-10-31", policyFrom: "2026-11-13" } });
  assert.deepEqual(productEmptyCause({ ...base, missing_question_ids: ["F15"] }, "2026-11-13"), { investment: true, date: null });
  assert.deepEqual(productEmptyCause(base, "2026-10-31")?.investment, false);
  assert.equal(productEmptyCause(base, "2026-11-13"), null);
  assert.equal(productEmptyCause({ ...base, catalog: { eligible_for_review_count: 6 } }, "2026-10-31"), null);
});
