"""Independent expected figures and local save/restore integration checks."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

from server import Demo, Handler, HERE, ACTOR, CASE, engine_states, read

BASE = Path(os.environ['DION_BASE_ROOT']).resolve()
RAW = Path(os.environ['DION_RAW_STORE_ROOT']).resolve()


class Integration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.demo = Demo(BASE, RAW, self.tmp.name)
        self.doc = read(HERE / 'submission-input.json')

    def tearDown(self):
        self.tmp.cleanup()

    def save(self, key='save', version=0, document=None):
        return self.demo.save({'document': document or self.doc, 'expected_version': version, 'request_key': key})

    def test_independent_base_figures(self):
        s = self.save()
        out = s['engine_output']['results']
        self.assertEqual(out['OUT-02']['net_worth']['value'], '20000000')
        self.assertEqual(out['OUT-03']['after_existing_contributions_krw'], '2500000')
        self.assertEqual(out['OUT-04']['rows'][0]['level_contribution_krw'], '1000000')
        cs = out['OUT-05']['candidates']
        self.assertEqual([c['rows'][0]['new_investment_krw'] for c in cs], ['750000','1200000'])
        self.assertEqual([c['final_cash_krw'] for c in cs], ['20250000','18900000'])
        self.assertEqual([c['final_net_worth_krw'] for c in cs], ['24000000','24000000'])
        self.assertFalse(any(c['recommendation'] for c in cs))

    def test_revise_recalculate_and_original_snapshot(self):
        first = self.save('first')
        doc = copy.deepcopy(self.doc)
        doc['answers'][1]['raw_response']['monthly_net_income']['value'] = '00520.0000'
        second = self.save('second', first['input_version'], doc)
        cs = second['engine_output']['results']['OUT-05']['candidates']
        self.assertEqual([c['rows'][0]['new_investment_krw'] for c in cs], ['850000','1360000'])
        self.assertEqual([c['final_cash_krw'] for c in cs], ['20550000','19020000'])
        self.assertEqual([c['final_net_worth_krw'] for c in cs], ['24600000','24600000'])
        old = self.demo.snapshot(first['raw_snapshot_id'])
        self.assertEqual(old['engine_input']['answers'][1]['raw_response']['monthly_net_income']['value'], '00500.0000')
        self.assertFalse(old['is_current'])

    def test_exact_original_00300_roundtrip(self):
        self.doc['answers'][1]['raw_response']['monthly_net_income']['value'] = '00300.0000'
        s = self.save()
        raw = next(r for r in s['raw_answers']['answers'] if r['envelope']['question_ref']['design_id']=='F03')
        self.assertEqual(raw['envelope']['fields']['payload']['raw_value']['monthly_net_income']['value'],'00300.0000')
        self.assertEqual(s['engine_output']['input_snapshot']['answers'][1]['raw_response']['monthly_net_income']['value'],'00300.0000')

    def test_unknown_keeps_partial_assets(self):
        m = self.doc['answers'][1]['raw_response']['monthly_net_income']
        m.update(value=None, state='NOT_ENTERED')
        s = self.save()
        self.assertEqual(s['engine_output']['results']['OUT-02']['net_worth']['value'], '20000000')
        self.assertEqual(s['engine_output']['results']['OUT-03']['calc_state'], 'NEEDS_INPUT')
        raw = next(r for r in s['raw_answers']['answers'] if r['envelope']['question_ref']['design_id']=='F03')
        self.assertEqual(raw['envelope']['fields']['payload']['raw_value']['monthly_net_income']['state'],'NOT_ENTERED')
        self.assertEqual(s['engine_input']['answers'][1]['raw_response']['monthly_net_income']['state'],'UNKNOWN')

    def test_state_mapping_never_creates_zero(self):
        for state in ['UNKNOWN','NOT_ENTERED','NOT_ASKED','NOT_APPLICABLE','DEFERRED','DECLINED']:
            mapped=engine_states({'value':None,'unit':'KRW','basis':'SCENARIO','state':state})
            self.assertIsNone(mapped['value'])
        self.assertEqual(engine_states({'value':'0','unit':'KRW','state':'KNOWN'})['value'],'0')

    def test_duplicate_and_stale_edit(self):
        first=self.save()
        self.assertEqual(self.save()['raw_snapshot_id'],first['raw_snapshot_id'])
        with self.assertRaisesRegex(Exception,'VERSION_CONFLICT'):
            self.save('stale',0)
        self.assertEqual(len(self.demo.store.history(ACTOR,CASE)),12)

    def test_foreign_actor_rejected(self):
        with self.assertRaisesRegex(Exception,'NO_ACCESS'):
            self.demo.store.restore('ANOTHER_MOCK_ACTOR',CASE)

    def test_new_process_restores_same_hash(self):
        s=self.save()
        code='from server import Demo; import sys,json; d=Demo(*sys.argv[1:]); print(json.dumps(d.current()))'
        proc=subprocess.run([sys.executable,'-c',code,str(BASE),str(RAW),self.tmp.name],cwd=HERE,capture_output=True,text=True,check=True)
        restored=json.loads(proc.stdout)['snapshot']
        self.assertEqual(restored['raw_snapshot_id'],s['raw_snapshot_id'])
        self.assertEqual(restored['engine_output']['input_sha256'],s['engine_output']['input_sha256'])
        self.assertEqual(self.demo.run_engine(restored['engine_input']),s['engine_output'])

    def test_monthly_missing_zero_and_common_lump_record(self):
        m=self.demo.monthly()
        self.assertEqual(m['task_percent'],'75')
        self.assertIsNone(m['investment_difference_krw'])
        self.assertEqual(m['life_remaining_budget_krw'],'550000')
        zero=self.demo.monthly({'record_id':m['record_id'],'actual':{'state':'KNOWN','raw_value':'0'}})
        self.assertEqual(zero['investment_difference_krw'],'-300000')
        empty=self.demo.monthly({'record_id':m['record_id'],'actual':{'state':'NOT_ENTERED','raw_value':None}})
        self.assertIsNone(empty['investment_difference_krw'])
        self.assertEqual(empty['lump_sum'],m['lump_sum'])
        large=self.demo.monthly({'record_id':m['record_id'],'actual':{'state':'KNOWN','raw_value':'123456789012345678901234567890.1234'}})
        self.assertEqual(large['investment_difference_krw'],str(int('1234567890123456789012345678901234')-300000))

    def test_no_goal_branch_uses_no_goal_amount(self):
        self.doc['answers']=[a for a in self.doc['answers'] if a['question_id'] not in {'F12','F13'}]
        for a in self.doc['answers']:
            if a['question_id']=='F11':a['raw_response']={'status':'NONE','items':[]}
            if a['question_id']=='NEW-06':a['raw_response']['items']=[r for r in a['raw_response']['items'] if r['purpose']!='GOAL']
        s=self.save()
        self.assertEqual(s['engine_output']['results']['OUT-04']['rows'],[])
        self.assertNotIn('F12',[a['question_id'] for a in s['engine_input']['answers']])

    def test_invalid_does_not_save(self):
        self.doc['answers'][0]['raw_response']['scope']='personal'
        with self.assertRaises(ValueError):self.save()
        self.assertEqual(self.demo.current()['input_version'],0)

    def test_http_save_and_reconnect(self):
        http=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        http.demo=self.demo
        t=threading.Thread(target=http.serve_forever,daemon=True);t.start()
        try:
            url='http://127.0.0.1:'+str(http.server_port)
            req=urllib.request.Request(url+'/api/save',json.dumps({'document':self.doc,'expected_version':0,'request_key':'http'}).encode(),{'Content-Type':'application/json'})
            s=json.load(urllib.request.urlopen(req))
            restored=json.load(urllib.request.urlopen(url+'/api/current'))['snapshot']
            self.assertEqual(s['engine_output']['input_sha256'],restored['engine_output']['input_sha256'])
        finally:http.shutdown();http.server_close()


if __name__=='__main__':
    unittest.main()
