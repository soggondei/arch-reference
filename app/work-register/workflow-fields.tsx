'use client';

import { useState } from 'react';
import {
  applies, fieldOptions, journey, needsStageChoice, routeName, occupancyApprovalGuidance,
  facilityGroupGuidance, workLabels, type Blueprint, type CaseData, type WorkDetails, type WorkField,
} from '@/lib/work-register';

function RoutePreview({blueprint,details,stage}:{blueprint:Blueprint;details:WorkDetails;stage?:string}) {
  const path=journey(blueprint,details);
  const checks=blueprint.checks.filter(v=>applies(v,blueprint,details));
  const docs=blueprint.docs.filter(v=>applies(v,blueprint,details));
  const labels=workLabels(blueprint);
  return <section className="route-preview" aria-label="선택한 업무의 진행 경로" aria-live="polite">
    <h3>진행 경로 {routeName(blueprint,details) && <small>{routeName(blueprint,details)}</small>}</h3>
    <ol>{path.stages.map(s=><li key={s} aria-current={s===stage?'step':undefined}>{s}</li>)}</ol>
    {path.finish && <p>{path.finish}</p>}
    <details><summary>{labels.checks} {checks.length}개 · {labels.docs} {docs.length}개</summary>
      <div className="preview-lists"><div><strong>{labels.checks}</strong><ul>{checks.map(v=><li key={v.id}>{v.name}</li>)}</ul></div>
        <div><strong>{labels.docs}</strong><ul>{docs.map(v=><li key={v.id}>{v.name}</li>)}</ul></div></div>
    </details>
  </section>;
}

function FlowInput({spec,value,onChange}:{spec:WorkField;value:string;onChange:(value:string)=>void}) {
  const name='wf.'+spec.key, options=fieldOptions(spec);
  if(options) return <label>{spec.label}<select name={name} value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">미정</option>{options.map(o=><option key={o}>{o}</option>)}
  </select></label>;
  if(spec.type==='note') return <label className="wide">{spec.label}<textarea name={name} value={value} maxLength={2000} onChange={e=>onChange(e.target.value)}/></label>;
  return <label>{spec.label}<input type="text" inputMode={spec.type==='area'?'decimal':undefined} name={name} maxLength={spec.type==='area'?16:240} value={value} onChange={e=>onChange(e.target.value)}/></label>;
}

export function WorkflowFields({blueprint,record}:{blueprint:Blueprint;record?:CaseData}) {
  const [draft,setDraft]=useState<WorkDetails>(()=>({...record?.details}));
  const w=blueprint.workflow;
  const advice=w?.kind==='use' ? [facilityGroupGuidance(draft),occupancyApprovalGuidance(draft)].filter(Boolean) : [];
  const stageChoice=record && needsStageChoice(blueprint,record.details||{},draft,record.stage);
  return <div className="workflow-fields wide">
    <h3>{blueprint.name} 업무 설정</h3>
    <p>{blueprint.description}</p>
    {w && <div className="regform">{w.fields.filter(s=>applies(s,blueprint,draft)).map(s=>
      <FlowInput key={s.key} spec={s} value={draft[s.key]||''} onChange={value=>setDraft(old=>({...old,[s.key]:value}))}/>
    )}</div>}
    {advice.length>0 && <aside className="flow-advice"><strong>입력값에 따른 1차 검토</strong>{advice.map(a=><p key={a}>{a}</p>)}<p>최종 판단은 세부 용도와 적용 근거를 확인한 뒤 기록하세요.</p></aside>}
    {stageChoice && <label className="stage-choice">새 경로에서 이어갈 단계
      <select key={journey(blueprint,draft).stages.join('|')} name="routeStage" required defaultValue=""><option value="">단계 선택</option>{journey(blueprint,draft).stages.map(s=><option key={s}>{s}</option>)}</select>
      <small>현재 단계 ‘{record.stage}’를 마치고 이어갈 위치를 선택하면 경로 변경 이력이 함께 저장됩니다.</small>
    </label>}
    <RoutePreview blueprint={blueprint} details={draft} stage={record?.stage}/>
    {!!w?.links.length && <div className="flow-links">{w.links.map(l=><a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.name}</a>)}</div>}
  </div>;
}

export function TemplatePreview({blueprint,onCopy}:{blueprint:Blueprint;onCopy:(b:Blueprint)=>void}) {
  const [details,setDetails]=useState<WorkDetails>({});
  const w=blueprint.workflow;
  const selectors=w?.fields.filter(f=>f.key===w.route?.key || Object.values(w.conditions||{}).some(c=>c.field===f.key))||[];
  const path=journey(blueprint,details);
  const copy=()=>onCopy({...blueprint,workflow:undefined,checks:blueprint.checks.filter(v=>applies(v,blueprint,details)),
    docs:blueprint.docs.filter(v=>applies(v,blueprint,details)),stages:path.stages,events:path.events,terminal:blueprint.terminal.filter(s=>path.stages.includes(s))});
  return <details className="template-preview"><summary>진행 경로 보기·복제</summary><div className="regform">
    {selectors.filter(f=>applies(f,blueprint,details)).map(f=><FlowInput key={f.key} spec={f} value={details[f.key]||''} onChange={value=>setDetails(d=>({...d,[f.key]:value}))}/>)}
    </div><RoutePreview blueprint={blueprint} details={details}/><button type="button" onClick={copy}>표시된 단계·항목으로 사무소 양식 만들기</button></details>;
}
