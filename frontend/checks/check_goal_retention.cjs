/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node offline check */
// Offline persistence check: real FE transformations + disposable existing BE raw store/engine.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const { example, record } = require('../src/lib/dion/model.ts');
const { retainGoals, reactivateGoal, restoreGoals } = require('../src/lib/dion/customer-flow.ts');
const original = structuredClone(example);
const inactive = retainGoals(original, []);
const restored = JSON.parse(JSON.stringify(inactive));
const selected = reactivateGoal(restored, 'goal-1');
const undo = restoreGoals(inactive, original);
for (const stage of [selected, undo]) {
  for (const id of ['F11', 'F12', 'F13']) assert.deepEqual(record(stage, id).envelope.fields.goals, record(original, id).envelope.fields.goals);
  assert.deepEqual(record(stage, 'F11').envelope.fields.inactive_goals.raw_value, []);
}
const python = path.join(root, 'backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const program = `
import json, sys, tempfile
from pathlib import Path
from app.be.raw_store import RawAnswerStore
from app.be.question_bridge import run_frontend_questions
stages = json.load(sys.stdin)
with tempfile.TemporaryDirectory(prefix='dion-goal-retention-') as temporary:
    store = RawAnswerStore(Path(temporary) / 'synthetic.sqlite3')
    store.create_case('offline-test', 'synthetic-goals')
    version = 0
    for index, doc in enumerate(stages):
        envelopes = [r['envelope'] for r in doc['raw_bundle']['answers'] if r['envelope']['question_ref']['design_id'] in {'F11','F12','F13'}]
        for envelope in envelopes:
            receipt = store.save_answer('offline-test','synthetic-goals',version,f'stage-{index}-{version}',envelope)
            version = receipt['input_version']
        saved = {r['envelope']['question_ref']['design_id']:r['envelope'] for r in store.restore('offline-test','synthetic-goals')['answers']}
        for envelope in envelopes:
            assert saved[envelope['question_ref']['design_id']] == envelope
        result = run_frontend_questions(doc)
        assert result['results']['OUT-03']['after_existing_contributions_krw'] == '900000'
        goals = result['results']['OUT-04']
        if index in (1,3):
            assert not goals.get('rows')
        else:
            assert goals['rows'][0]['goal_id'] == 'goal-1'
    assert len(store.history('offline-test','synthetic-goals')) >= 9
print('PASS: goal deselection, JSON restore, reselection, undo, append-only raw persistence and engine exclusion; real login/DB not tested.')
`;
process.stdout.write(execFileSync(python, ['-c', program], { cwd: path.join(root, 'backend'), input: JSON.stringify([original, inactive, selected, inactive, undo]), encoding: 'utf8' }));
