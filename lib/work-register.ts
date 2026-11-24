export const checkStates = ['미검토', '충족', '미충족', '협의 필요', '해당 없음'];
export const documentStates = ['미요청', '요청', '수합', '보완 요청', '검토 완료', '해당 없음'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface Definition { id: string; name: string; group?: string; source: string; ref?: string; hint?: string }
export interface Blueprint { name: string; special?: boolean; description: string; stages: string[]; terminal: string[]; events: string[]; checks: Definition[]; docs: Definition[] }
export interface WorkTemplate { id: string; version: number; custom: boolean; body: Blueprint }
export interface ItemRecord { status: string; note: string; date: string }
export interface CaseData {
  title: string; client: string; contact: string; address: string; authority: string; assignee: string; projectId: string;
  nextAction: string; due: string; summary: string; stage: string; archived: boolean;
  buildingType?: string; violation?: string; totalArea?: string; resArea?: string; unitArea?: string;
  completion?: string; intake?: string; refNo?: string;
  checks: Record<string, ItemRecord>; docs: Record<string, ItemRecord>;
}
export interface HistoryEntry { id: string; created?: string; date: string; kind: string; party: string; reference: string; body: string; stage: string; nextAction: string; due: string }
export interface WorkFile { id: string; doc: string; name: string; size: number; date: string; archived: boolean }
export interface WorkCase { id: string; serial: number; templateId: string; blueprint: Blueprint; data: CaseData; revision: number; created: string; updated: string; events: HistoryEntry[]; files: WorkFile[] }
export interface Summary { id: string; serial: number; type: string; templateId: string; title: string; client: string; address: string; projectId: string; stage: string; closed: boolean; due: string; nextAction: string; archived: boolean; docsTotal: number; docsReceived: number; updated: string }
export interface ProjectOption { id: string; name: string }
export interface Catalog { templates: WorkTemplate[]; projects: ProjectOption[] }
export const buildingTypes = ['미확인','다세대주택','단독주택(다가구 제외)','다가구주택','근린생활시설의 주택 사용','그 밖의 용도'];
export const violations = ['미확인','무허가·무신고 건축 또는 대수선','허가·신고 후 사용승인 미취득','무단 용도변경','복합 위반'];
export const resources = [
  {key:'guide',name:'전국 공통 실무가이드',source:'실무 자료',ext:'pdf'}, {key:'intake',name:'사건별 상담·서류점검표',source:'실무 자료',ext:'xlsx'},
  {key:'client',name:'건축주용 첫 상담 준비자료',source:'실무 자료',ext:'pdf'}, {key:'act',name:'특정건축물정리법 제21820호',source:'공포 법률',ext:'pdf'},
  {key:'draft',name:'시행령 제정안 전문과 별지',source:'입법예고안',ext:'pdf'}, {key:'form-1',name:'특정건축물 신고서 · 별지 제1호',source:'입법예고안',ext:'pdf'},
  {key:'form-2',name:'현장조사서 · 별지 제2호',source:'입법예고안',ext:'pdf'}, {key:'packet',name:'전국 공통 실무자료 전체',source:'실무 자료',ext:'zip'}
];
export const lawLinks = [
  ['국가법령정보센터 · 공포 법률','https://www.law.go.kr/lsInfoP.do?lsiSeq=286993'],
  ['법제처 · 시행령 입법예고','https://moleg.go.kr/lawinfo/makingInfo.mo?currentPage=1&lawCd=0&lawSeq=88894&lawType=TYPE5&mid=a10104010000&pageCnt=10'],
  ['국민참여입법센터 · 추진현황','https://opinion.lawmaking.go.kr/lmSts/lrLawRprPln/1000000251798/0'],
  ['자치법규정보시스템 · 소재지 조례','https://www.elis.go.kr/']
];

type Values = Record<string, unknown>;
export function isValues(v: unknown): v is Values { return !!v && typeof v === 'object' && !Array.isArray(v); }
function invalid(msg: string): never { throw new Error(msg); }
function val(v: unknown, max: number, required=false): string {
  const s = v == null ? '' : v;
  if (typeof s!=='string' || s.length>max || (required&&!s.trim())) return invalid('입력 내용과 글자 수를 확인하세요.');
  return s.trim();
}
function day(v: unknown, required=false) {
  const s=val(v,10,required);
  if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10)!==s)) return invalid('날짜를 확인하세요.');
  return s;
}
function choice(v: unknown, list: string[]) {
  if (typeof v!=='string' || !list.includes(v)) return invalid('목록에 있는 값을 선택하세요.');
  return v;
}
export function caseFields(f: Values, special: boolean) {
  const result: Record<string,string> = {};
  for (const [key,limit] of Object.entries({title:120,client:100,contact:120,address:260,authority:160,assignee:100,projectId:300,nextAction:300,summary:4000}))
    result[key]=val(f[key],limit,key==='title');
  result.due=day(f.due);
  if(special) {
    result.buildingType=choice(f.buildingType||'미확인',buildingTypes);result.violation=choice(f.violation||'미확인',violations);
    result.completion=day(f.completion);result.intake=day(f.intake);result.refNo=val(f.refNo,150);
    for(const key of ['totalArea','resArea','unitArea']) {
      const n=val(f[key],16);if(n&&!/^\d{1,9}(?:\.\d{1,4})?$/.test(n)) return invalid('면적은 0 이상의 숫자로 입력하세요.');result[key]=n;
    }
    if(result.totalArea&&result.resArea&&Number(result.resArea)>Number(result.totalArea)) return invalid('주거용 면적은 전체 연면적 이하여야 합니다.');
  }
  return result;
}
export function applyChange(c:WorkCase, action:string, input:Values):{data:CaseData;event?:HistoryEntry} {
  let data={...c.data};
  if(action==='basics') data={...data,...caseFields(input,!!c.blueprint.special)};
  else if(action==='archive') {if(typeof input.value!=='boolean')return invalid('보관 설정을 확인하세요.');data.archived=input.value;}
  else if(action==='check'||action==='doc') {
    const doc=action==='doc', key=val(input.key,70,true), target=doc?'docs':'checks';
    if(!c.blueprint[target].some(i=>i.id===key))return invalid('해당 항목이 없습니다.');
    data[target]={...data[target],[key]:{status:choice(input.status,doc?documentStates:checkStates),note:val(input.note,2000),date:day(input.date)}};
  } else if(action==='event') {
    const id=val(input.id,36,true);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return invalid('이력 번호를 확인하세요.');
    const stage=input.stage?choice(input.stage,c.blueprint.stages):'', next=input.changeNext===true;
    const event={id,date:day(input.date,true),kind:choice(input.kind,c.blueprint.events),party:val(input.party,160),reference:val(input.reference,150),body:val(input.body,4000,true),stage,nextAction:next?val(input.nextAction,300):'',due:next?day(input.due):''};
    if(stage)data.stage=stage;if(next){data.nextAction=event.nextAction;data.due=event.due;}
    return {data,event};
  } else return invalid('처리할 업무를 확인하세요.');
  return {data};
}
export function templateFields(f:Values):Blueprint {
  const lines=(key:string,max:number)=>{const text=val(f[key],6500), a=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(a.length>60||a.some(s=>s.length>max)||new Set(a).size!==a.length)return invalid('각 항목은 중복 없이 한 줄씩 입력하세요.');return a;};
  const stages=lines('stages',60), terminal=lines('terminal',60), events=lines('events',60);
  if(!stages.length||!events.length||terminal.some(s=>!stages.includes(s)))return invalid('진행 단계와 이력 유형을 입력하고 완료 단계는 진행 단계에서 선택하세요.');
  const defs=(key:string)=>lines(key,160).map((name,i)=>({id:(key==='docs'?'doc-':'check-')+(i+1),name,source:'실무 자료'}));
  return {name:val(f.name,90,true),description:val(f.description,300),special:false,stages,terminal,events,checks:defs('checks'),docs:defs('docs')};
}
export const dayKorea=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const serialLabel=(n:number)=>'LV-'+String(n).padStart(4,'0');

