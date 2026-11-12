import copy,json,os,sys,unittest
from pathlib import Path
from question_review import *

class QuestionContractTests(unittest.TestCase):
    def test_ids_counts_and_consumers(self):
        ids=[q['design_id'] for q in CONTRACT['questions']]
        self.assertEqual(len(ids),55);self.assertEqual(len(set(ids)),55)
        self.assertEqual(len(CONTRACT['output_gates']),14)
        for q in ['F01','D01','N03','D20-2']:
            self.assertFalse(CONTRACT['consumer_registry'][q]['initial_visible'])
        self.assertEqual(CONTRACT['consumer_registry']['F01']['active_consumers'],[])

    def test_out05_dependencies(self):
        gates={x['id']:x for x in CONTRACT['output_gates']};g=gates['OUT-05']
        self.assertTrue({'F03','F04','F06'}<=set(g['direct_question_ids']))
        self.assertEqual({x['id'] for x in g['upstream_results']},{'OUT-03','OUT-04'})
        self.assertNotIn('NEW-07',g['question_ids'])
        self.assertIn('NEW-07',g['optional_context_question_ids'])
        for up in g['upstream_results']:self.assertTrue(set(gates[up['id']]['question_ids'])<=set(g['question_ids']))

    def test_debt_valid_interest_counterexample(self):
        result=debt_check(100000,100000,1000,0,101000)
        self.assertEqual(result['status'],'VALID');self.assertEqual(result['cash_payment_krw'],101000)

    def test_principal_only_validation(self):
        self.assertEqual(debt_check(100000,100001,1000,0,101001)['errors'],['PRINCIPAL_EXCEEDS_OPENING_BALANCE'])
        self.assertEqual(debt_check(0,100000,1000,0,101000,timing='AFTER_PAYMENT')['status'],'NEEDS_INPUT')
        self.assertEqual(debt_check(100000,100001,1000,0,101001,same_reference=False)['status'],'NEEDS_INPUT')
        self.assertEqual(debt_check(100000,100000,1000,100,101100)['status'],'VALID')
        self.assertIn('COMPONENT_SUM_MISMATCH',debt_check(100000,100000,1000,0,101100)['errors'])
        self.assertEqual(debt_check(100000,100000,None,None,101000)['cash_payment_krw'],101000)

    def test_living_definitions(self):
        self.assertEqual(normalized_living(1800000,'LIVING_ONLY',True),1800000)
        self.assertIsNone(normalized_living(1800000,'LIVING_ONLY',None))
        self.assertEqual(normalized_living(2100000,'TOTAL_OUTFLOW',included_debt=300000,included_contributions=0),1800000)
        self.assertIsNone(normalized_living(2100000,'TOTAL_OUTFLOW',included_debt=None,included_contributions=0))
        with self.assertRaises(ValueError):normalized_living(10,'TOTAL_OUTFLOW',included_debt=11,included_contributions=0)

    def test_states_and_units(self):
        for state in STATES:
            if state=='ABSENT_RECORD':continue
            with self.subTest(state=state):
                raw={'state':state,'value':'0' if state=='KNOWN' else None,'unit':'KRW_10000','source_ref':'answer:a:v1'}
                got=normalize_state(raw)
                self.assertEqual(got['original'],raw)
                self.assertEqual(got['engine_value']['value'],'0' if state=='KNOWN' else None)
        self.assertIsNone(normalize_state(None))
        self.assertEqual(normalize_state({'state':'KNOWN','value':'10.0001','unit':'KRW_10000'})['engine_value']['value'],'100001')
        with self.assertRaises(ValueError):normalize_state({'state':'UNKNOWN','value':'0','unit':'KRW'})

    def test_reserve_policy_not_pending(self):
        r=reserve_targets(1800000,300000,'POLICY_ONLY',current_operating=1000000)
        self.assertEqual(r['minimum'],(6300000,2100000));self.assertEqual(r['H'],1100000)
        r=reserve_targets(1800000,300000,'EXTRA_ABOVE_MINIMUM',100000,200000,1000000)
        self.assertEqual(r['final'],(6400000,2300000));self.assertEqual(r['H'],1300000)
        r=reserve_targets(1800000,300000,'UNKNOWN')
        self.assertEqual(r['policy'],'DION-ALLOCATION-1.0');self.assertEqual(r['status'],'NEEDS_INPUT')

    def test_all_routes_reuse_and_no_context_overcollection(self):
        for case in fixtures():
            with self.subTest(path=case['id']):
                plan=visible_fields(case)
                self.assertNotIn('investment_wish',{x['id'] for x in plan['visible']})
                self.assertFalse({'age','occupation','home_count','tax_interests'}&{x['id'] for x in plan['visible']})
                cache={x['fact_key']:{'state':'KNOWN','source_ref':'fixture:confirmed'} for x in plan['visible']}
                self.assertEqual(visible_fields(case,cache)['counts']['visible_fact_fields'],0)
                self.assertEqual(visible_fields(case,cache)['counts']['reused_fact_fields'],len(cache))

    def test_same_facts_in_quick_to_deep_and_overlap(self):
        quick,deep,overlap,*_=fixtures();p=visible_fields(quick)
        cache={x['fact_key']:{'state':'KNOWN','source_ref':'fixture:confirmed'} for x in p['visible']}
        for case in [deep,overlap]:
            plan=visible_fields(case,cache)
            self.assertTrue(set(cache).isdisjoint(x['fact_key'] for x in plan['visible']))
            self.assertGreater(plan['counts']['reused_fact_fields'],0)
        # New owner/period is legitimately new. Changing the definition never relabels old raw.
        changed={**deep,'owner':'person:b'}
        self.assertEqual(visible_fields(changed,cache)['counts']['reused_fact_fields'],0)
        changed={**deep,'period':'2026-11-01/2026-11-30'}
        self.assertEqual(visible_fields(changed,cache)['counts']['reused_fact_fields'],0)

    def test_unknown_not_repeated_automatically(self):
        case=fixtures()[1];p=visible_fields(case);item=p['visible'][0]
        for state in ['UNKNOWN','DEFERRED','DECLINED']:
            plan=visible_fields(case,{item['fact_key']:{'state':state,'source_ref':'fixture:raw'}})
            self.assertEqual(plan['counts']['deferred_fact_fields'],1)
            self.assertNotIn(item['fact_key'],[i['fact_key'] for i in plan['visible']])

    def test_extra_entities_not_reask_same_entity(self):
        case=fixtures()[-1];p=visible_fields(case)
        self.assertEqual(p['counts']['repeated_entity_rows'],13)
        self.assertEqual(p['counts']['duplicate_fact_requests'],0)

    def test_changed_definition_preserves_old_raw(self):
        old={'answer_id':'raw:F04','revision':2,'definition_version':'1.2','raw_response':{'text':'전체 출금210만원'}}
        snapshot=copy.deepcopy(old)
        history=revise_answer(old,{'expense_basis':'TOTAL_OUTFLOW','living':'210','included_debt':None},'1.2.1','user:reconfirmation')
        self.assertEqual(old,snapshot);self.assertEqual(history[0],snapshot)
        self.assertEqual(history[1]['revision'],3);self.assertEqual(history[1]['definition_version'],'1.2.1')
        self.assertIsNone(history[1]['raw_response']['included_debt'])

    def test_stage_alone_does_not_add_goal_or_pension_fields(self):
        quick=fixtures()[0];case={**quick,'stages':['LC_RETIRED','LC_SCHOOL_AGE']}
        self.assertEqual(visible_fields(case)['counts'],visible_fields(quick)['counts'])

class InheritedEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base=Path(os.environ.get('DION_BASE_ROOT',Path(__file__).resolve().parents[3]))
        if not (base/'backend/app/planning/engine.py').exists():raise unittest.SkipTest('set DION_BASE_ROOT to baseline integrated dion root')
        sys.path.insert(0,str(base/'backend'))
        from app.planning import run_engine
        cls.run_engine=staticmethod(run_engine)
        cls.fixture=json.loads((base/'backend/examples/planning/base_input.json').read_text())
    def run_case(self,modify=None):
        doc=copy.deepcopy(self.fixture)
        if modify:modify(doc)
        return self.run_engine(doc)
    def test_existing_engine_accepts_interest_over_balance(self):
        def modify(d):
            for a in d['answers']:
                if a['question_id']=='NEW-04':a['raw_response']['status']='PRESENT'
            money=lambda n:{'value':str(n),'state':'KNOWN','unit':'KRW','basis':'SCENARIO'}
            d['answers'].append({'answer_id':'fixture:debt','question_id':'F09+F10+D08','definition_version':'1.3-engine','revision':1,'raw_response':{'coverage':'complete','items':[{'debt_id':'debt-1','owner_ids':['person-1'],'balance':money(100000),'monthly_payment':money(101000),'principal_payment':money(100000),'valuation_on':'2026-12-31','share_numerator':'1','share_denominator':'1','value_basis':'SCOPE_SHARE','payment_basis':'SCOPE_SHARE'}]}})
            d['requested_outputs']=['OUT-03']
        got=self.run_case(modify)
        self.assertEqual(got['results']['OUT-03']['base_surplus']['value'],'2899000')
        self.assertEqual(got['results']['OUT-03']['calc_state'],'CALCULATED')
    def test_no_investment_wish_required(self):
        self.assertNotIn('NEW-07',{a['question_id'] for a in self.fixture['answers']})
        got=self.run_case();self.assertEqual(got['results']['OUT-05']['calc_state'],'CALCULATED')
    def test_total_outflow_matches_excluded_living(self):
        original=self.run_case()
        def modify(d):
            a=next(a for a in d['answers'] if a['question_id']=='F04')['raw_response']
            a.update(expense_basis='TOTAL_OUTFLOW',exclusions_confirmed=False,included_debt={'value':'0','state':'KNOWN','unit':'KRW','basis':'SCENARIO'},included_contributions={'value':'500000','state':'KNOWN','unit':'KRW','basis':'SCENARIO'})
            a['living']['value']='2500000'
        alternative=self.run_case(modify)
        # Compare financial payload, preserving distinct source audit responses separately.
        self.assertEqual(original['results'],alternative['results'])

    def test_unknown_inclusion_holds_cashflow_preserves_assets(self):
        def modify(d):
            a=next(a for a in d['answers'] if a['question_id']=='F04')['raw_response']
            a.update(expense_basis='TOTAL_OUTFLOW',exclusions_confirmed=False,included_debt={'value':None,'state':'UNKNOWN','unit':'KRW','basis':'SCENARIO'},included_contributions={'value':'500000','state':'KNOWN','unit':'KRW','basis':'SCENARIO'})
        got=self.run_case(modify)
        self.assertEqual(got['results']['OUT-03']['calc_state'],'NEEDS_INPUT')
        self.assertEqual(got['results']['OUT-05']['calc_state'],'NEEDS_INPUT')
        self.assertEqual(got['results']['OUT-02']['net_worth']['value'],'20000000')

if __name__=='__main__':unittest.main(verbosity=2)
