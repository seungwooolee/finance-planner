"""Read-only BE/FE proxy gate. A live deploy must match the intended commit and corpus."""
import argparse
import json
from urllib.parse import urlsplit
from urllib.request import urlopen

REQUIRED_PATHS = {
    "/api/be/v1/dialogue",
    "/api/fe/v1/preview",
    "/api/be/v1/cases/{case_id}/analyses/{run_id}/portfolio-evidence",
    "/api/be/v1/cases/{case_id}/agent-sessions/{sid}/scheme-evidence",
}


def inspect(base, expected, corpus_version):
    url = urlsplit(base)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
        raise ValueError("HTTP(S) URL without credentials required")
    with urlopen(base.rstrip("/") + "/api/deployment-info", timeout=15) as response:
        report = json.load(response)
    passed = (report.get("contract_version") == "DION-DEPLOYMENT-1.0"
              and report.get("commit_sha") == expected and report.get("rag", {}).get("status") == "READY"
              and report.get("rag", {}).get("source_count", 0) > 0
              and report.get("rag", {}).get("corpus_version") == corpus_version
              and REQUIRED_PATHS.issubset(report.get("api_paths", [])))
    return {"url": base, "passed": passed, "observed": report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", required=True)
    parser.add_argument("--expect-commit", required=True)
    parser.add_argument("--expect-corpus", required=True)
    parser.add_argument("--frontend", help="Checks the FE's actual /api rewrite target; does not attest the FE build SHA")
    args = parser.parse_args()
    reports = []
    for target in (args.backend, args.frontend):
        if not target:
            continue
        try:
            reports.append(inspect(target, args.expect_commit, args.expect_corpus))
        except (OSError, ValueError):
            reports.append({"url": target, "passed": False, "error": "DEPLOYMENT_IDENTITY_UNAVAILABLE"})
    if len(reports) == 2 and all(row["passed"] for row in reports):
        reports[1]["passed"] = reports[0]["observed"]["rag"] == reports[1]["observed"]["rag"]
    print(json.dumps({"expected_commit": args.expect_commit, "reports": reports}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if all(row["passed"] for row in reports) else 1)


if __name__ == "__main__":
    main()
