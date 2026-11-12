"""Run: python -m app.planning input.json [--output result.json]."""

import argparse
import json
from pathlib import Path

from .engine import run_engine


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--adapter", choices=["question-v1.2"])
    args = parser.parse_args()
    try:
        document = json.loads(args.input.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    if args.adapter == "question-v1.2":
        from .question_v12 import run_question_v12

        result = run_question_v12(document)
    else:
        result = run_engine(document)
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 2 if result["calc_state"] in {"INVALID_INPUT", "INTERNAL_ERROR"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
