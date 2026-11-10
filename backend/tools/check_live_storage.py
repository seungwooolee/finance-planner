"""Real login/API/PostgreSQL acceptance checks; no secrets are persisted.

Run from the repository root. Only new BE-LIVE-* fictional cases are written.
The default legacy contract matches the current FE; v2 is explicitly opt-in.
"""
import argparse
import copy
import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from getpass import getpass
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
import psycopg
from dotenv import dotenv_values

PROFILES = {
    "legacy": ("planning-v1.1/question_v121_input.json", "DION-QUESTION12-ADAPTER-1.0",
               "/question-analyses"),
    "v2": ("planning-v1.2/dated_funded_input.json", "DION-QUESTION12-ADAPTER-1.1",
           "/analyses/question-v12"),
}


class CheckError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise CheckError(code)


def error_code(response):
    try:
        detail = response.json().get("detail", {})
        code = detail.get("code", "NO_CODE") if isinstance(detail, dict) else "NO_CODE"
        return code if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]+", code) else "NO_CODE"
    except (ValueError, AttributeError):
        return "NON_JSON_RESPONSE"


def api_address(value):
    parsed = urlsplit(value)
    require(parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            and not parsed.username and not parsed.password and not parsed.path.strip("/")
            and not parsed.query and not parsed.fragment, "ONLY_LOCAL_BACKEND_ALLOWED")
    require(parsed.port is not None, "EXPLICIT_BACKEND_PORT_REQUIRED")
    return value.rstrip("/")


class Database:
    def __init__(self, settings):
        names = {"host": "DION_DB_HOST", "user": "DION_DB_USER", "password": "DION_DB_PASSWORD"}
        self.parameters = {key: settings.get(name) for key, name in names.items()}
        require(all(self.parameters.values()), "DB_CONFIG_MISSING_IN_THIS_CHECKOUT")
        self.parameters.update(port=int(settings.get("DION_DB_PORT") or "5432"),
                               dbname=settings.get("DION_DB_NAME") or "postgres",
                               sslmode="require", connect_timeout=10, prepare_threshold=None)

    def doctor(self):
        with psycopg.connect(**self.parameters) as conn:
            with conn.cursor() as cur:
                for table in ("cases", "answer_revisions", "answer_heads", "request_receipts",
                              "raw_snapshots", "analysis_runs", "analysis_drafts", "case_plan_links"):
                    cur.execute("select to_regclass(%s)", ("dion_be." + table,))
                    require(cur.fetchone()[0] is not None, "DB_TABLE_MISSING_" + table.upper())
        print("POSTGRES_CONNECTION_AND_TABLES PASS")

    def audit(self, state, expected_version, values, run_ids):
        require(state["case_id"].startswith("BE-LIVE-"), "NON_TEST_CASE_REJECTED")
        with psycopg.connect(**self.parameters) as conn:
            with conn.cursor() as cur:
                cur.execute("select input_version from dion_be.cases where case_id=%s", (state["case_id"],))
                row = cur.fetchone()
                require(row is not None and row[0] == expected_version, "POSTGRES_CASE_VERSION_MISMATCH")
                cur.execute("select envelope_json from dion_be.answer_revisions where case_id=%s "
                            "order by input_version", (state["case_id"],))
                incomes = []
                for (encoded,) in cur.fetchall():
                    env = json.loads(encoded)
                    if env["question_ref"]["design_id"] == "F03":
                        incomes.append(env["fields"]["monthly_net_income_krw"]["raw_value"])
                require(incomes == values, "POSTGRES_RAW_HISTORY_MISMATCH")
                cur.execute("select run_id from dion_be.analysis_runs where case_id=%s", (state["case_id"],))
                require({row[0] for row in cur.fetchall()} == set(run_ids), "POSTGRES_RUN_ROWS_MISMATCH")
        print("POSTGRES_ROWS_MATCH_API PASS")


class LiveCheck:
    def __init__(self, root, api, contract, checkpoint, client, database):
        self.api, self.contract, self.checkpoint = api, contract, checkpoint
        self.client, self.database, self.headers = client, database, {}
        sample, self.adapter, self.route = PROFILES[contract]
        raw = (root / "backend/examples" / sample).read_bytes()
        self.fixture_hash = hashlib.sha256(raw).hexdigest()
        self.document = json.loads(raw)
        self.cards = [row["envelope"] for row in self.document["raw_bundle"]["answers"]]
        self.count = len(self.cards)
        self.income_index = next(i for i, card in enumerate(self.cards)
                                 if card["question_ref"]["design_id"] == "F03")
        self.state = json.loads(checkpoint.read_text(encoding="utf-8")) if checkpoint.exists() else None
        if self.state:
            require(self.state.get("contract") == contract and self.state.get("api") == api
                    and self.state.get("fixture_hash") == self.fixture_hash, "CHECKPOINT_CONTRACT_MISMATCH")

    def checkpoint_write(self):
        self.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        path = self.checkpoint.with_suffix(".tmp")
        path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")
        path.replace(self.checkpoint)

    @property
    def base(self):
        return "/api/be/v1/cases/" + self.state["case_id"]

    def request(self, method, path, payload=None, expected=(200,)):
        response = self.client.request(method, self.api + path, headers=self.headers, json=payload)
        require(response.status_code in expected,
                f"API_HTTP_{response.status_code}_{error_code(response)}")
        return response.json()

    def login(self):
        require(self.request("GET", "/api/be/v1/auth/status").get("configured") is True,
                "BACKEND_AUTH_CONFIG_MISSING_RESTART_WITH_LOCAL_ENV")
        email = input("Test user email: ").strip()
        password = getpass("Test user password (hidden): ")
        result = self.request("POST", "/api/be/v1/auth/login", {"email": email, "password": password})
        del password
        token = result.get("access_token")
        require(isinstance(token, str) and token, "LOGIN_TOKEN_MISSING")
        self.headers = {"Authorization": "Bearer " + token}
        print("REAL_LOGIN PASS")

    def calculate(self, version, key):
        context = {k: v for k, v in self.document["context"].items()
                   if k not in {"case_id", "snapshot_id", "profile_version"}}
        payload = {"expected_version": version, "request_key": key,
                   "requested_outputs": self.document["requested_outputs"],
                   "confirmations": self.document["confirmations"]}
        if self.contract == "legacy":
            payload.update(context=context, scope_ref=self.document["scope_ref"])
        else:
            payload["assessment"] = dict(context, scope_ref=self.document["scope_ref"])
        # Deliberately no payment_calendar: the declared-date route has separate gates.
        return self.request("POST", self.base + self.route, payload)

    @staticmethod
    def income(answers):
        return next(row["envelope"] for row in answers if row["envelope"]["question_ref"]["design_id"] == "F03")

    def seed(self):
        require(not self.state or self.state["phase"] == "SEEDING", "ALREADY_SEEDED_USE_VERIFY")
        if self.state is None:
            self.state = {"case_id": "BE-LIVE-" + uuid4().hex, "phase": "SEEDING",
                          "contract": self.contract, "api": self.api, "fixture_hash": self.fixture_hash}
            self.checkpoint_write()
        self.request("POST", "/api/be/v1/cases", {"case_id": self.state["case_id"]}, (201, 409))
        self.request("GET", self.base + "/answers")  # Authorize before resuming any partial seed.
        for index, envelope in enumerate(self.cards):
            self.request("PUT", self.base + "/answers",
                         {"expected_version": index, "request_key": f"seed-{index}", "envelope": envelope})
        current = self.request("GET", self.base + "/answers")
        require(current["input_version"] == self.count, "SEED_VERSION_MISMATCH")
        require(self.income(current["answers"])["fields"]["monthly_net_income_krw"]["raw_value"]
                == "00300.0000", "ORIGINAL_TEXT_NOT_PRESERVED")
        # Two simultaneous identical analysis requests must return one receipt/run.
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: self.calculate(self.count, "analysis-v1"), range(2)))
        require(responses[0] == responses[1], "CONCURRENT_DUPLICATE_ANALYSIS")
        first = responses[0]
        require(first["status"] == "SUCCEEDED", "V1_CALCULATION_FAILED")
        record = self.request("GET", self.base + "/analyses/" + first["run_id"])
        require(record["adapter_version"] == self.adapter, "ADAPTER_VERSION_MISMATCH")
        require(record["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000",
                "V1_ENGINE_AMOUNT_MISMATCH")
        self.state.update(phase="SEEDED", run_v1=first["run_id"], raw_v1=first["raw_snapshot_id"])
        self.checkpoint_write()
        self.database.audit(self.state, self.count, ["00300.0000"], [first["run_id"]])
        print("RAW_TEXT_AND_ACTUAL_ENGINE PASS")
        print("CONCURRENT_IDEMPOTENT_ANALYSIS PASS")
        print("SEED_COMPLETE_RESTART_BACKEND_THEN_VERIFY")

    def verify(self):
        require(self.state is not None and "run_v1" in self.state, "SEED_FIRST")
        current = self.request("GET", self.base + "/answers")
        if self.state["phase"] == "SEEDED":
            require(current["input_version"] == self.count and self.income(current["answers"])["fields"]
                    ["monthly_net_income_krw"]["raw_value"] == "00300.0000", "RESTORE_MISMATCH")
            self.state["phase"] = "EDITING"
            self.checkpoint_write()
            print("RAW_RESTORE PASS")
        changed = copy.deepcopy(self.cards[self.income_index])
        changed["fields"]["monthly_net_income_krw"]["raw_value"] = "320"
        self.request("PUT", self.base + "/answers",
                     {"expected_version": self.count, "request_key": "edit-v2", "envelope": changed})
        second = self.calculate(self.count + 1, "analysis-v2")
        old = self.request("GET", self.base + "/analyses/" + self.state["run_v1"])
        new = self.request("GET", self.base + "/analyses/" + second["run_id"])
        require(old["is_current"] is False and new["is_current"] is True, "RESULT_CURRENT_FLAG_FAILED")
        require(old["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"
                and new["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "1100000",
                "OLD_NEW_ENGINE_AMOUNT_MISMATCH")
        require(new["result"]["results"]["OUT-05"]["calc_state"] == "NEEDS_INPUT",
                "RECONFIRMATION_GATE_MISSING")
        if self.contract == "v2":
            require(second["status"] == "PARTIAL" and second["draft_id"] is None,
                    "V2_PARTIAL_RESULT_MISLABELED")
        snapshot = self.request("GET", self.base + "/snapshots/" + self.state["raw_v1"])
        require(self.income(snapshot["answers"])["fields"]["monthly_net_income_krw"]["raw_value"]
                == "00300.0000", "OLD_RAW_SNAPSHOT_CHANGED")
        history = self.request("GET", self.base + "/history")
        values = [row["envelope"]["fields"]["monthly_net_income_krw"]["raw_value"] for row in history
                  if row["envelope"]["question_ref"]["design_id"] == "F03"]
        require(values == ["00300.0000", "320"], "REVISION_HISTORY_FAILED")
        self.request("PUT", self.base + "/answers", {"expected_version": self.income_index,
                     "request_key": f"seed-{self.income_index}", "envelope": self.cards[self.income_index]})
        stale = self.client.put(self.api + self.base + "/answers", headers=self.headers,
                                json={"expected_version": self.count, "request_key": "stale", "envelope": changed})
        require(stale.status_code == 409 and error_code(stale) == "VERSION_CONFLICT", "STALE_SAVE_NOT_REJECTED")
        current = self.request("GET", self.base + "/answers")
        require(current["input_version"] == self.count + 1 and self.income(current["answers"])["fields"]
                ["monthly_net_income_krw"]["raw_value"] == "320", "RETRY_REWOUND_ANSWER")
        self.database.audit(self.state, self.count + 1, ["00300.0000", "320"],
                            [self.state["run_v1"], second["run_id"]])
        self.state.update(phase="VERIFIED", run_v2=second["run_id"])
        self.checkpoint_write()
        print("HISTORY_SNAPSHOT_AND_BOTH_RESULTS PASS")
        print("RETRY_AND_STALE_SAVE_409 PASS")
        print("FUTURE_ASSUMPTION_RECONFIRMATION_GATE PASS")
        print("STORAGE_CHECK_COMPLETE")

    def access(self):
        require(self.state is not None and "run_v1" in self.state, "SEED_FIRST")
        for suffix in ("/answers", "/history", "/analyses/" + self.state["run_v1"]):
            response = self.client.get(self.api + self.base + suffix, headers=self.headers)
            require(response.status_code == 404, "DIFFERENT_USER_REQUIRED_OR_ACCESS_LEAK")
        response = self.client.put(self.api + self.base + "/answers", headers=self.headers,
                                    json={"expected_version": self.count, "request_key": "foreign-write",
                                          "envelope": self.cards[self.income_index]})
        require(response.status_code == 404, "FOREIGN_WRITE_NOT_DENIED")
        print("DIFFERENT_REAL_USER_ACCESS_DENIED PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("doctor", "seed", "verify", "access"))
    parser.add_argument("--contract", choices=PROFILES, default="legacy")
    parser.add_argument("--api", default="http://127.0.0.1:8001")
    args = parser.parse_args()
    api = api_address(args.api)
    root = Path(__file__).resolve().parents[2]
    settings = dotenv_values(root / "backend/.env")
    for key in ("DION_DB_HOST", "DION_DB_USER", "DION_DB_PASSWORD",
                "DION_SUPABASE_URL", "DION_SUPABASE_PUBLIC_KEY"):
        print(key, "OK" if settings.get(key) else "MISSING")
    database = Database(settings)
    database.doctor()
    if args.phase == "doctor":
        return
    local = Path(os.getenv("LOCALAPPDATA", str(Path.home() / ".local/share")))
    state = local / "DION/be-git-live-check" / args.contract / "checkpoint.json"
    print("CONTRACT", PROFILES[args.contract][1])
    if args.phase == "access":
        print("Use a DIFFERENT project test user for this access check.")
    with httpx.Client(timeout=30, trust_env=False, follow_redirects=False) as client:
        runner = LiveCheck(root, api, args.contract, state, client, database)
        runner.login()
        getattr(runner, args.phase)()


if __name__ == "__main__":
    try:
        main()
    except CheckError as error:
        print("CHECK_FAILED", str(error))
        raise SystemExit(1) from None
    except (httpx.HTTPError, psycopg.Error, OSError, ValueError, KeyError, TypeError, StopIteration) as error:
        print("CHECK_FAILED", type(error).__name__)
        raise SystemExit(1) from None
