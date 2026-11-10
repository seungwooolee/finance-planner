import { Document, Json, fieldValue, list, object, record } from "./model";
import { copy, customerStep } from "./customer-flow";

export type InputHint={id:string;text:string};
export function inputHints(doc:Document):InputHint[] {
  const hints:InputHint[]=[];
  if(!doc.context.scope||!doc.context.included_owner_ids.length||fieldValue(doc,"NEW-01","scope_acknowledged")!==true) hints.push({id:"NEW-01",text:"살펴볼 사람과 가족의 동의 여부를 먼저 확인해주세요."});
  if(!fieldValue(doc,"NEW-01","asset_coverage")) hints.push({id:"F06",text:"아직 확인할 자산이 있는지 선택해주세요. 자산이 일부만 확인돼도 다른 결과부터 살펴볼 수 있어요."});
  for(const [id,key,label] of [["F03","monthly_net_income_krw","소득"],["F04","living","지출"]]) {
    const f=record(doc,id)?.envelope.fields[key];
    if(!f||f.state!=="KNOWN") hints.push({id,text:`${label} 금액을 아직 확인하지 못했어요. 이 금액을 사용하는 결과만 보류해요. 실제로 없다면 0을 입력해주세요.`});
  }
  if(!fieldValue(doc,"F03","income_period_start")||!fieldValue(doc,"F04","period_start")||fieldValue(doc,"F03","income_period_start")!==fieldValue(doc,"F04","period_start"))hints.push({id:"F04",text:"소득과 지출을 같은 기준월로 맞춰주세요."});
  if(!fieldValue(doc,"F04","expense_basis"))hints.push({id:"F04",text:"생활비만 적었는지, 상환·저축이체를 포함한 전체출금인지 선택해주세요."});
  return hints;
}

export function resultHints(result:Record<string,Json>,doc:Document|null):InputHint[] {
  const hints=doc?inputHints(doc):[];
  const outputs=object(result.results);
  const issues=list(object(result.adapter).issues).filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.length&&i.code!=="NOT_SUPPORTED");
  const ids=[...issues.map(i=>String(i.question_id)),...(Array.isArray(result.next_question_ids)?result.next_question_ids.map(String):[])];
  const noGoals=doc&&record(doc,"F11")?.envelope.fields.goals?.state==="KNOWN"&&!list(fieldValue(doc,"F11","goals")).length;
  for(const id of ids) {
    if(noGoals&&["F11","F12","F13"].includes(id))continue;
    const target=id==="NEW-01"&&doc&&fieldValue(doc,"NEW-01","scope_acknowledged")===true?"F06":customerStep(id);
    if(!copy[target])continue;
    if(hints.some(h=>h.id===target))continue;
    const text=target==="NEW-02"?"월별 후보를 비교하려면 앞으로의 소득과 적용 기간을 확인해주세요.":target==="F06"?"자산별 금액·소유자·계좌와 확인 범위를 점검해주세요.":target==="F09+F10+D08"?"상환 원금·이자·비용과 기준월을 확인해주세요.":`${copy[target].nav}의 미확인 값과 기간을 확인해주세요.`;
    hints.push({id:target,text});
  }
  if(!hints.length&&["NEEDS_INPUT","PARTIAL"].includes(String(object(outputs["OUT-05"]).calc_state)))hints.push({id:"ASSUMPTIONS",text:"두 월별 후보에 필요한 추가 확인이 남아 있어요. 현재 현황 결과는 그대로 볼 수 있어요."});
  return hints;
}
