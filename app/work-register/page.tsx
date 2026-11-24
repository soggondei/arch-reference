'use client';
import Link from 'next/link';
import {useState,useEffect,useCallback,type FormEvent,type ReactNode} from 'react';
import {WorkflowFields,TemplatePreview} from './workflow-fields';
import {applies,journey,workStates,workLabels,routeName,documentStates,buildingTypes,violations,dayKorea,resources,lawLinks,serialLabel,MAX_FILE_BYTES,type Catalog,type Summary,type WorkCase,type WorkTemplate,type Blueprint,type Definition} from '@/lib/work-register';
import './register.css';
type Fields=Record<string,unknown>;
async function request(action:string,id?:string,args:Fields={},revision?:number){
 const get=['get','list','catalog'].includes(action);
 const q=new URLSearchParams({action,...(id?{id}:{}),...(args.after?{after:String(args.after)}:{})});
 const r=await fetch('/api/work-register'+(get?'?'+q:''),get?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,args,revision})});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'서버에 연결하지 못했습니다.');return data;
}
const field=(label:string,name:string,v='',type='text',required=false)=><label key={name}>{label}<input type={type} name={name} defaultValue={v} required={required}/></label>;
const area=(label:string,name:string,v='',required=false)=><label className="wide">{label}<textarea name={name} defaultValue={v} required={required}/></label>;
const select=(label:string,name:string,options:string[],v?:string)=><label>{label}<select name={name} defaultValue={v}>{options.map(x=><option key={x} value={x}>{x||'변경 없음'}</option>)}</select></label>;
const badge=(s:string)=><small className={'badge '+(s==='입법예고안'?'draft':s==='공포 법률'?'law':'')}>{s}</small>;
async function readRegister(){
 const cat:Catalog=await request('catalog'),all:Summary[]=[];
 let after=0;
 do{const page=await request('list',undefined,{after});all.push(...page.items);after=page.after;}while(after);
 return {cat,all};
}
function registerRequests(){
 let latestRead=0,writing=false;
 return {
   beginRead(){const version=++latestRead;return ()=>version===latestRead;},
   cancelRead(){latestRead++;},
   beginWrite(){if(writing)return false;writing=true;return true;},
   endWrite(){writing=false;},
 };
}
export default function Register(){
 const [catalog,setCatalog]=useState<Catalog>(),[rows,setRows]=useState<Summary[]>([]),[item,setItem]=useState<WorkCase>(),[tab,setTab]=useState('목록'),[part,setPart]=useState('기본정보'),[project,setProject]=useState(''),[type,setType]=useState(''),[search,setSearch]=useState(''),[arch,setArch]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState(''),[base,setBase]=useState<WorkTemplate>(),[editTemplate,setEditTemplate]=useState(false);
 const [createType,setCreateType]=useState('');
 const [requests]=useState(registerRequests);
 async function reload(){const {cat,all}=await readRegister();setCatalog(cat);setRows(all);}
 const navigate=useCallback(()=>{
   const current=requests.beginRead();
   const q=new URLSearchParams(location.search), id=q.get('case');
   return Promise.all([readRegister(),id?request('get',id):undefined]).then(([{cat,all},data])=>{
     if(!current())return;
     setError('');setProject(q.get('project')||'');setCatalog(cat);setRows(all);setItem(data);setPart('기본정보');setTab('목록');setMode('');
   }).catch(e=>{if(current())setError((e as Error).message);});
 },[requests]);
 useEffect(()=>{
   void navigate();window.addEventListener('popstate',navigate);
   return ()=>{requests.cancelRead();window.removeEventListener('popstate',navigate);};
 },[navigate,requests]);
 function open(id?:string){const q=new URLSearchParams();if(project)q.set('project',project);if(id)q.set('case',id);history.pushState(null,'','/work-register'+(q.size?'?'+q:''));void navigate();}
 const work=useCallback(async(f:()=>Promise<void>)=>{
   if(!requests.beginWrite())return;
   setBusy(true);setError('');setMessage('');
   try{await f();}catch(e){setError((e as Error).message);}finally{requests.endWrite();setBusy(false);}
 },[requests]);
 function form(e:FormEvent<HTMLFormElement>,f:(a:Fields)=>Promise<void>){e.preventDefault();const a=Object.fromEntries(new FormData(e.currentTarget));void work(()=>f(a));}
 async function change(a:string,v:Fields){if(!item)return;const updated=await request(a,item.id,v,item.revision);setItem(updated);setMode('');await reload();setMessage('저장했습니다.');}
 const btn=(label:string,fn:()=>void)=><button type="button" onClick={fn} disabled={busy}>{label}</button>;
 const save=<button className="primary" disabled={busy}>저장</button>;
 const box=(title:string,body:ReactNode)=><section className="regcard"><h2>{title}</h2>{body}</section>;
 const matches=rows.filter(r=>r.archived===arch&&(!type||type===r.templateId)&&(!project||project===r.projectId)&&(!search||[r.title,r.address,r.client].join(' ').toLowerCase().includes(search.toLowerCase())));
 const projects=catalog?.projects||[];
 const projectSelect=(value:string)=><label>연결 프로젝트<select name="projectId" defaultValue={value}><option value="">사무소 독립 업무</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
 const caseFields=(b:Blueprint,creating:boolean)=>{
   const d=creating?undefined:item?.data;
   return <>{field('의뢰명 *','title',d?.title,'text',true)}{projectSelect(d?.projectId||project)}
     {b.special&&<div key="special" className="workflow-fields wide"><h3>건물·위반 현황</h3><div className="regform">
       {select('건물 유형','buildingType',buildingTypes,d?.buildingType)}{select('위반 유형','violation',violations,d?.violation)}
       {field('사실상 완공일','completion',d?.completion,'date')}{field('신고 접수일','intake',d?.intake,'date')}
       {field('접수번호','refNo',d?.refNo)}{field('전체 연면적 (㎡)','totalArea',d?.totalArea)}
       {field('주거 연면적 (㎡)','resArea',d?.resArea)}{field('세대 전용면적 (㎡)','unitArea',d?.unitArea)}</div></div>}
     <WorkflowFields key={b.name} blueprint={b} record={d}/>
     {field('의뢰인','client',d?.client)}{field('연락처','contact',d?.contact)}{field('소재지','address',d?.address)}
     {field(workLabels(b).authority,'authority',d?.authority)}{field('사무소 담당자','assignee',d?.assignee)}
     {field('다음 업무','nextAction',d?.nextAction)}{field('처리 기한','due',d?.due,'date')}{area('메모','summary',d?.summary)}
   </>;
 };
 async function upload(k:string,files:FileList|null){if(!item||!files)return;const selected=Array.from(files);await work(async()=>{let data=item;for(const file of selected){if(!file.size||file.size>MAX_FILE_BYTES)throw Error('파일당 최대 20MB입니다.');const args={fileId:crypto.randomUUID(),doc:k,name:file.name,size:file.size};const prep=await request('prepare',item.id,args);if(!prep.ready){const resp=await fetch(prep.url,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file,credentials:'omit'});if(!resp.ok)throw Error('파일 업로드에 실패했습니다.');}data=await request('finish',item.id,args);setItem(data);}await reload();setMessage('첨부파일을 저장했습니다.');});}
 function records(doc:boolean){
   if(!item)return;
   const c=item, kind=doc?'docs':'checks';
   const states=doc?documentStates:workStates(c.blueprint);
   function row(v:Definition,active:boolean){
     const r=c.data[kind][v.id],files=doc?c.files.filter(f=>f.doc===v.id):[];
     const options=r?.status&&!states.includes(r.status)?[...states,r.status]:states;
     return <details key={v.id} className="regrow"><summary><b>{v.name}</b> {badge(v.source)} <span>{r?.status||states[0]}</span></summary>
       <p>{[v.group,v.ref,v.hint].filter(Boolean).join(' · ')}</p>
       {active?<form className="regform" key={JSON.stringify(r)} onSubmit={e=>form(e,a=>change(doc?'doc':'check',{...a,key:v.id}))}>
         {select('현재 상태','status',options,r?.status)}{field('확인일','date',r?.date,'date')}{area('근거·메모','note',r?.note)}{save}</form>:<p>{r?.date} {r?.note}</p>}
       {doc&&active&&<label>첨부파일 · 파일당 20MB<input aria-label={v.name+' 파일 첨부'} type="file" multiple disabled={busy} onChange={e=>{void upload(v.id,e.target.files);e.target.value='';}}/></label>}
       {files.map(f=><div className="filerow" key={f.id}>{f.name} {f.archived?badge('보관'):btn('내려받기',()=>void work(async()=>{
         const s=await request('download',c.id,{fileId:f.id,doc:v.id});const a=document.createElement('a');a.href=s.url;a.click();
       }))}{btn(f.archived?'복원':'보관',()=>void work(async()=>{setItem(await request(f.archived?'fileRestore':'fileArchive',c.id,{fileId:f.id,doc:v.id}));}))}</div>)}
     </details>;
   }
   const current=c.blueprint[kind].filter(v=>applies(v,c.blueprint,c.data.details));
   const previous=c.blueprint[kind].filter(v=>!applies(v,c.blueprint,c.data.details)&&(c.data[kind][v.id]||doc&&c.files.some(f=>f.doc===v.id)));
   return <>{current.map(v=>row(v,true))}{!current.length&&<p>이 경로에 등록된 항목이 없습니다.</p>}
     {!!previous.length&&<details className="previous-records"><summary>이전 경로에 저장한 기록 ({previous.length})</summary>{previous.map(v=>row(v,false))}</details>}</>;
 }
 function templates(){return <>{(catalog?.templates||[]).map(t=><div className="regrow" key={t.id}><b>{t.body.name}</b> {badge(t.custom?'사무소 양식':'기본 유형')}<p>{t.body.description} · 검토 {t.body.checks.length} / 서류 {t.body.docs.length}</p><TemplatePreview blueprint={t.body} onCopy={body=>{setBase({...t,body});setEditTemplate(false);setMode('template');}}/> {t.custom&&btn('수정',()=>{setBase(t);setEditTemplate(true);setMode('template');})}</div>)}{btn('새 업무 유형',()=>{setBase(undefined);setEditTemplate(false);setMode('template');})}</>;}
 function templateForm(){const b=base?.body;return <form key={base?.id||'new'} className="regform" onSubmit={e=>form(e,async a=>{await request('template',undefined,{...a,templateId:editTemplate?base?.id:'u-'+crypto.randomUUID(),version:editTemplate?base?.version:0});await reload();setMode('');setMessage('업무 유형을 저장했습니다. 새 의뢰부터 적용됩니다.');})}>{field('유형명 *','name',editTemplate?b?.name:b?b.name+' 사무소형':'','text',true)}{field('설명','description',b?.description)}{area('진행 단계 · 한 줄에 하나','stages',(b?.stages||['상담','진행','완료']).join('\n'),true)}{area('완료로 집계할 단계','terminal',(b?.terminal||['완료']).join('\n'))}{area('이력 종류','events',(b?.events||['협의','검토','납품']).join('\n'),true)}{area('검토 항목','checks',b?.checks.map(x=>x.name).join('\n'))}{area('필요서류','docs',b?.docs.map(x=>x.name).join('\n'))}<p className="wide">직접 만든 양식의 항목은 ‘실무 자료’로 표시합니다. 기존 의뢰는 등록 시점의 양식을 유지합니다.</p>{save}{btn('취소',()=>setMode(''))}</form>;}
 const creating=catalog?.templates.find(t=>t.id===createType);
 const labels=item?workLabels(item.blueprint):undefined;
 const path=item?journey(item.blueprint,item.data.details):undefined;
 return <div className="workreg"><header><Link href="/">LV LAB</Link><nav><Link href="/">사무소 홈</Link><Link href="/?tab=projects">프로젝트 관리</Link><Link href="/?tab=schedule">프로젝트 일정</Link><Link href="/work-register" aria-current="page">업무대장</Link></nav></header><main><h1>{item?.data.title||'사무소 업무대장'}</h1>{error&&<div role="alert" className="alert">{error} <Link href="/attendance">내 근태 · 기기 연결</Link> {btn('다시 불러오기',()=>void navigate())}</div>}{message&&<p role="status">{message}</p>}
 {!catalog&&!error&&<p>업무대장을 불러오는 중입니다.</p>}
 {catalog&&!item&&<><div className="regtabs">{['목록','업무 일정','업무 유형','양성화 법령·서식'].map(s=><button key={s} aria-pressed={tab===s} onClick={()=>{setTab(s);setMode('');}}>{s}</button>)}</div>
 {tab==='업무 유형'&&box(mode==='template'?'업무 유형 편집':'업무 유형',mode==='template'?templateForm():templates())}
 {tab==='양성화 법령·서식'&&box('특정건축물 · 전국 공통 실무자료',<><p>2026.11.23 기준 · 법률 제21820호는 2026.12.17 시행 예정입니다. 신고기간·별지는 시행령 입법예고본이므로 접수 전 공포문을 확인하세요.</p>{resources.map(r=><div className="filerow" key={r.key}>{badge(r.source)} <a download href={'/api/work-register?action=asset&asset='+r.key}>{r.name} · {r.ext.toUpperCase()}</a></div>)}{lawLinks.map(([n,u])=><a className="source" key={u} href={u} rel="noreferrer" target="_blank">{n}</a>)}</>)}
 {(tab==='목록'||tab==='업무 일정')&&<>{tab==='목록'&&btn('＋ 의뢰 등록',()=>{setCreateType(type);setMode('create');})}{mode==='create'&&box('새 의뢰',<form className="regform" onSubmit={e=>form(e,async a=>{const c=await request('create',crypto.randomUUID(),a);open(c.id);})}>
   <label className="wide">업무 유형 *<select name="templateId" value={createType} required onChange={e=>setCreateType(e.target.value)}>
     <option value="">업무 유형 선택</option>{catalog.templates.map(t=><option key={t.id} value={t.id}>{t.body.name}</option>)}</select></label>
   {creating&&caseFields(creating.body,true)}{creating&&save}{btn('취소',()=>setMode(''))}</form>)}
 {box(tab==='목록'?'의뢰 목록':'다음 업무와 처리 기한',<><div className="filters"><input aria-label="의뢰 검색" placeholder="의뢰명·주소·의뢰인" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="업무 유형 필터" value={type} onChange={e=>setType(e.target.value)}><option value="">전체 유형</option>{catalog.templates.map(t=><option key={t.id} value={t.id}>{t.body.name}</option>)}</select><select aria-label="프로젝트 필터" value={project} onChange={e=>setProject(e.target.value)}><option value="">전체 프로젝트</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label><input type="checkbox" checked={arch} onChange={e=>setArch(e.target.checked)}/> 보관함</label></div>{(tab==='목록'?matches:matches.filter(r=>r.due&&!r.closed).sort((a,b)=>a.due.localeCompare(b.due))).map(r=><div className="regrow" key={r.id}><button onClick={()=>open(r.id)}><b>{r.title}</b></button> {badge(r.type)} {r.route&&badge(r.route)} {badge(r.stage)}<p>{serialLabel(r.serial)} · 서류 {r.docsReceived}/{r.docsTotal} · {r.nextAction||'다음 업무 미등록'} {r.due}</p></div>)}{!(tab==='목록'?matches:matches.filter(r=>r.due&&!r.closed)).length&&<p>표시할 {tab==='목록'?'의뢰':'처리 기한'}가 없습니다.</p>}</>)}</>}</>}
 {item&&labels&&path&&<>{btn('의뢰 목록',()=>open())} {badge(item.blueprint.name)} {routeName(item.blueprint,item.data.details)&&badge(routeName(item.blueprint,item.data.details))} {badge(item.data.stage)}<div className="regtabs">{['기본정보','검토 항목','필요서류','진행 이력'].map(s=><button key={s} aria-pressed={part===s} onClick={()=>setPart(s)}>{({'검토 항목':labels.checks,'필요서류':labels.docs,'진행 이력':labels.history} as Record<string,string>)[s]||s}</button>)}</div>
 {part==='기본정보'&&box('기본정보',<><form className="regform" key={item.revision} onSubmit={e=>form(e,a=>change('basics',{...a,changeId:crypto.randomUUID()}))}>{caseFields(item.blueprint,false)}{save}</form>{item.data.projectId&&<Link href={'/?tab=projects&project='+encodeURIComponent(item.data.projectId)}>연결 프로젝트 열기</Link>} {btn(item.data.archived?'의뢰 복원':'의뢰 보관',()=>void work(()=>change('archive',{value:!item.data.archived})))}</>)}
 {(part==='검토 항목'||part==='필요서류')&&box(part==='필요서류'?labels.docs:labels.checks,records(part==='필요서류'))}
 {part==='진행 이력'&&box(labels.history,<><form className="regform" key={item.revision} onSubmit={e=>form(e,a=>change('event',{...a,id:crypto.randomUUID(),changeNext:a.changeNext==='on'}))}>{field('기록일','date',dayKorea(),'date',true)}{select('이력 종류','kind',path.events)}{field(labels.party,'party',item.data.authority)}{field(labels.reference,'reference')}{area(labels.body,'body','',true)}{select('변경할 진행 단계','stage',['',...path.stages])}<label><input type="checkbox" name="changeNext"/> 다음 업무와 기한도 변경</label>{field('다음 업무','nextAction',item.data.nextAction)}{field('처리 기한','due',item.data.due,'date')}{save}</form>{item.events.map(e=><article className="regrow" key={e.id}><b>{e.date} · {e.kind}</b> {e.stage&&badge(e.stage)}<p>{e.party} {e.reference}</p><p>{e.body}</p>{e.nextAction&&<p>{e.nextAction} {e.due}</p>}</article>)}</>)}</>}</main></div>;
}

