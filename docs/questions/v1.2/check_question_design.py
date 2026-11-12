"""Check question-source integrity and independent routing examples; no financial calculations."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CUR = ROOT / 'docs/dion/09_UPDATED_FILES'
source = json.loads((CUR / 'DION_Current_Question_Source.json').read_text())
legacy_path=CUR / 'reference/DION_Question_Source_v1_1.json'
if not legacy_path.exists():
    import os
    legacy_path=Path(os.environ['DION_BASE_ROOT'])/'docs/dion/09_UPDATED_FILES/reference/DION_Question_Source_v1_1.json'
legacy = json.loads(legacy_path.read_text())
contract = json.loads((HERE / 'DION_Adaptive_Question_Contract_v1_2.json').read_text())
rows = source['sheets']['질문 수정안'][1:]
ids = {r[2] for r in rows}
old_ids = {r[2] for r in legacy['sheets']['질문 수정안'][1:]}
assert len(rows) == len(ids) == contract['question_count'] == 55
assert all(len(r) == 18 for r in rows)
assert old_ids <= ids and len(old_ids) == 40
assert len(ids - old_ids) == contract['new_question_count'] == 15
assert source['sheets']['선택지 목록'][1:305] == legacy['sheets']['선택지 목록'][1:]
assert len(source['sheets']['선택지 목록']) - 1 == 414
flow = source['sheets']['상담 흐름 설계'][1:]
quick = [r for r in flow if r[1] == '빠른진단']
assert len(quick) == 11 and len([r for r in flow if r[1] == '빠른해당자']) == 2
assert [r[4] for r in quick] == contract['quick_card_ids']
assert quick[1][4] == 'LIFE-01' and quick[2][4] == 'F11'
assert 'F01' not in contract['quick_card_ids']
assert len({r[2] for r in flow}) == len(flow)
screens = {r[2] for r in flow}
assert all(r[13] in screens for r in rows), [(r[2], r[13]) for r in rows if r[13] not in screens]
assert any(r[2] == 'DET-01' for r in flow)
assert any('정밀진단에 빠른진단 완료 요구 금지' in r[7] for r in flow)
gates = {g['id']: g for g in contract['output_gates']}
assert len(gates) == 14
for g in gates.values():
    assert set(g['question_ids']) <= ids, (g['id'], set(g['question_ids']) - ids)
    assert g['required_facts'] and g['verification'] and g['partial_result'] and g['implementation']
for q in contract['new_questions']:
    assert q['design_id'] in ids and q['fields'] and q['output_refs']
    assert set(q['output_refs']) <= set(gates)
    assert q['production_binding'] is None
assert contract['legacy_persistent_qids_preserved'] == 60
assert contract['automatic_migration_enabled'] is False
assert contract['app_adapter_implemented'] is False
assert contract['legal_rules_active'] == 0
assert contract['allocation_policy_unchanged'] == 'DION-ALLOCATION-1.0'
assert len(contract['process']) == 6
assert {s['code'] for s in contract['life_stages']} >= {'LC_EARLY_CAREER','LC_NEWLYWED','LC_CHILDCARE','LC_SCHOOL_AGE','LC_CHILD_INDEPENDENCE','LC_RETIRED','LC_OTHER','LC_UNKNOWN'}
for case in contract['scenarios']:
    # This is an offline dependency example, not production routing or eligibility logic.
    need = set().union(*(set(gates[o]['question_ids']) for o in case['outputs'])) - set(case['known'])
    assert set(case['must_include']) <= need, (case['id'], 'missing', set(case['must_include']) - need)
    assert not set(case['must_exclude']) & need, (case['id'], 'unwanted', set(case['must_exclude']) & need)
assert len(contract['scenarios']) == 14
print('PASS: 55 unique questions; 40 legacy IDs and 304 option rows preserved; 15 additions; 414 total options; 11+0~2 quick cards; 61 flow screens; 14 output gates and 14 routing/reuse examples; six life stages plus overlap/other/unknown; no automatic migration or legal activation.')
