"""Loopback-only UI demonstration harness; no production API or financial policy.

Calls DION-ENGINE-1.2 with DION-ENGINE-1.0 input schema and POC-RAW-0.1.
Only fictional inputs belong here. Result snapshots are immutable local evidence.
"""
from __future__ import annotations

import argparse
import copy
from decimal import Decimal, localcontext
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import threading
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
ACTOR = "MOCK-DEMO-ONLY"
CASE = "SUBMISSION-B-01"
STATE_MAP = {"KNOWN": "KNOWN", "UNKNOWN": "UNKNOWN", "NOT_ENTERED": "UNKNOWN",
             "NOT_ASKED": "NOT_ASKED", "NOT_APPLICABLE": "NOT_APPLICABLE",
             "DEFERRED": "UNKNOWN", "DECLINED": "UNKNOWN"}


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def atomic_write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def engine_states(value):
    """Explicit computational mapping only; original payload remains in PoC."""
    value = copy.deepcopy(value)
    if isinstance(value, dict):
        if "state" in value and "value" in value and "unit" in value:
            state = value["state"]
            value["state"] = STATE_MAP[state]
            if state != "KNOWN":
                value["value"] = None
            if state in {"DEFERRED", "DECLINED"}:
                value["omission_reason"] = "LATER" if state == "DEFERRED" else "DECLINED"
        return {k: engine_states(v) for k, v in value.items()}
    if isinstance(value, list):
        return [engine_states(v) for v in value]
    return value


class Demo:
    def __init__(self, base_root, raw_store_root, state_dir):
        self.base_root = Path(base_root).resolve()
        sys.path.insert(0, str(self.base_root / "backend"))
        sys.path.insert(0, str(Path(raw_store_root).resolve()))
        from app.planning import run_engine
        from raw_store import RawAnswerStore, PocError
        self.run_engine, self.PocError = run_engine, PocError
        self.state_dir = Path(state_dir).resolve()
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.store = RawAnswerStore(self.state_dir / "raw.sqlite3")
        try:
            self.store.create_case(ACTOR, CASE)
        except PocError as exc:
            if exc.code != "CASE_ALREADY_EXISTS":
                raise
        self.catalog = {r['question_id']: r for r in read(self.base_root / 'docs/questions/v1.3-engine/bindings.json')['questions']}
        self.lock = threading.Lock()
        if not (self.state_dir / 'monthly.json').exists():
            atomic_write(self.state_dir / 'monthly.json', read(HERE / 'monthly-input.json'))

    def envelope(self, answer, context):
        qid = answer['question_id']
        if answer['definition_version'] != '1.3-engine':
            raise ValueError('Demo accepts only explicit 1.3-engine answers; no automatic migration')
        return {'wire_version': 'POC-RAW-0.1',
                'question_ref': {'namespace': 'DION-DESIGN', 'design_id': qid,
                                 'definition_version': '1.3-engine',
                                 'definition_ref': 'docs/questions/v1.3-engine/bindings.json#' + qid,
                                 'definition_text': self.catalog[qid]['proposed_question'], 'option_labels': {}},
                'subject_refs': {'person_ref': context['included_owner_ids'][0]},
                'context': {'scope_ref': context['scope'], 'as_of': context['evaluation_on'],
                            'period_start': context['evaluation_on'][:7] + '-01',
                            'period_end': context['evaluation_on'], 'source_ref': 'ui-demo:' + answer['answer_id'], 'basis': 'SCENARIO'},
                'fields': {'payload': {'state': 'KNOWN', 'raw_value': answer['raw_response'], 'unit': 'JSON'}}}

    def restore_document(self, raw, template):
        document = copy.deepcopy(template)
        document['context'].update(case_id=CASE, snapshot_id=raw['raw_snapshot_id'], profile_version=str(raw['input_version']))
        saved = {r['envelope']['question_ref']['design_id']: r for r in raw['answers']}
        # No synthetic answer for an absent record. Fixed source order is retained.
        document['answers'] = [
            {**copy.deepcopy(a), 'revision': saved[a['question_id']]['input_version'],
             'raw_response': engine_states(saved[a['question_id']]['envelope']['fields']['payload']['raw_value'])}
            for a in template['answers'] if a['question_id'] in saved]
        return document

    def save(self, payload):
        with self.lock:
            doc = payload['document']
            if doc['context']['case_id'] != CASE:
                raise ValueError('Only fictional SUBMISSION-B-01 is accepted')
            if len(doc['answers']) > 55 or len({a['question_id'] for a in doc['answers']}) != len(doc['answers']):
                raise ValueError('Duplicate or excessive cards')
            expected = payload['expected_version']
            key = payload['request_key']
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', key):
                raise ValueError('Invalid request key')
            fingerprint = hashlib.sha256(canonical(payload).encode()).hexdigest()
            receipt = self.state_dir / ('receipt-' + key + '.json')
            if receipt.exists():
                old = read(receipt)
                if old['fingerprint'] != fingerprint:
                    raise self.PocError('IDEMPOTENCY_CONFLICT')
                return self.snapshot(old['snapshot_id'])
            # Validate through the existing engine before appending any card.
            check = self.run_engine({**copy.deepcopy(doc), 'answers': [
                {**a, 'raw_response': engine_states(a['raw_response'])} for a in doc['answers']]})
            if check['calc_state'] in {'INVALID_INPUT', 'INTERNAL_ERROR'}:
                reasons = [r.get('reason', r.get('calc_state', '')) for r in check.get('results', {}).values()
                           if r.get('calc_state') in {'INVALID_INPUT', 'INTERNAL_ERROR'}]
                raise ValueError('; '.join(dict.fromkeys(reasons)) or check.get('reason', check['calc_state']))
            self.store._version(expected, self.store.restore(ACTOR, CASE)['input_version'])
            for i, a in enumerate(doc['answers']):
                result = self.store.save_answer(ACTOR, CASE, expected, key + '-card-' + str(i), self.envelope(a, doc['context']))
                expected = result['input_version']
            frozen = self.store.freeze_raw_answers(ACTOR, CASE, expected, key + '-freeze')
            raw = self.store.read_raw_snapshot(ACTOR, CASE, frozen['raw_snapshot_id'])
            engine_input = self.restore_document(raw, doc)
            output = self.run_engine(engine_input)
            result = {'demo_contract': 'DION-UI-DEMO-1.0', 'simulation': True,
                      'raw_snapshot_id': raw['raw_snapshot_id'], 'input_version': raw['input_version'],
                      'recorded_at': raw['answers'][-1]['recorded_at'] if raw['answers'] else None,
                      'engine_input': engine_input, 'engine_output': output, 'raw_answers': raw,
                      'raw_mapping': 'POC payload JSON to 1.3-engine raw_response; NOT_ENTERED remains raw',
                      'runtime': {'storage': 'POC-RAW-0.1 SQLite', 'engine': output.get('engine_release'),
                                  'production_auth': False, 'production_api': False, 'transactions': False}}
            atomic_write(self.state_dir / (raw['raw_snapshot_id'] + '.json'), result)
            atomic_write(receipt, {'fingerprint': fingerprint, 'snapshot_id': raw['raw_snapshot_id']})
            atomic_write(self.state_dir / 'latest.json', {'snapshot_id': raw['raw_snapshot_id']})
            return result

    def snapshot(self, sid):
        if not re.fullmatch(r'raw_[a-f0-9]{32}', sid):
            raise ValueError('Invalid snapshot ID')
        value = read(self.state_dir / (sid + '.json'))
        value['is_current'] = self.store.read_raw_snapshot(ACTOR, CASE, sid)['is_current']
        return value

    def current(self):
        head = self.store.restore(ACTOR, CASE)
        if not (self.state_dir / 'latest.json').exists():
            return {'input_version': head['input_version'], 'snapshot': None}
        result = self.snapshot(read(self.state_dir / 'latest.json')['snapshot_id'])
        return {'input_version': head['input_version'], 'snapshot': result}

    def monthly(self, changes=None):
        with self.lock:
            value = read(self.state_dir / 'monthly.json')
            if changes is not None:
                if changes['record_id'] != value['record_id']:
                    raise ValueError('Fixture mismatch')
                raw = changes['actual']
                if raw['state'] not in STATE_MAP:
                    raise ValueError('Invalid raw state')
                if raw['state'] == 'KNOWN':
                    if not isinstance(raw['raw_value'], str) or not re.fullmatch(r'\d{1,30}(?:\.\d{1,4})?', raw['raw_value']):
                        raise ValueError('Exact decimal required')
                elif raw['raw_value'] is not None:
                    raise ValueError('Unknown value must be null')
                value['new_investment_actual'] = {**raw, 'unit': 'KRW_10000'}
                atomic_write(self.state_dir / 'monthly.json', value)
            actual = value['new_investment_actual']
            with localcontext() as ctx:
                ctx.prec = 100
                value['investment_difference_krw'] = (str(int(Decimal(actual['raw_value']) * 10000) - int(value['new_investment_plan_krw']))
                    if actual['state'] == 'KNOWN' else None)
            value['completed_tasks'] = sum(value['tasks'])
            value['task_percent'] = str(100 * sum(value['tasks']) // len(value['tasks']))
            value['comparison_basis'] = 'UI reporting arithmetic only, not a financial recommendation'
            return value


class Handler(BaseHTTPRequestHandler):
    def json_reply(self, code, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlsplit(self.path)
        try:
            if path.path == '/api/current':
                return self.json_reply(200, self.server.demo.current())
            if path.path == '/api/snapshot':
                return self.json_reply(200, self.server.demo.snapshot(parse_qs(path.query)['id'][0]))
            if path.path == '/api/monthly':
                return self.json_reply(200, self.server.demo.monthly())
            if path.path == '/api/template':
                return self.json_reply(200, read(HERE / 'submission-input.json'))
            files = {'/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css'}
            if path.path not in files:
                return self.json_reply(404, {'error': 'NOT_FOUND'})
            file = HERE / files[path.path]
            data = file.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', {'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css'}[file.suffix[1:]])
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (ValueError, KeyError, FileNotFoundError) as exc:
            self.json_reply(400, {'error': str(exc)})

    def do_POST(self):
        # This is a local harness, never expose it as a production service.
        try:
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + self.headers.get('Host', ''):
                return self.json_reply(403, {'error':'ORIGIN_REJECTED'})
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 300000:
                raise ValueError('Invalid content length')
            data = json.loads(self.rfile.read(size), parse_float=lambda _: (_ for _ in ()).throw(ValueError('Float not allowed')))
            if self.path == '/api/save':
                return self.json_reply(200, self.server.demo.save(data))
            if self.path == '/api/monthly':
                return self.json_reply(200, self.server.demo.monthly(data))
            self.json_reply(404, {'error': 'NOT_FOUND'})
        except self.server.demo.PocError as exc:
            self.json_reply(409, {'error': exc.code})
        except (ValueError, KeyError, TypeError) as exc:
            self.json_reply(400, {'error': str(exc)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-root', type=Path, default=HERE.parents[3])
    parser.add_argument('--raw-store-root', type=Path, required=True)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    demo = Demo(args.base_root, args.raw_store_root, args.state_dir)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.demo = demo
    print(f'Fictional local demo: http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
