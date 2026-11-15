import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {JudgeJourney} from '../../src/components/dion/judge-journey';
import {ScenarioPicker} from '../../src/components/dion/scenario-picker';
import {PlanCheckin, type AdoptionView} from '../../src/components/dion/plan-checkin';

function AdoptionFixture(){
  const [adoption,setAdoption]=useState<AdoptionView|null>(null);
  return <div className="dion-app"><main className="d-main"><p data-receipt>{adoption?.state??'LOADING'}</p><PlanCheckin
    view={{result:{},source:{},sourceSignature:'synthetic',localVersion:1,storage:'SAVED',runId:'run_fixture',isCurrent:true}}
    token="MOCK-FE-ONLY" caseId="case_fixture" plan="STABILITY_FIRST" tasks={[]} finalGenerated
    recordMonth="2026-10" onAdoption={setAdoption}/></main></div>;
}
createRoot(document.getElementById('root')!).render(location.pathname==='/dion/judge'?<JudgeJourney/>
  :location.pathname==='/adoption'?<AdoptionFixture/>:<div className="dion-app"><ScenarioPicker inline disabled={false} onLoad={()=>{}}/></div>);
