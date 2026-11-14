import { type Document, type Field, type State, type Json, field, fieldValue, list, object, record, revise, states } from "./model";
import { patchGoal, selectLifeStage, selectedMonth, setMonth, updateIncome } from "./customer-flow";

export type ChatCandidate = {field_ref:string; field:{question_id:string;field_id:string;label:string};state:State;raw_value:string|boolean|null;unit:string|null;source_text:string};
const kinds:Record<string,string>={
  "F03/monthly_net_income_krw":"MONEY","F03/income_period_start":"DATE","F03/income_period_end":"DATE",
  "F03/includes_one_off_income":"YES_NO","F04/living":"MONEY","F04/expense_basis":"EXPENSE_BASIS",
  "F04/included_debt":"MONEY","F04/included_contributions":"MONEY","F04/essential_living":"MONEY",
  "NEW-04/has_liabilities":"BOOLEAN","N01/owns_real_estate":"BOOLEAN","F06/financial_assets_total_reported_krw":"MONEY",
  "NEW-01/assessment_scope":"SCOPE","LIFE-01/life_stage_primary":"LIFE","F03/period_month":"MONTH","F04/period_month":"MONTH",
  "F11/goal_type":"GOAL","F12/target_date":"DATE","F13/target_amount_krw":"MONEY",
};
const enums:Record<string,string[]>={SCOPE:["personal"],LIFE:["LC_EARLY_CAREER","LC_NEWLYWED","LC_CHILDCARE","LC_SCHOOL_AGE","LC_CHILD_INDEPENDENCE","LC_RETIRED","LC_OTHER","LC_UNKNOWN"],GOAL:["HOUSING","EDUCATION","RETIREMENT","WEALTH"],YES_NO:["YES","NO"],EXPENSE_BASIS:["LIVING_ONLY","TOTAL_OUTFLOW"]};
const names:Record<string,string>={personal:"본인",HOUSING:"주거",EDUCATION:"자녀 교육",RETIREMENT:"은퇴",WEALTH:"장기 자산 형성",LIVING_ONLY:"생활비만",TOTAL_OUTFLOW:"전체 출금액",YES:"포함",NO:"미포함",LC_EARLY_CAREER:"사회초년",LC_NEWLYWED:"신혼",LC_CHILDCARE:"육아",LC_SCHOOL_AGE:"자녀 교육",LC_CHILD_INDEPENDENCE:"자녀 독립",LC_RETIRED:"은퇴",LC_OTHER:"기타",LC_UNKNOWN:"모름"};
export function validChatCandidate(c:ChatCandidate){
  if(!c||!kinds[c.field_ref]||c.field_ref!==`${c.field?.question_id}/${c.field?.field_id}`||!(c.state in states)||typeof c.source_text!=="string")return false;
  if(c.state!=="KNOWN")return c.raw_value===null;
  const kind=kinds[c.field_ref];
  if(kind==="MONEY")return typeof c.raw_value==="string"&&/^\d{1,40}(\.\d{1,4})?$/.test(c.raw_value)&&[null,"KRW","KRW_10000"].includes(c.unit);
  if(kind==="BOOLEAN")return typeof c.raw_value==="boolean"&&c.unit==="BOOLEAN";
  if(kind==="DATE")return typeof c.raw_value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(c.raw_value)&&c.unit==="DATE";
  if(kind==="MONTH")return typeof c.raw_value==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(c.raw_value)&&c.unit==="TEXT";
  return c.unit==="TEXT"&&enums[kind]?.includes(String(c.raw_value));
}
export function chatValue(v?:Field){return !v?"미입력":v.state!=="KNOWN"?states[v.state]:`${names[String(v.raw_value)]??(typeof v.raw_value==="boolean"?(v.raw_value?"있음":"없음"):String(v.raw_value))}${v.unit==="KRW"?"원":v.unit==="KRW_10000"?"만원":""}`;}
export function currentChatValue(doc:Document,ref:string):Field|undefined{
  const [q,f]=ref.split("/");
  if(f==="period_month")return field(selectedMonth(doc,q as "F03"|"F04")||null);
  if(q==="F11") {const goals=list(fieldValue(doc,q,"goals"));return goals.length===1?field(goals[0].type):undefined;}
  if(q==="F12"||q==="F13"){
    const goals=list(fieldValue(doc,"F11","goals"));if(goals.length!==1)return undefined;
    const goal=list(fieldValue(doc,q,"goals")).find(g=>g.goal_id===goals[0].goal_id);
    return q==="F12"?field(goal?.target_date??null,"DATE"):goal?.target_amount_krw as Field|undefined;
  }
  return record(doc,q)?.envelope.fields[f];
}
export function chatAnswers(doc:Document){return Object.keys(kinds).flatMap(field_ref=>{const v=currentChatValue(doc,field_ref);return v&&["string","boolean"].includes(typeof v.raw_value)||v?.raw_value===null?[{field_ref,state:v!.state,raw_value:v!.raw_value as string|boolean|null,unit:v!.unit}]:[];});}
export function canApplyChat(doc:Document,c:ChatCandidate){
  if(!validChatCandidate(c)||!c.unit)return false;
  if(c.field_ref==="NEW-01/assessment_scope")return true;
  if(doc.context.scope!=="personal"||doc.context.included_owner_ids.join()!=="person_self"||doc.scope_ref==="scope_unconfirmed")return false;
  if(["F12","F13"].includes(c.field.question_id))return list(fieldValue(doc,"F11","goals")).length===1;
  return true;
}
export function canApplyChatBatch(doc:Document,rows:ChatCandidate[]){
  const scope=rows.find(c=>c.field_ref==="NEW-01/assessment_scope");
  const basis=scope&&canApplyChat(doc,scope)?{...doc,scope_ref:"scope_personal",context:{...doc.context,scope:"personal",included_owner_ids:["person_self"]}}:doc;
  return rows.every(c=>canApplyChat(basis,c));
}
export function applyChat(doc:Document,c:ChatCandidate):Document{
  if(!canApplyChat(doc,c))throw Error("unconfirmed context");
  const q=c.field.question_id,f=c.field.field_id,v=field(c.raw_value,c.unit!,c.state);
  if(q==="NEW-01"){
    const next=revise(doc,q,e=>{e.fields.assessment_scope=field("personal");e.fields.scope_version=field("1.2.1");e.fields.included_owner_ids=field(["person_self"],"JSON");e.fields.scope_acknowledged=field(true,"BOOLEAN");e.fields.owner_confirmation_ref=field(`user:chat-scope:${new Date().toISOString()}`);e.context.scope_ref="scope_personal";});
    next.context.scope="personal";next.context.included_owner_ids=["person_self"];next.scope_ref="scope_personal";return next;
  }
  if(q==="LIFE-01")return selectLifeStage(doc,String(c.raw_value),true);
  if(f==="period_month")return setMonth(doc,q as "F03"|"F04",c.state==="KNOWN"?String(c.raw_value):"");
  if(q==="F11")return revise(doc,q,e=>{const goals=list(e.fields.goals?.raw_value);if(!goals.some(g=>g.type===c.raw_value))e.fields.goals=field([...goals,{goal_id:`goal-${crypto.randomUUID()}`,type:c.raw_value,priority:Math.max(0,...goals.map(g=>typeof g.priority==="number"?g.priority:0))+1,owner_refs:["person_self"],beneficiary_ref:"person_self",confirmed:true,question_version:"1.2"}],"JSON");});
  if(q==="F12"||q==="F13"){
    const gid=String(list(fieldValue(doc,"F11","goals"))[0].goal_id);
    return patchGoal(doc,q,gid,q==="F12"?{target_date:c.state==="KNOWN"?c.raw_value:""}:{target_amount_krw:v as unknown as Json,amount_status:c.state});
  }
  let next=q==="F03"?updateIncome(doc,f,v):revise(doc,q,e=>{e.fields[f]=v;if(q==="F04")e.fields.response_definition_version=field("1.2.1");});
  if(q==="F03"&&["income_period_start","income_period_end"].includes(f))next=revise(next,q,e=>{e.context[f.endsWith("start")?"period_start":"period_end"]=c.state==="KNOWN"?String(c.raw_value):null;});
  return next;
}
export function savedCase(source:unknown){return String(object(object(source).context).case_id??"");}
