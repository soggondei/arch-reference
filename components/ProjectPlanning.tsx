'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { durationLabel } from '@/lib/weekly-report';
import { projectHref } from '@/lib/workspace-navigation';
import { ProjectColorDot } from './ProjectColorPicker';
import { phaseSummary, phasesFor, suggestedPhase, type Closeout, type Outcome, type PlanningChange } from '@/lib/project-planning';
import type { CompetitionData, ProjectActivityChange, Reference, WorkLog } from '@/lib/types';
import styles from './ProjectPlanning.module.css';

type Props = {
  project: Reference; today: string;
  relatedProjects?: Reference[];
  shared: {logs: WorkLog[]; loading: boolean; error?: string | null; retry: () => void};
  onActivity: (projectId: string, change: ProjectActivityChange) => Promise<void>;
};
type Editor = {kind:'plan'} | {kind:'phase'} | {kind:'review'; id:string; original?:Closeout};
type Save = (edit: PlanningChange['edit']) => Promise<void>;

function message(error: unknown) {
  return error instanceof Error && /[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다. 다시 시도해 주세요.';
}
function formatBudget(minutes?:number) {
  if (minutes === undefined) return '';
  const hours=Math.floor(minutes/60), rest=minutes%60;
  return rest ? hours + ':' + String(rest).padStart(2,'0') : String(hours);
}
function parseBudget(raw:string) {
  if (!raw) return undefined;
  if (!/^\d{1,6}(:[0-5]\d)?$/.test(raw)) throw new Error('예상시간은 8 또는 1:30 형식으로 입력해 주세요.');
  const [hours,mins] = raw.split(':').map(Number);
  return hours*60+(mins??0);
}

function PlanEditor({data,logs,save,cancel}: {data:CompetitionData;logs: WorkLog[];save:Save;cancel:()=>void}) {
  // Keep the opened form's original values for per-field conflict detection.
  const [initial]=useState(data);
  const [historical]=useState(logs);
  const phases=phasesFor(initial);
  const tasks=new Map((initial.schedules??[]).map(t => [t.id,t.taskName]));
  for (const log of [...(initial.workLogs??[]),...historical]) if (!tasks.has(log.taskId)) tasks.set(log.taskId,log.taskName);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(lock.current)return;
    const fields=new FormData(e.currentTarget);
    lock.current=true;setBusy(true);setError('');
    try {
      const budgets=phases.map(phase => ({key:phase.id, before:initial.planning?.budgets?.[phase.id], after:parseBudget(String(fields.get('b:'+phase.id)??'').trim())})).filter(p=>p.before!==p.after);
      const assignments=Array.from(tasks.keys(),key=>{
        const value=fields.get('a:'+key);
        return {key,before:initial.planning?.assignments?.[key],after:value==='auto'?undefined:value==='none'?null:String(value).slice(2)};
      }).filter(p=>p.before!==p.after);
      await save({kind:'setPlan',budgets,assignments});
    } catch(cause){setError(message(cause));} finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={submit} className={styles.form}><fieldset disabled={busy}>
    <legend>단계별 시간 계획</legend><p>예상시간은 시간 단위로 적습니다. 1시간 30분은 1:30으로 입력하세요.</p>
    <div className={styles.grid}>{phases.map(phase=><label key={phase.id}>{phase.label} 예상시간
      <input name={'b:'+phase.id} defaultValue={formatBudget(initial.planning?.budgets?.[phase.id])} placeholder="미설정" maxLength={9} /></label>)}</div>
    <details className={styles.assign}><summary>업무별 단계 지정 ({tasks.size})</summary>
      {Array.from(tasks,([id,name])=>{
        const suggested=suggestedPhase(initial,name);
        const override=initial.planning?.assignments?.[id];
        return <label key={id}>{name}<select name={'a:'+id} defaultValue={override===undefined?'auto':override===null?'none':'p:'+override}>
          <option value="auto">{suggested?'기본값 · '+phases.find(p=>p.id===suggested)?.label:'기본값 · 미분류'}</option>
          <option value="none">미분류로 지정</option>
          {phases.map(p=><option key={p.id} value={'p:'+p.id}>{p.label}</option>)}
        </select></label>;
      })}
    </details>
    {error&&<p role="alert">{error}</p>}<div className={styles.actions}><button type="button" onClick={cancel}>취소</button><button type="submit">계획 저장</button></div>
  </fieldset></form>;
}

function PhaseEditor({save,cancel}:{save:Save;cancel:()=>void}) {
  const [id]=useState(()=>crypto.randomUUID()); const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy)return;const label=String(new FormData(e.currentTarget).get('phase')??'').trim();
    setBusy(true);setError('');
    try{await save({kind:'addPhase',phase:{id,label}});}catch(cause){setError(message(cause));}finally{setBusy(false);}
  }
  return <form className={styles.form} onSubmit={submit}><fieldset disabled={busy}><legend>프로젝트 단계 추가</legend>
    <label>단계 이름<input name="phase" required maxLength={60} placeholder="예: 현장 설계지원" /></label>
    {error&&<p role="alert">{error}</p>}<div className={styles.actions}><button type="button" onClick={cancel}>취소</button><button type="submit">단계 추가</button></div></fieldset></form>;
}

const competitionOutcomes: Outcome[]=['제출완료','입선','탈락','드롭'];
function ReviewEditor({editor,data,shared,today,save,cancel}: {
  editor:Extract<Editor,{kind:'review'}>; data:CompetitionData; shared:Props['shared']; today:string; save:Save; cancel:()=>void;
}) {
  const [initial]=useState(data);
  const old=editor.original;
  const isOrdinary=initial.workspaceKind==='project';
  const terminal=competitionOutcomes.find(s=>s===initial.status);
  const options:Outcome[]=old?[old.outcome]:isOrdinary?['종료','드롭']:terminal?[terminal]:competitionOutcomes;
  const [outcome,setOutcome]=useState<Outcome>(options[0]);
  const [day,setDay]=useState(old?.day??(!isOrdinary&&terminal?'':today));
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);const lock=useRef(false);
  const ready=!shared.loading&&!shared.error;
  const minutes=day&&ready?phaseSummary(data,shared.logs,day).totalActual:null;
  const phases=phasesFor(data);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(lock.current||minutes===null)return;
    const fields=new FormData(e.currentTarget);
    const field=(key:string)=>String(fields.get(key)??'').trim();
    lock.current=true;setBusy(true);setError('');
    try{
      await save({kind:'saveReview',previousVersion:old?.version??null,lifecycleRevision:initial.planning?.lifecycleRevision??0,
        review:{id:editor.id,day,outcome,phase:field('phase')||null,reason:field('reason'),lesson:field('lesson'),reusable:field('reusable'),url:field('url'),minutes}});
    }catch(cause){setError(message(cause));}finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={submit} className={styles.form}><fieldset disabled={busy}>
    <legend>종료·드롭 회고</legend>
    <div className={styles.grid}>
      <label>결과<select value={outcome} onChange={e=>setOutcome(e.target.value as Outcome)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>
      <label>종료·드롭일<input type="date" required max={today} value={day} onChange={e=>setDay(e.target.value)}/></label>
    </div>
    <label>당시 단계<select name="phase" defaultValue={old?.phase??''}><option value="">미지정</option>{phases.map(p=><option value={p.id} key={p.id}>{p.label}</option>)}</select></label>
    <label>{outcome==='드롭'?'중단 이유':'결과와 판단 근거'}<textarea name="reason" required maxLength={2000} defaultValue={old?.reason}/></label>
    <label>다음에 바꿀 점 또는 유지할 점<input name="lesson" maxLength={2000} defaultValue={old?.lesson}/></label>
    <label>재사용할 도면·자료·판단<input name="reusable" maxLength={2000} defaultValue={old?.reusable}/></label>
    <label>자료 링크<input type="url" placeholder="https://" name="url" maxLength={2000} defaultValue={old?.url}/></label>
    <p>선택한 날짜까지 프로젝트에 기록된 투입시간 <strong>{minutes===null?'확인 대기':durationLabel(minutes)}</strong></p>
    {error&&<p role="alert">{error}</p>}<div className={styles.actions}><button type="button" onClick={cancel}>취소</button>
      <button type="submit" disabled={minutes===null}>{old||(!isOrdinary&&terminal)?'회고 저장':outcome+' 처리 및 회고 저장'}</button></div>
  </fieldset></form>;
}

function PastReviews({projects,exclude}: {projects:Reference[];exclude:string}) {
  const [query,setQuery]=useState('');
  const entries=projects.filter(project=>project.id!==exclude)
    .flatMap(project=>(project.competitionData?.planning?.closeouts??[]).filter(r=>r.reason).map(review=>({project,review})));
  if (!entries.length) return null;
  const search=query.trim().toLocaleLowerCase('ko');
  const found=entries.filter(({project,review})=>[project.title,review.outcome,review.reason,review.lesson,review.reusable].some(x=>x.toLocaleLowerCase('ko').includes(search)))
    .sort((a,b)=>b.review.day.localeCompare(a.review.day));
  return <details className={styles.assign}><summary>다른 프로젝트 회고 찾기 ({entries.length})</summary>
    <label className={styles.search}>회고 검색<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="프로젝트명·중단 이유·재사용 자료" /></label>
    {found.map(({project,review})=><article className={styles.review} key={project.id+'/'+review.id}>
      <Link href={projectHref(project.id,'planning')}><ProjectColorDot project={project} />{project.title}</Link><p>{review.day} · {review.outcome}{review.minutes!==null&&' · '+durationLabel(review.minutes)}</p>
      <p>{review.reason}</p>{review.lesson&&<p>{review.lesson}</p>}{review.reusable&&<p>재사용할 자료 · {review.reusable}</p>}
    </article>)}
    {!found.length&&<p>검색 결과가 없습니다.</p>}
  </details>;
}

export default function ProjectPlanning({project,today,shared,relatedProjects=[],onActivity}: Props) {
  const [editor,setEditor]=useState<Editor|null>(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const data=project.competitionData;
  if(!data || data.workspaceKind==='office')return <p>프로젝트를 선택하면 단계별 시간 계획과 회고를 볼 수 있습니다.</p>;
  const p=data.planning;
  const phases=phasesFor(data);
  const summary=phaseSummary(data,shared.logs);
  const available=!shared.loading&&!shared.error;
  const reviews=(p?.closeouts??[]).slice().reverse();
  const current=reviews.find(r=>r.id===p?.currentCloseout);
  function open(value:Editor){setEditor(value);setError('');setNotice('');}
  async function save(edit:PlanningChange['edit']) {
    await onActivity(project.id,{type:'planning',edit});
    setEditor(null);setNotice(edit.kind==='reopen'?'프로젝트를 재개했습니다.':'저장했습니다.');setError('');
  }
  async function reopen() {
    if(busy)return;setBusy(true);
    try{await save({kind:'reopen',lifecycleRevision:p?.lifecycleRevision??0});}catch(cause){setError(message(cause));}finally{setBusy(false);}
  }
  return <div className={styles.planning}>
    <section><div className={styles.header}><h3>단계별 시간 계획</h3>
      <div className={styles.actions}><button type="button" disabled={!!editor} onClick={()=>open({kind:'phase'})}>+ 단계</button>
        <button type="button" disabled={!!editor} onClick={()=>open({kind:'plan'})}>계획 편집</button></div></div>
      {shared.error&&<p role="alert">프로젝트 공유시간을 불러오지 못했습니다. <button type="button" onClick={shared.retry}>다시 불러오기</button></p>}
      {shared.loading&&<p role="status">프로젝트 공유시간을 불러오는 중…</p>}
      <div className={styles.scroll}><table><caption>전체 기간 · 프로젝트 업무일지와 공유된 개인 업무시간</caption>
        <thead><tr><th scope="col">단계</th><th scope="col">예상</th><th scope="col">실제</th><th scope="col">차이</th></tr></thead>
        <tbody>{summary.rows.map(r=><tr key={r.id??'unassigned'}><th scope="row">{r.label}</th>
          <td>{r.plannedMinutes===null?'미설정':durationLabel(r.plannedMinutes)}</td><td>{available?durationLabel(r.actualMinutes):'확인 중'}</td>
          <td>{!available||r.plannedMinutes===null?'—':r.plannedMinutes===r.actualMinutes?'일치':durationLabel(Math.abs(r.actualMinutes-r.plannedMinutes))+(r.actualMinutes>r.plannedMinutes?' 초과':' 남음')}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">합계</th><td>{summary.hasPlan?durationLabel(summary.totalPlanned):'미설정'}</td><td>{available?durationLabel(summary.totalActual):'확인 중'}</td><td> </td></tr></tfoot>
      </table></div>
      {editor?.kind==='plan'&&<PlanEditor data={data} logs={shared.logs} save={save} cancel={()=>setEditor(null)}/>}
      {editor?.kind==='phase'&&<PhaseEditor save={save} cancel={()=>setEditor(null)}/>}
    </section>
    <section><div className={styles.header}><h3>종료·드롭 회고</h3>
      {(!current||!current.reason)&&<button type="button" disabled={!!editor} onClick={()=>open({kind:'review',id:current?.id??crypto.randomUUID(),original:current})}>회고 작성</button>}
    </div>
      {p?.archived&&<button type="button" disabled={busy||!!editor} onClick={reopen}>프로젝트 재개</button>}
      {!data.workspaceKind&&data.status==='드롭'&&<Link href={'/reference/'+encodeURIComponent(project.id)}>공모 상세에서 재개</Link>}
      {editor?.kind==='review'&&<ReviewEditor key={editor.id} editor={editor} data={data} shared={shared} today={today} save={save} cancel={()=>setEditor(null)}/>}
      {!reviews.length&&<p>아직 작성한 회고가 없습니다.</p>}
      {reviews.map(r=><article key={r.id} className={styles.review}>
        <div className={styles.header}><h4>{r.outcome} · {r.day}</h4><button type="button" disabled={!!editor} onClick={()=>open({kind:'review',id:r.id,original:r})}>{r.reason?'수정':'회고 입력'}</button></div>
        <p>{phases.find(phase=>phase.id===r.phase)?.label??'단계 미지정'} · {r.minutes===null?'투입시간 확인 전': '종료일까지 '+durationLabel(r.minutes)}</p>
        {r.reason&&<p><strong>{r.outcome==='드롭'?'중단 이유':'결과'}</strong> {r.reason}</p>}
        {r.lesson&&<p><strong>다음 프로젝트에 적용할 점</strong> {r.lesson}</p>}
        {r.reusable&&<p><strong>재사용할 자료</strong> {r.reusable}</p>}
        {r.url&&/^https?:\/\//i.test(r.url)&&<a href={r.url} target="_blank" rel="noopener noreferrer">자료 열기</a>}
      </article>)}
      <PastReviews projects={relatedProjects} exclude={project.id}/>
    </section>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </div>;
}
