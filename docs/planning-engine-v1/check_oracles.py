"""Run two complete fictional examples against independent, fixed amount oracles."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.planning import run_engine  # noqa: E402

cases = json.loads(Path(__file__).with_name('oracles.json').read_text(encoding='utf-8'))['cases']
checks = 0
for case in cases:
    result = run_engine(json.loads((ROOT / case['input']).read_text(encoding='utf-8')))
    for pointer, expected in case['expected'].items():
        found = result
        for part in pointer.split('/'):
            found = found[int(part)] if isinstance(found, list) else found[part]
        if found != expected:
            raise AssertionError(f'{case["input"]} {pointer}: {found!r} != {expected!r}')
        checks += 1
print(json.dumps({'cases': len(cases), 'fixed_amount_checks': checks, 'state': 'PASSED'}))
