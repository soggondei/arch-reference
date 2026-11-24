export const checkStates = ['미검토', '충족', '미충족', '협의 필요', '해당 없음'];
export const documentStates = ['미요청', '요청', '수합', '보완 요청', '검토 완료', '해당 없음'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type WorkDetails = Record<string, string>;
interface Condition { field: string; values: string[] }
interface Conditional { routes?: string[]; when?: Condition; legacy?: boolean }
export interface Definition extends Conditional { id: string; name: string; group?: string; source: string; ref?: string; hint?: string }
export interface WorkField extends Conditional { key: string; label: string; type: 'text'|'note'|'area'|'select'|'facility'; options?: string[] }
interface Journey { stages: string[]; events: string[]; finish: string }
interface Labels { checks: string; docs: string; history: string; authority: string; party: string; reference: string; body: string }
interface Workflow {
  version: number; kind: string; fields: WorkField[]; states: string[]; labels: Labels; base: Journey;
  route?: {key: string; paths: Record<string, Journey>}; conditions?: Record<string, Condition>;
  links: {name: string; url: string}[];
}
export interface Blueprint { name: string; special?: boolean; description: string; stages: string[]; terminal: string[]; events: string[]; checks: Definition[]; docs: Definition[]; workflow?: Workflow }
export interface WorkTemplate { id: string; version: number; custom: boolean; body: Blueprint }
export interface ItemRecord { status: string; note: string; date: string }
export interface CaseData {
  title: string; client: string; contact: string; address: string; authority: string; assignee: string; projectId: string;
  nextAction: string; due: string; summary: string; stage: string; archived: boolean;
  buildingType?: string; violation?: string; totalArea?: string; resArea?: string; unitArea?: string;
  completion?: string; intake?: string; refNo?: string; details?: WorkDetails;
  checks: Record<string, ItemRecord>; docs: Record<string, ItemRecord>;
}
export interface HistoryEntry { id: string; created?: string; date: string; kind: string; party: string; reference: string; body: string; stage: string; nextAction: string; due: string }
export interface WorkFile { id: string; doc: string; name: string; size: number; date: string; archived: boolean }
export interface WorkCase { id: string; serial: number; templateId: string; blueprint: Blueprint; data: CaseData; revision: number; created: string; updated: string; events: HistoryEntry[]; files: WorkFile[] }
export interface Summary { id: string; serial: number; type: string; templateId: string; title: string; client: string; address: string; projectId: string; stage: string; route?: string; closed: boolean; due: string; nextAction: string; archived: boolean; docsTotal: number; docsReceived: number; updated: string }
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
export const facilityGroups = ['1 자동차 관련 시설군','2 산업 등의 시설군','3 전기통신시설군','4 문화 및 집회시설군','5 영업시설군','6 교육 및 복지시설군','7 근린생활시설군','8 주거업무시설군','9 그 밖의 시설군'];
export const fieldOptions = (f:WorkField) => f.type==='facility' ? facilityGroups : f.options;
export const routeName = (b:Blueprint, d:WorkDetails = {}) => b.workflow?.route ? d[b.workflow.route.key] || '' : '';
function matches(rule:Condition|undefined, details:WorkDetails) {
  return !rule || rule.values.includes(details[rule.field]);
}
export function applies(v:Conditional,b:Blueprint,d:WorkDetails = {}) {
  return !v.legacy && (!v.routes || v.routes.includes(routeName(b,d))) && matches(v.when,d);
}
export function journey(b:Blueprint,d:WorkDetails = {}):Journey {
  const w=b.workflow;
  if(!w) return {stages:b.stages,events:b.events,finish:''};
  const route=w.route?.paths[routeName(b,d)] || w.base;
  const allowed=(name:string)=>matches(w.conditions?.[name],d);
  return {stages:route.stages.filter(allowed),events:route.events.filter(allowed),finish:route.finish};
}
export function workLabels(b:Blueprint):Labels {
  if(b.workflow) return b.workflow.labels;
  if(b.special) return {checks:'대상 요건 검토',docs:'신고·심의 서류',history:'관할청 협의·심의·승인 이력',authority:'관할 기관·부서',party:'기관·담당자',reference:'문서번호',body:'협의 내용·보완사항·승인 조건'};
  return {checks:'검토 항목',docs:'자료·성과물',history:'업무 진행 이력',authority:'관련 기관·협력처',party:'협의 상대',reference:'자료명·번호',body:'작업 내용·협의 결과'};
}
export function workStates(b:Blueprint) {
  return b.workflow?.states || (b.special ? checkStates : ['미검토','진행 중','확인 완료','보완 필요','해당 없음']);
}
export function needsStageChoice(b:Blueprint,before:WorkDetails,after:WorkDetails,stage:string) {
  return !journey(b,after).stages.includes(stage) &&
    (journey(b,before).stages.includes(stage) || routeName(b,before)!==routeName(b,after));
}
export function facilityGroupGuidance(d:WorkDetails) {
  const from=facilityGroups.indexOf(d.fromGroup), to=facilityGroups.indexOf(d.toGroup);
  if(from<0 || to<0) return '';
  if(to<from) return '상위 시설군으로 변경하므로 용도변경 허가 대상으로 우선 검토합니다.';
  if(to>from) return '하위 시설군으로 변경하므로 용도변경 신고 대상으로 우선 검토합니다.';
  return '같은 시설군입니다. 대장 기재내용 변경 신청을 검토하고, 시행령 제14조제4항의 예외와 제외 용도를 확인하세요.';
}
export function occupancyApprovalGuidance(d:WorkDetails) {
  if(!['용도변경 허가','용도변경 신고'].includes(d.procedure) || !d.area || !/^\d+(?:\.\d+)?$/.test(d.area)) return '';
  const a=Number(d.area);
  if(a===0) return '';
  if(a<100) return '변경 면적이 100㎡ 미만으로 제19조제5항의 사용승인 준용 면적 기준에 미달합니다.';
  if(a>=500 || d.major==='수반') return '입력한 면적·공사 조건은 제19조제5항의 사용승인 준용 대상에 해당합니다. 수행 주체를 확인하세요.';
  if(d.major==='수반하지 않음') return '100㎡ 이상 500㎡ 미만이고 대수선을 수반하지 않아 제19조제5항 단서 적용을 검토합니다.';
  return '100㎡ 이상 500㎡ 미만입니다. 대수선 수반 여부에 따라 사용승인 준용 여부가 달라집니다.';
}
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
function readDetails(f:Values,b:Blueprint,previous:WorkDetails = {}) {
  const result={...previous};
  for(const spec of b.workflow?.fields || []) {
    const key='wf.'+spec.key;
    if(!(key in f)) continue;
    const value=val(f[key],spec.type==='note'?2000:spec.type==='area'?16:240);
    const options=fieldOptions(spec);
    if(value && options) choice(value,options);
    if(value && spec.type==='area' && !/^\d{1,9}(?:\.\d{1,4})?$/.test(value)) return invalid(spec.label+'에 0 이상의 숫자를 입력하세요.');
    result[spec.key]=value;
  }
  return result;
}
export function caseFields(f: Values, blueprint: Blueprint, previous?: WorkDetails) {
  const result: Record<string,string> = {};
  for (const [key,limit] of Object.entries({title:120,client:100,contact:120,address:260,authority:160,assignee:100,projectId:300,nextAction:300,summary:4000}))
    result[key]=val(f[key],limit,key==='title');
  result.due=day(f.due);
  if(blueprint.special) {
    result.buildingType=choice(f.buildingType||'미확인',buildingTypes);result.violation=choice(f.violation||'미확인',violations);
    result.completion=day(f.completion);result.intake=day(f.intake);result.refNo=val(f.refNo,150);
    for(const key of ['totalArea','resArea','unitArea']) {
      const n=val(f[key],16);if(n&&!/^\d{1,9}(?:\.\d{1,4})?$/.test(n)) return invalid('면적은 0 이상의 숫자로 입력하세요.');result[key]=n;
    }
    if(result.totalArea&&result.resArea&&Number(result.resArea)>Number(result.totalArea)) return invalid('주거용 면적은 전체 연면적 이하여야 합니다.');
  }
  return blueprint.workflow ? {...result,details:readDetails(f,blueprint,previous)} : result;
}
export function applyChange(c:WorkCase, action:string, input:Values):{data:CaseData;event?:HistoryEntry} {
  let data={...c.data};
  if(action==='basics') {
    data={...data,...caseFields(input,c.blueprint,data.details)};
    const before=c.data.details || {}, after=data.details || {};
    const oldRoute=routeName(c.blueprint,before), newRoute=routeName(c.blueprint,after);
    const oldJourney=journey(c.blueprint,before), newJourney=journey(c.blueprint,after);
    if(oldRoute!==newRoute || oldJourney.stages.join('|')!==newJourney.stages.join('|')) {
      const stage=needsStageChoice(c.blueprint,before,after,data.stage) ? choice(input.routeStage,newJourney.stages) : '';
      if(stage) data.stage=stage;
      const change=oldRoute!==newRoute ? (oldRoute||'미정')+' → '+(newRoute||'미정') :
        '사용승인 수행 범위 변경 · '+(before.approval||'미정')+' → '+(after.approval||'미정');
      return {data,event:{id:eventId(input.changeId),date:dayKorea(),kind:'진행 경로 변경',party:'',reference:'',body:change,stage,nextAction:'',due:''}};
    }
  }
  else if(action==='archive') {if(typeof input.value!=='boolean')return invalid('보관 설정을 확인하세요.');data.archived=input.value;}
  else if(action==='check'||action==='doc') {
    const doc=action==='doc', key=val(input.key,70,true), target=doc?'docs':'checks';
    if(!c.blueprint[target].some(i=>i.id===key && applies(i,c.blueprint,data.details)))return invalid('현재 업무 경로의 항목을 선택하세요.');
    const states=doc?documentStates:workStates(c.blueprint), current=data[target][key]?.status;
    data[target]={...data[target],[key]:{status:choice(input.status,current?[...states,current]:states),note:val(input.note,2000),date:day(input.date)}};
  } else if(action==='event') {
    const id=eventId(input.id), path=journey(c.blueprint,data.details);
    const stage=input.stage?choice(input.stage,path.stages):'', next=input.changeNext===true;
    const event={id,date:day(input.date,true),kind:choice(input.kind,path.events),party:val(input.party,160),reference:val(input.reference,150),body:val(input.body,4000,true),stage,nextAction:next?val(input.nextAction,300):'',due:next?day(input.due):''};
    if(stage)data.stage=stage;if(next){data.nextAction=event.nextAction;data.due=event.due;}
    return {data,event};
  } else return invalid('처리할 업무를 확인하세요.');
  return {data};
}
function eventId(value:unknown) {
  const id=val(value,36,true);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return invalid('이력 번호를 확인하세요.');
  return id;
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

