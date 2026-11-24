import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync,readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applies, applyChange, caseFields, facilityGroups, journey, occupancyApprovalGuidance,
  facilityGroupGuidance, workLabels, workStates,
} from '../lib/work-register.ts';

const directory=new URL('../supabase/migrations/',import.meta.url);
const migration=readdirSync(directory).find(f=>f.endsWith('_distinct_work_register_workflows.sql'));
const built=JSON.parse(readFileSync(new URL(migration,directory),'utf8').split('$workflows$')[1]);
const use=built.office2;
const labels=['용도변경 허가','용도변경 신고','건축물대장 기재내용 변경','기재내용 변경신청 예외'];
const record=(blueprint,details={},stage=blueprint.stages[0])=>({
  blueprint, data:{title:'테스트',checks:{},docs:{},stage,archived:false,details},events:[],files:[],
});
const event=(kind,stage)=>({id:randomUUID(),date:'2026-11-24',kind,stage,body:'검토 결과'});
const basic=(procedure,extra={})=>({title:'테스트','wf.procedure':procedure,changeId:randomUUID(),...extra});
const docNames=(blueprint,d)=>blueprint.docs.filter(v=>applies(v,blueprint,d)).map(v=>v.name);

test('each office type has its own intake, checks, paperwork, milestones, and history',()=>{
  assert.deepEqual(new Set(Object.values(built).map(b=>b.name)),new Set(['건축허가','건축신고','용도변경','인테리어 설계','일반 업무']));
  for(const b of Object.values(built)){
    assert.ok(b.workflow.fields.length);assert.ok(b.checks.length);assert.ok(b.docs.length);
    assert.ok(!b.stages.includes('심의 중'));assert.ok(!workStates(b).includes('충족'));
    for(const p of [b.workflow.base,...Object.values(b.workflow.route?.paths||{})]){
      assert.ok(p.stages.every(s=>b.stages.includes(s)));assert.ok(p.events.every(s=>b.events.includes(s)));
    }
  }
  assert.ok(journey(built.office1).stages.includes('허가서·조건 확인'));
  assert.ok(journey(built['office-report']).stages.includes('신고 수리 확인'));
  assert.ok(!journey(built.office1).stages.includes('착공신고'));
  assert.ok(journey(built.office1,{scope:'착공·사용승인 업무 포함'}).stages.includes('착공신고'));
  assert.ok(!docNames(built.office3,{}).includes('현장 질의·변경 기록'));
  assert.ok(docNames(built.office3,{scope:'설계·현장 지원'}).includes('현장 질의·변경 기록'));
  assert.ok(workLabels(built.office3).history.includes('납품'));
  assert.deepEqual(built.office0.terminal,['인수 확인']);
});

test('use change has an undecided intake and four mutually distinct paths and documents',()=>{
  assert.equal(journey(use).stages.at(-1),'시설군·처리 절차 검토');
  const branchDocs=['용도변경 허가신청서·접수증','용도변경 신고서·접수증','건축물대장 기재내용 변경 신청 자료','기재변경 신청 예외 근거·검토의견서'];
  for(const [i,procedure] of labels.entries()){
    const d={procedure};
    assert.deepEqual(branchDocs.filter(s=>docNames(use,d).includes(s)),[branchDocs[i]]);
    assert.ok(journey(use,d).stages.some(s=>use.terminal.includes(s)));
    assert.ok(!journey(use,d).stages.includes('사용승인 신청'));
    assert.equal(journey(use,{...d,approval:'대상 · 사무소 수행'}).stages.includes('사용승인 신청'),i<2);
    assert.equal(docNames(use,{...d,approval:'대상 · 사무소 수행'}).includes('사용승인 신청·결과 자료'),i<2);
  }
  assert.ok(!journey(use,{procedure:labels[3]}).events.includes('용도변경 허가 접수'));
  assert.throws(()=>applyChange(record(use,{procedure:labels[2]}),'event',event('대장 확인','허가서 확인')));
  assert.throws(()=>applyChange(record(use),'event',event('상담','결과 인계')));
});

test('procedure guidance leaves the recorded decision to the architect and uses exact area boundaries',()=>{
  assert.match(facilityGroupGuidance({fromGroup:facilityGroups[7],toGroup:facilityGroups[6]}),/허가/);
  assert.match(facilityGroupGuidance({fromGroup:facilityGroups[6],toGroup:facilityGroups[7]}),/신고/);
  assert.match(facilityGroupGuidance({fromGroup:facilityGroups[6],toGroup:facilityGroups[6]}),/제외 용도/);
  assert.equal(facilityGroupGuidance({fromGroup:facilityGroups[6]}),'');
  const advice=(area,major)=>occupancyApprovalGuidance({procedure:labels[0],area,major});
  assert.match(advice('99.9','수반'),/미달/);assert.match(advice('100','수반하지 않음'),/단서/);
  assert.match(advice('100','수반'),/대상/);assert.match(advice('499.99',''),/달라/);
  assert.match(advice('500','수반하지 않음'),/대상/);
  const result=caseFields({title:'상담','wf.fromGroup':facilityGroups[6],'wf.toGroup':facilityGroups[7]},use);
  assert.equal(result.details.procedure,undefined);
});

test('route changes retain files and notes, require a replacement for an inapplicable stage, and log the change',()=>{
  const c=record(use,{procedure:labels[0],fromUse:'업무시설'},'허가서 확인');
  const doc=use.docs.find(x=>x.routes?.includes(labels[0])&&!x.when);
  c.data.docs[doc.id]={status:'수합',date:'2026-11-24',note:'기존 수합'};
  assert.throws(()=>applyChange(c,'basics',basic(labels[2])));
  const {data,event:changed}=applyChange(c,'basics',basic(labels[2],{routeStage:'기재내용 변경 신청'}));
  assert.equal(data.details.fromUse,'업무시설');assert.equal(data.details.procedure,labels[2]);
  assert.deepEqual(data.docs,c.data.docs);assert.ok(!applies(doc,use,data.details));
  assert.equal(changed.stage,'기재내용 변경 신청');assert.match(changed.body,/용도변경 허가 → 건축물대장/);
  assert.throws(()=>applyChange({...c,data},'doc',{key:doc.id,status:'수합'}));
  assert.equal(applyChange({...c,data},'basics',{title:'수정'}).data.details.procedure,labels[2]);
});

test('only workflow-specific fields and valid options are accepted; existing check values remain editable',()=>{
  assert.throws(()=>caseFields({title:'a','wf.procedure':'임의 절차'},use));
  assert.throws(()=>caseFields({title:'a','wf.area':'-1'},use));
  assert.deepEqual(caseFields({title:'a','wf.fromUse':'업무시설','wf.scope':'설계·현장 지원'},use).details,{fromUse:'업무시설'});
  const c=record(use),key=use.checks[0].id;
  c.data.checks[key]={status:'충족',date:'',note:'기존'};
  assert.equal(applyChange(c,'check',{key,status:'충족',note:'메모'}).data.checks[key].note,'메모');
  assert.equal(applyChange(c,'check',{key,status:'확인 완료'}).data.checks[key].status,'확인 완료');
  assert.ok(!workLabels({...use,workflow:undefined,special:false}).history.includes('심의'));
  assert.ok(workStates({...use,workflow:undefined,special:true}).includes('충족'));
});
