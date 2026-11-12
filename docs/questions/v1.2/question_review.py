"""Owned question-contract reference checks. Not a production API/DB adapter."""
from pathlib import Path
from decimal import Decimal
import json
import copy

HERE=Path(__file__).resolve().parent
CONTRACT=json.loads((HERE/'DION_Adaptive_Question_Contract_v1_2.json').read_text())
FIELDS=CONTRACT['field_registry']
STATES={s['raw_state']:s for s in CONTRACT['state_mapping']}

def revise_answer(old,new_raw,new_version,source_ref):
    """Caller must have reconfirmed changed meaning. Append revision, never mutate history."""
    if not source_ref:raise ValueError('source_ref required')
    new=copy.deepcopy(old)
    new.update(revision=old['revision']+1,definition_version=new_version,raw_response=copy.deepcopy(new_raw),source_ref=source_ref,supersedes_ref=old['answer_id']+'@'+str(old['revision']))
    return [copy.deepcopy(old),new]

def normalize_state(raw):
    if raw is None:return None
    state=raw['state'];m=STATES[state]
    if state=='ABSENT_RECORD':raise ValueError('absent is not a stored state')
    value=raw.get('value')
    if state!='KNOWN' and value is not None:raise ValueError('unknown value must be null')
    if state=='KNOWN':
        if not isinstance(value,str):raise ValueError('exact decimal string required')
        n=Decimal(value)*(10000 if raw['unit']=='KRW_10000' else 1)
        if raw['unit'] not in ['KRW','KRW_10000'] or not n.is_finite() or n<0 or n!=n.to_integral():raise ValueError('invalid money')
        value=str(int(n))
    out={'state':m['engine_state'],'value':value,'unit':'KRW','basis':raw.get('basis','USER_REPORTED')}
    if m['omission_reason']:out['omission_reason']=m['omission_reason']
    return {'engine_value':out,'original':dict(raw)}

def debt_check(balance,principal,interest,fees,total,*,timing='BEFORE_PAYMENT',same_reference=True,components_complete=True):
    """Amounts already exact integer KRW or None. Store raw even when comparison holds."""
    values=[balance,principal,interest,fees,total]
    if any(v is not None and (type(v)!=int or v<0) for v in values):raise ValueError('nonnegative integer required')
    errors=[];holds=[]
    if components_complete and None not in [principal,interest,fees,total]:
        if total!=principal+interest+fees:errors.append('COMPONENT_SUM_MISMATCH')
    elif components_complete:holds.append('COMPONENT_UNKNOWN')
    if None not in [principal,balance]:
        if timing=='BEFORE_PAYMENT' and same_reference:
            if principal>balance:errors.append('PRINCIPAL_EXCEEDS_OPENING_BALANCE')
        else:holds.append('PRINCIPAL_REFERENCE_NOT_COMPARABLE')
    if total is None:holds.append('PAYMENT_UNKNOWN')
    return {'status':'INVALID' if errors else 'NEEDS_INPUT' if holds else 'VALID','errors':errors,'holds':holds,'cash_payment_krw':total,'raw_preservable':True}

def normalized_living(amount,basis,excluded=None,included_debt=None,included_contributions=None):
    if amount is None:return None
    if basis=='LIVING_ONLY':return amount if excluded is True else None
    if basis!='TOTAL_OUTFLOW':raise ValueError('expense basis')
    if included_debt is None or included_contributions is None:return None
    result=amount-included_debt-included_contributions
    if result<0:raise ValueError('included amount exceeds outflow')
    return result

def reserve_targets(essential,debt,mode,protection=None,operating=None,current_operating=None):
    policy='DION-ALLOCATION-1.0'
    if essential is None or debt is None:return {'policy':policy,'status':'NEEDS_INPUT'}
    b=essential+debt;minimum=(3*b,b)
    if mode=='POLICY_ONLY':customer=(0,0)
    elif mode in ['TOTAL_TARGET','EXTRA_ABOVE_MINIMUM'] and protection is not None and operating is not None:
        customer=(protection,operating) if mode=='TOTAL_TARGET' else (minimum[0]+protection,minimum[1]+operating)
    else:return {'policy':policy,'minimum':minimum,'status':'NEEDS_INPUT'}
    final=tuple(max(a,c) for a,c in zip(minimum,customer))
    return {'policy':policy,'minimum':minimum,'customer_total':customer,'final':final,'current_operating':current_operating,'H':None if current_operating is None else max(final[1]-current_operating,0),'status':'CALCULATED' if current_operating is not None else 'NEEDS_INPUT'}

def fact_key(f,case,entity='case'):
    # Deliberately do not merge questionID/persistentID/EXT. Entity refs carry ownership.
    return '|'.join([f['id'],case['owner'],case['period'],entity,f['definition_version']])

def visible_fields(case,cache=None):
    cache=cache or {};mode=case['mode'];flags=case.get('flags',[])
    selected=[];reused=[];deferred=[]
    initial=mode=='quick'
    for f in FIELDS:
        cond=f['when']
        show=(cond=='always' and (not initial or f['question_id'] in CONTRACT['quick_card_ids'])) or (cond=='quick' and initial) or cond in flags
        if cond=='detailed':show=not initial
        if cond=='asset_detail':show=not initial and case.get('asset_detail',True)
        if cond=='inactive_consumer':show=False
        if not show:continue
        entities=case.get('entities',{}).get(f['repeat_group'],[]) if f['repeat_group'] else ['case']
        for entity in entities:
            key=fact_key(f,case,entity);item={**f,'entity':entity,'fact_key':key}
            known=cache.get(key)
            if known and known.get('source_ref') and known['state']=='KNOWN':reused.append(item)
            elif known and known['state'] in ['UNKNOWN','DEFERRED','DECLINED']:deferred.append(item)
            else:selected.append(item)
    assert len({i['fact_key'] for i in selected})==len(selected)
    # A fact is one semantic input. Amount editor has state + value controls.
    groups={i['repeat_group'] for i in selected if i['repeat_group']}
    return {'visible':selected,'reused':reused,'deferred':deferred,'counts':{
        'visible_fact_fields':len(selected),'known_amount_editor_controls':sum(2 if f['type']=='amount' else 1 for f in selected),
        'repeated_groups':len(groups),'repeated_entity_rows':len({(i['repeat_group'],i['entity']) for i in selected if i['repeat_group']}),
        'reused_fact_fields':len(reused),'deferred_fact_fields':len(deferred),'duplicate_fact_requests':0,
        'evidence_lookup_candidates':sum(i['type'] in ['date','refs'] and i['usage']=='CALC_INPUT' for i in selected)}}

def fixtures():
    common={'owner':'self:a','period':'2026-10-01/2026-10-31','entities':{'assets':['cash:a'],'reservations':['cash:a:operating'],'goals':['education:a'],'debts':['debt:a'],'contributions':['saving:a'],'pensions':['pension:a'],'debt_schedule':['debt:a/2026-11','debt:a/2026-12','debt:a/2027-01']}}
    fast={**common,'id':'QUICK','mode':'quick','flags':['living_only']}
    deep={**common,'id':'DEEP_DIRECT','mode':'deep','flags':['living_only','complete_assets','monthly_candidate','has_goals','has_debt','has_contributions','extra_targets','monthly_contributions','debt_projection']}
    overlap={**deep,'id':'OVERLAP','stages':['LC_SCHOOL_AGE','LC_RETIRED'],'flags':deep['flags']+['overlap','education_goal','pension_review']}
    total={**deep,'id':'TOTAL_OUTFLOW','flags':[f for f in deep['flags'] if f!='living_only']+['total_outflow','debt_breakdown']}
    multiple={**total,'id':'TWO_DEBTS_TWO_GOALS','entities':{**common['entities'],'debts':['debt:a','debt:b'],'goals':['education:a','housing:a'],'debt_schedule':common['entities']['debt_schedule']+['debt:b/2026-11','debt:b/2026-12','debt:b/2027-01']}}
    return [fast,deep,overlap,total,multiple]

def burden_report():
    cases=fixtures();reports=[]
    for case in cases:
        plan=visible_fields(case);reports.append({'path':case['id'],'fixture':case,'counts':plan['counts'],'visible_field_refs':[i['fact_key'] for i in plan['visible']]})
    quick=visible_fields(cases[0]);cache={i['fact_key']:{'state':'KNOWN','source_ref':'fixture:confirmed'} for i in quick['visible']}
    for case,name in [(cases[1],'QUICK_TO_DEEP'),(cases[2],'QUICK_TO_OVERLAP')]:
        plan=visible_fields(case,cache);reports.append({'path':name,'counts':plan['counts'],'visible_field_refs':[i['fact_key'] for i in plan['visible']]})
    return {'scope':CONTRACT['field_registry_scope'],'measurement':'semantic fact fields including labeled composite ownership/scenario confirmations; editor controls assuming KNOWN amounts; no elapsed-time measurement','paths':reports}

if __name__=='__main__':
    report=burden_report();(HERE/'path_burden.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({r['path']:r['counts'] for r in report['paths']},ensure_ascii=False))
