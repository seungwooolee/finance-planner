import {CalendarCheck, ChartPie, ClipboardList, Layers, UsersRound, Wallet} from "lucide-react";

const stages = [
  {label: "관계·범위", icon: UsersRound}, {label: "정보·목표", icon: ClipboardList},
  {label: "분석", icon: ChartPie}, {label: "제안·선택", icon: Layers},
  {label: "실행", icon: Wallet}, {label: "실적·사후점검", icon: CalendarCheck},
];

export function ConsultationJourney({active, canNavigate, onNavigate}: {active: number; canNavigate: boolean; onNavigate: (tab: number) => void}) {
  return <nav className="d-consultation-journey" aria-label="재무 상담 6단계">
    <ol>{stages.map(({label, icon: Icon}, i) => <li key={label} aria-current={active === i ? "step" : undefined}>
      {canNavigate && i > 2 ? <button type="button" aria-label={`${i+1}. ${label}`} onClick={() => onNavigate(i === 3 ? 2 : 4)}>
        <span className="d-stage-icon" aria-hidden="true"><Icon size={18}/></span><span className="d-stage-label"><small>0{i + 1}</small><strong>{label}</strong>{i === 3 && <em>검토 단계</em>}</span>
      </button> : <div><span className="d-stage-icon" aria-hidden="true"><Icon size={18}/></span><span className="d-stage-label"><small>0{i + 1}</small><strong>{label}</strong>{i === 3 && <em>검토 단계</em>}</span></div>}
    </li>)}</ol>
  </nav>;
}
