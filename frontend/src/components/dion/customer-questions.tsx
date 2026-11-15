"use client";

import { Baby, BookOpen, BriefcaseBusiness, Check, CircleHelp, Compass, Heart, Home, Landmark, Sprout, Sun, Users, Wallet, type LucideIcon } from "lucide-react";
import { Document, Field, Json, catalog, field, fieldValue, list, object, question, record, revise, textValue } from "@/lib/dion/model";
import { EARLY_WORKBOOK_CASE } from "@/lib/dion/workbook-scenario-targets";
import { goalName, patchGoal, reactivateGoal, retainGoals, selectLifeStage, selectedMonth, setMonth, updateIncome } from "@/lib/dion/customer-flow";
import { fieldKrw, formatKrw } from "@/lib/dion/money-format";
import { MoneyField } from "./fields";

type Props = { doc: Document; onChange: (doc: Document) => void };
const answer = (doc: Document, id: string, key: string, unit = "TEXT") => record(doc, id)?.envelope.fields[key] ?? field(null, unit);
const lifeIcons: Record<string, LucideIcon> = { LC_EARLY_CAREER: BriefcaseBusiness, LC_NEWLYWED: Heart, LC_CHILDCARE: Baby, LC_SCHOOL_AGE: BookOpen, LC_CHILD_INDEPENDENCE: Home, LC_RETIRED: Sun, LC_OTHER: Compass, LC_UNKNOWN: CircleHelp };

export function Choice({ selected, children, onClick }: { selected: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`d-choice ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick}>{children}<span className="d-radio" aria-hidden="true">{selected && <Check size={12} />}</span></button>;
}

export function SituationQuestion({ doc, onChange }: Props) {
  const members = [{ id: "person_spouse", label: "배우자" }, { id: "person_child", label: "자녀" }, { id: "person_parent", label: "부모님" }, { id: "person_other", label: "그 외 가족" }];
  const included = doc.context.included_owner_ids;
  const primary = fieldValue(doc, "LIFE-01", "life_stage_primary");
  const overlapValue = fieldValue(doc, "LIFE-01", "life_stage_overlaps");
  const stages = [primary, ...(Array.isArray(overlapValue) ? overlapValue : [])];
  const extras = included.filter(id => id !== "person_self" && !members.some(m => m.id === id)).map((id, i) => ({ id, label: `기존에 포함한 가족 ${i + 1}` }));
  function scope(code: string, owners: string[]) {
    const next = revise(doc, "NEW-01", e => {
      e.fields.assessment_scope = field(code);
      e.fields.scope_version = field("1.2.1");
      e.fields.included_owner_ids = field(owners, "JSON");
      e.fields.scope_acknowledged = field(code === "personal" ? true : null, "BOOLEAN");
      e.fields.owner_confirmation_ref = field(code === "personal" ? `user:scope-choice:${new Date().toISOString()}` : null);
      e.context.scope_ref = `scope_${code}`;
    });
    next.context.scope = code; next.context.included_owner_ids = owners; next.scope_ref = `scope_${code}`;
    onChange(next);
  }
  return <div className="d-question-content">
    <section className="d-question-section"><h2>누구의 돈을 함께 살펴볼까요?</h2><div className="d-choices d-grid-choices">
      <Choice selected={doc.context.scope === "personal"} onClick={() => scope("personal", ["person_self"])}><span className="d-icon-choice"><Wallet /><span><strong>나 혼자</strong><small>내 소득과 자산을 기준으로</small></span></span></Choice>
      <Choice selected={doc.context.scope === "household"} onClick={() => scope("household", included.length ? included : ["person_self"])}><span className="d-icon-choice"><Users /><span><strong>가족과 함께</strong><small>선택한 가족의 소득과 자산을 합쳐서</small></span></span></Choice>
    </div>
    {doc.context.scope === "household" && <fieldset className="d-inline-options"><legend>함께 포함할 가족을 골라주세요</legend><p>나는 기본으로 포함돼요. 이름을 적을 필요는 없어요.</p><div className="d-chips">{[...members, ...extras].map(m => <button type="button" key={m.id} aria-pressed={included.includes(m.id)} onClick={() => scope("household", included.includes(m.id) ? included.filter(id => id !== m.id) : [...included, m.id])}>{m.label}</button>)}</div></fieldset>}
    {doc.context.scope === "household" && <label className="d-check"><input type="checkbox" checked={fieldValue(doc, "NEW-01", "scope_acknowledged") === true} onChange={e => onChange(revise(doc, "NEW-01", r => {
      r.fields.scope_acknowledged = field(e.target.checked, "BOOLEAN");
      r.fields.owner_confirmation_ref = field(e.target.checked ? `user:scope:${new Date().toISOString()}` : null);
    }))} />선택한 가족의 동의를 받았고, 그 가족의 정보를 함께 입력할게요.</label>}
    </section>
    <section className="d-question-section" aria-labelledby="d-life-title"><h2 id="d-life-title">요즘 나의 생활은 어떤 모습인가요?</h2><p id="d-life-help">해당하는 모습을 모두 골라주세요. 선택한 것 중 지금 가장 중요한 생활단계 하나를 정할 수 있어요.</p><div className="d-life-options" role="group" aria-labelledby="d-life-title" aria-describedby="d-life-help">{catalog.lifeStages.map(stage => {
      const selected = stages.includes(stage.code);
      const Icon = lifeIcons[stage.code] ?? Compass;
      return <div className={`d-life-option ${selected ? "selected" : ""}`} key={stage.code}>
        <button type="button" className="d-life-select" aria-pressed={selected} onClick={() => onChange(selectLifeStage(doc, stage.code))}><i aria-hidden="true"><Icon size={24}/></i><span>{stage.label}</span></button>
        {selected && <button type="button" className="d-life-primary" aria-label={`${stage.label}를 주요 생활단계로 설정`} aria-pressed={primary === stage.code} onClick={() => onChange(selectLifeStage(doc, stage.code, true))}>{primary === stage.code ? "주요 생활단계" : "주요 생활단계로 설정"}</button>}
      </div>;
    })}</div>
    </section>
  </div>;
}

export function GoalsQuestion({ doc, onChange }: Props) {
  const goals = list(fieldValue(doc, "F11", "goals"));
  const options = question("F11").options.filter(o => o.code !== "GOAL_TYPE_07");
  const name = (g: Record<string, Json>) => goalName(g.type) ?? options.find(o => o.code === g.type)?.label ?? "이전에 입력한 목표";
  function remove(ids: string[]) {
    onChange(retainGoals(doc, ids));
  }
  function add(code: string) {
    const option = options.find(o => o.code === code)!;
    const existing = goals.find(g => g.type === code || goalName(g.type) === option.label);
    if (existing) return; // Remove only through the explicit card action; retain amount/date/ID.
    const archived=list(fieldValue(doc,"F11","inactive_goals")).find(item=>{const g=object(item.goal);return g.type===code||goalName(g.type)===option.label;});
    if(archived){onChange(reactivateGoal(doc,String(archived.goal_id)));return;}
    const next = revise(doc, "F11", e => {
      const owner = doc.context.included_owner_ids[0] || "person_self";
      e.fields.goals = field([...goals, { goal_id: `goal-${crypto.randomUUID()}`, type: code, priority: Math.max(0, ...goals.map(g => typeof g.priority === "number" ? g.priority : 0)) + 1, owner_refs: [owner], beneficiary_ref: owner, confirmed: true, question_version: "1.2" }], "JSON");
    });
    onChange(next);
  }
  return <div className="d-question-content">
    <div className="d-goal-options">{options.map((option, i) => {
      const selected = goals.some(g => g.type === option.code || goalName(g.type) === option.label);
      const Icon = [Sprout, Home, Landmark, Users][i % 4];
      return <button type="button" key={option.code} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => add(option.code)}><Icon size={22} /><span>{option.label}</span>{selected && <Check size={16} />}</button>;
    })}</div>
    <div className="d-goal-neutral"><button type="button" aria-pressed={answer(doc, "F11", "goals").state === "KNOWN" && goals.length === 0} onClick={() => remove([])}>지금은 목표 없음</button><button type="button" aria-pressed={answer(doc, "F11", "goals").state === "UNKNOWN"} onClick={() => {
      onChange(revise(retainGoals(doc,[]), "F11", e => { e.fields.goals = field(null, "JSON", "UNKNOWN"); }));
    }}>아직 생각 중이에요</button></div>

    {goals.map((g, i) => {
      const gid = String(g.goal_id), timing = list(fieldValue(doc, "F12", "goals")).find(r => r.goal_id === gid) ?? {};
      const amount = list(fieldValue(doc, "F13", "goals")).find(r => r.goal_id === gid) ?? {};
      const special = ["GOAL_TYPE_03", "GOAL_V12_INHERITANCE", "RETIREMENT"].includes(String(g.type));
      return <section className="d-goal-card" key={gid} aria-label={`${name(g)} 목표`}><div className="d-goal-card-heading"><div><span>{i === 0 ? "가장 먼저 준비할 목표" : `함께 준비할 목표 ${i + 1}`}</span><h2>{name(g)}</h2></div><button type="button" className="d-text-button" aria-label={`${name(g)} 목표 삭제`} onClick={() => remove(goals.filter(r => r.goal_id !== gid).map(r => String(r.goal_id)))}>목표 삭제</button></div>
        {doc.context.case_id === EARLY_WORKBOOK_CASE && g.type === "WEALTH" && amount.payment_type === "" ?
          <dl className="d-ledger"><div><dt>모을 자산</dt><dd>{formatKrw(fieldKrw(amount.target_amount_krw as unknown as Field))}</dd></div>
            <div><dt>목표 기한</dt><dd>{textValue(timing.target_date)}</dd></div></dl>
        : special ? <p className="d-note">목표로 기록해 둘게요. {g.type === "GOAL_V12_INHERITANCE" ? "상속" : "은퇴"}에 필요한 별도 계산은 아직 준비 중이에요.</p> : amount.payment_type === "RECURRING" ? <section className="d-note" role="status"><p>이전에 매달 쓰는 돈으로 입력한 목표예요. 내용은 보관하지만 현재 목표 계산에는 반영하지 않아요.</p><p>저장한 월 금액: {formatKrw(fieldKrw((amount.target_amount_krw as unknown as Field) ?? field(null, "KRW_10000")))} · 기간: {textValue(amount.payment_start) || "미입력"} ~ {textValue(amount.payment_end) || "미입력"}</p><p>필요하면 ‘목표 삭제’로 이번 진단에서 제외할 수 있어요. 기존 생활비에 포함된 돈을 다시 지출로 더하지 않아요.</p></section> : <>
          <div className="d-goal-plan-fields"><div className="d-goal-amount"><MoneyField label="한 번에 필요한 목표 금액" value={(amount.target_amount_krw as unknown as Field) ?? field(null, "KRW_10000")} onChange={v => onChange(patchGoal(doc, "F13", gid, { target_amount_krw: v as unknown as Json, amount_status: v.state }))} /><p>한 번에 쓸 목돈을 준비하는 목표예요. 매달 나가는 생활비는 ‘한 달 지출’에서 적어주세요.</p></div>
          <div className="d-goal-timing"><label className="d-field">언제쯤 필요해요?<input type="month" value={textValue(timing.target_date).slice(0,7)} onChange={e => {
            const date=e.target.value ? `${e.target.value}-01` : "";
            let next=patchGoal(doc,"F12",gid,{target_date:date,target_date_status:date?"KNOWN":"NOT_ENTERED",date_precision:"MONTH"});
            if(amount.payment_type==="ONE_OFF") next=patchGoal(next,"F13",gid,{payment_start:date,payment_end:date,...(amount.price_basis==="FUTURE_NOMINAL"?{price_base_date:date}:{})});
            onChange(next);
          }}/><small>월만 정하면 해당 월 1일까지 준비하는 기준이에요. 기존에 저장한 정확한 날짜는 다시 선택하기 전까지 유지해요.</small></label><label className="d-check"><input type="checkbox" checked={timing.target_date_status==="UNKNOWN"} onChange={e=>{
            let next=patchGoal(doc,"F12",gid,{target_date:"",target_date_status:e.target.checked?"UNKNOWN":"NOT_ENTERED"});
            if(amount.payment_type==="ONE_OFF") next=patchGoal(next,"F13",gid,{payment_start:"",payment_end:"",...(amount.price_basis==="FUTURE_NOMINAL"?{price_base_date:""}:{})});
            onChange(next);
          }}/>아직 미정</label></div></div>
          <p className="d-goal-date-note">날짜가 미정이어도 재무현황은 볼 수 있어요. 매달 얼마를 모아야 할지는 날짜를 정한 뒤 확인할 수 있어요.</p>
          <label className="d-check"><input type="checkbox" checked={amount.payment_type === "ONE_OFF" && amount.price_basis === "FUTURE_NOMINAL"} onChange={e => onChange(patchGoal(doc, "F13", gid, e.target.checked ? { payment_type: "ONE_OFF", frequency: "ONCE", payment_start: textValue(timing.target_date), payment_end: textValue(timing.target_date), price_basis: "FUTURE_NOMINAL", price_base_date: textValue(timing.target_date) } : { price_basis: "", price_base_date: "" }))} />위 금액은 그때 한 번에 쓸 목돈의 예상 금액이에요.</label>
        </>}
      </section>;
    })}
    {!goals.length && <p className="d-help">목표가 없어도 지금의 소득과 지출부터 살펴볼 수 있어요.</p>}
  </div>;
}

export function IncomeQuestion({ doc, onChange }: Props) {
  const month = selectedMonth(doc, "F03"), priorStart = textValue(fieldValue(doc, "F03", "income_period_start"));
  return <div className="d-question-content">
    <div className="d-answer-surface"><MoneyField label={doc.context.scope === "household" ? "가족의 한 달 소득" : "한 달 평균 세후 소득은 얼마인가요?"} value={answer(doc, "F03", "monthly_net_income_krw", "KRW_10000")} onChange={v => onChange(updateIncome(doc, "monthly_net_income_krw", v))} />
      <p>통장에 들어오는 실수령액을 적어주세요. 불규칙 소득은 최근 3~6개월 평균을 참고하세요. 받는 돈이 없다면 0, 모르겠다면 나중에 입력을 선택해주세요.</p>
    </div>
    <label className="d-field d-month-field">소득 기준월<input type="month" aria-label="소득 기준월" value={month} max={doc.context.evaluation_on.slice(0, 7)} onChange={e => onChange(setMonth(doc, "F03", e.target.value))} /><small>월 잔여금을 계산하려면 소득과 지출의 기준월이 필요해요.</small></label>
    {!month && priorStart && <p className="d-note">이전에 정한 기간 {priorStart} ~ {textValue(fieldValue(doc, "F03", "income_period_end"))}을 유지하고 있어요. 월을 다시 고르면 그 달 기준으로 바뀌어요.</p>}
    <section className="d-question-section"><h2>상여금·선물처럼 이번에만 받은 돈이 포함됐나요?</h2><div className="d-choices d-grid-choices">{[["NO", "평소 받는 돈만 적었어요"], ["YES", "이번에만 받은 돈도 있어요"]].map(([code, label]) => <Choice key={code} selected={fieldValue(doc, "F03", "includes_one_off_income") === code} onClick={() => onChange(revise(doc, "F03", e => { e.fields.includes_one_off_income = field(code); if (code === "NO" && e.fields.one_off_income_krw) e.fields.one_off_income_krw = field(null, e.fields.one_off_income_krw.unit, "NOT_APPLICABLE"); }))}><span>{label}</span></Choice>)}</div><button type="button" className="d-text-button" onClick={() => onChange(updateIncome(doc, "includes_one_off_income", field("UNKNOWN")))}>확인한 뒤 답할게요</button>{fieldValue(doc, "F03", "includes_one_off_income") === "YES" && <div className="d-answer-surface d-one-off"><MoneyField label="그중 이번에만 받은 돈" value={answer(doc, "F03", "one_off_income_krw", "KRW_10000")} onChange={v => onChange(revise(doc, "F03", e => { e.fields.one_off_income_krw = v; e.fields.one_off_definition_version = field("DION-ONE-OFF-INPUT-1.0"); }))} /><p>위에 적은 한 달 소득에 포함된 금액이에요. 다시 더하지 않아요.</p><p>이번 소득은 따로 기록해요. 이후 달의 소득 가정은 다시 확인해야 해요.</p></div>}</section>
  </div>;
}

export function ExpenseQuestion({ doc, onChange }: Props) {
  const basis = fieldValue(doc, "F04", "expense_basis");
  const change = (key: string, value: Field) => onChange(revise(doc, "F04", e => { e.fields[key] = value; e.fields.response_definition_version = field("1.2.1"); }));
  const money = (key: string, label: string) => <MoneyField label={label} value={answer(doc, "F04", key, "KRW_10000")} onChange={v => change(key, v)} />;
  const incomeMonth = selectedMonth(doc, "F03"), expenseMonth = selectedMonth(doc, "F04");
  return <div className="d-question-content">
    <div className="d-choices d-grid-choices">{[["LIVING_ONLY", "생활비만 입력할게요", "식비·교통비·주거비 등 · 대출 상환·저축·투자 이체 제외"], ["TOTAL_OUTFLOW", "상환·저축까지 합친 전체 금액을 입력할게요", "생활비 + 대출·할부 상환 + 저축·투자 이체"]].map(([code, label, help]) => <Choice key={code} selected={basis === code} onClick={() => onChange(revise(doc, "F04", e => { e.fields.expense_basis = field(code); e.fields.exclusions_confirmed = field(null, "BOOLEAN"); e.fields.response_definition_version = field("1.2.1"); }))}><span><strong>{label}</strong><small>{help}</small></span></Choice>)}</div>
    <div className="d-answer-surface">{money("living", basis === "TOTAL_OUTFLOW" ? "한 달 생활비·상환·저축을 합친 전체 금액" : "한 달 평균 생활비는 얼마인가요?")}</div>
    {basis === "LIVING_ONLY" && <label className="d-check"><input type="checkbox" checked={fieldValue(doc, "F04", "exclusions_confirmed") === true} onChange={e => onChange(revise(doc, "F04", r => { r.fields.exclusions_confirmed = field(e.target.checked, "BOOLEAN"); for (const key of ["included_debt", "included_contributions"]) r.fields[key] = field(e.target.checked ? "0" : null, "KRW_10000"); }))} />대출 갚는 돈과 저축·투자 이체액은 뺀 금액이에요.</label>}
    {basis === "TOTAL_OUTFLOW" && <section className="d-question-section d-answer-surface"><h2>그중 아래 금액은 얼마였나요?</h2><p>생활비에서 중복으로 세지 않도록 따로 확인해요. 포함하지 않았다면 0을 적어주세요.</p><div className="d-fields">{money("included_debt", "그중 대출·할부 갚은 돈")}{money("included_contributions", "그중 저축·투자로 옮긴 돈")}</div><label className="d-check"><input type="checkbox" checked={fieldValue(doc, "F04", "exclusions_confirmed") === false} onChange={e => change("exclusions_confirmed", field(e.target.checked ? false : null, "BOOLEAN"))} />전체 금액에 포함된 상환액과 이체액을 나눠 적었어요.</label></section>}
    <p>{basis === "TOTAL_OUTFLOW" ? "위 전체 금액에서 대출 상환과 저축·투자 이체액을 구분해 생활비를 확인해요. 같은 돈을 두 번 빼지 않아요." : "생활비는 식비·교통비·주거비 등 평소 쓰는 돈이에요. 대출 상환과 저축·투자 이체액은 빼고 적어주세요."}</p><section className="d-question-section d-answer-surface"><h2>지출 기준월</h2>{incomeMonth && <label className="d-check"><input type="checkbox" checked={expenseMonth === incomeMonth} onChange={e => onChange(setMonth(doc, "F04", e.target.checked ? incomeMonth : ""))} />소득과 같은 {incomeMonth.replace("-", "년 ")}월이에요.</label>}<details className="d-optional" open={!expenseMonth || expenseMonth !== incomeMonth}><summary>다른 달의 지출이에요</summary><label className="d-field">지출 기준월<input type="month" max={doc.context.evaluation_on.slice(0, 7)} value={expenseMonth} onChange={e => onChange(setMonth(doc, "F04", e.target.value))} /></label></details>{expenseMonth && incomeMonth && expenseMonth !== incomeMonth && <p className="d-note">월 잔여금은 소득과 지출의 기준월을 맞춘 뒤 계산할 수 있어요.</p>}</section>
    {!expenseMonth && textValue(fieldValue(doc,"F04","period_start")) && <p className="d-note">이전에 정한 기간 {textValue(fieldValue(doc,"F04","period_start"))} ~ {textValue(fieldValue(doc,"F04","period_end"))}을 유지하고 있어요. 월을 다시 고르면 그 달 기준으로 바뀌어요.</p>}
    <details className="d-optional"><summary>꼭 필요한 생활비도 구분할게요</summary><p>식비·주거비처럼 줄이기 어려운 생활비예요. 대출 상환과 저축이체는 제외해 주세요.</p>{money("essential_living", "그중 꼭 필요한 생활비")}</details>
  </div>;
}

export function AssetCompleteness({ doc, onChange }: Props) {
  const value = fieldValue(doc, "NEW-01", "asset_coverage");
  return <section className="d-question-section"><h2>아직 적지 않은 자산이 있나요?</h2><p>집·보증금을 포함해 빠진 자산이 있으면 전체 합계는 나중에 확인해요.</p><div className="d-choices">{[["complete", "빠진 자산 없이 모두 확인했어요"], ["partial", "아직 확인할 자산이 있어요"]].map(([code, label]) => <Choice key={code} selected={value === code} onClick={() => onChange(revise(doc, "NEW-01", e => { e.fields.asset_coverage = field(code); }))}><span>{label}</span></Choice>)}</div></section>;
}
