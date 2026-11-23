import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlanning, assignedPhase, phaseSummary, phasesFor, trackCompetitionTransition } from '../lib/project-planning.ts';

const project = {status:'작업중',schedules:[{id:'d',taskName:'도면작업'}, {id:'u',taskName:'추가 업무'}]};
const log = (id,taskId,taskName,date,minutes) => ({ id, taskId, taskName,date,minutes,author:'설계팀',body:id });
const publicLog = log('notion-1','d','도면작업','2026-11-23',90);
const shared = log('personal:2','d','도면작업','2026-11-24',60);
const review = {id:'review-a',day:'2026-11-24',outcome:'드롭',phase:'production',reason:'배정 가능한 시간 부족',lesson:'남은 설계시간을 먼저 확인',reusable:'계획 평면',url:'https://example.org/drawing',minutes:150};
const changes = (budgets=[],assignments=[])=>({kind:'setPlan',budgets,assignments});
const close = (r=review, previousVersion=null, lifecycleRevision=0)=>({kind:'saveReview',review:r,previousVersion,lifecycleRevision});

test('standard competition task names get useful defaults; shared hours and retained historic names count once',()=>{
  const existing={...project,workLogs:[publicLog,publicLog,log('historic','deleted','이전 업무','2026-11-25',45)]};
  const report=phaseSummary(existing,[shared,shared]);
  assert.equal(report.totalActual,195);
  assert.equal(report.rows.find(r=>r.id==='production').actualMinutes,150);
  assert.equal(report.rows.find(r=>r.id===null).actualMinutes,45);
  assert.equal(phaseSummary(existing,[shared],'2026-11-23').totalActual,90);
  assert.equal(report.hasPlan,false);
  assert.equal(assignedPhase({...project, workspaceKind:'project'},'d','도면작업'),null);
  assert.equal(assignedPhase(project,'q','도면작업 추가'),null);
});

test('phase budget and task patches merge disjoint edits, replay idempotently, and reject stale writes atomically',()=>{
  const first=changes([{key:'production',after:480}], [{key:'d',after:'concept'}]);
  const planned=applyPlanning(project,first);
  assert.equal(applyPlanning(planned,first),planned);
  const second=applyPlanning(planned,changes([{key:'concept',after:0}]));
  assert.equal(phaseSummary({...second,workLogs:[publicLog]},[shared]).rows.find(r=>r.id==='concept').actualMinutes,150);
  const unassigned=applyPlanning(second,changes([], [{key:'d',before:'concept',after:null}]));
  assert.equal(assignedPhase(unassigned,'d','도면작업'),null);
  const restored=applyPlanning(unassigned,changes([], [{key:'d',before:null,after:undefined}]));
  assert.equal(assignedPhase(restored,'d','도면작업'),'production');
  assert.throws(()=>applyPlanning(restored,changes([{key:'research',after:500},{key:'production',after:90}])),/변경/);
  assert.equal(restored.planning.budgets.research,undefined);
  assert.throws(()=>applyPlanning(restored,changes([{key:'production',before:480,after:-2}])),/설정/);
  assert.throws(()=>applyPlanning(restored,changes([],[{key:'__proto__',after:'research'}])),/설정/);
});

test('ordinary projects can use contract phases, archive, update old notes and reopen without losing history',()=>{
  const ordinary={...project,workspaceKind:'project'};
  const custom={kind:'addPhase',phase:{id:'site-review',label:'현장 검토'}};
  const withPhase=applyPlanning(ordinary,custom);
  assert.equal(applyPlanning(withPhase,custom),withPhase);
  assert.ok(phasesFor(withPhase).some(p=>p.id==='documents'));
  assert.throws(()=>applyPlanning(withPhase,{kind:'addPhase',phase:{id:'another',label:'현장 검토'}}),/이미/);
  const input={...review,outcome:'종료',phase:'site-review'};
  const done=applyPlanning(withPhase,close(input));
  assert.equal(done.planning.archived,true);
  assert.equal(done.status,'작업중');
  assert.equal(applyPlanning(done,close(input)),done);
  assert.throws(()=>applyPlanning(done,{kind:'reopen',lifecycleRevision:0}),/변경/);
  const reopened=applyPlanning(done,{kind:'reopen',lifecycleRevision:1});
  const edited=applyPlanning(reopened,close({...input,lesson:'체크리스트 보완'},1));
  assert.equal(edited.planning.archived,false);
  assert.equal(edited.planning.currentCloseout,null);
  assert.equal(edited.planning.closeouts[0].version,2);
  assert.throws(()=>applyPlanning(edited,close({...input,lesson:'늦은 편집'},1)),/변경/);
});

test('completing an ordinary project records its day and can be reopened or reviewed independently', () => {
  const ordinary = { ...project, workspaceKind: 'project', workLogs: [publicLog] };
  const finish = { kind: 'complete', id: 'finish-1', day: '2026-11-23', lifecycleRevision: 0 };
  const done = applyPlanning(ordinary, finish);
  assert.equal(done.planning.archived, true);
  assert.equal(done.planning.closeouts[0].day, finish.day);
  assert.equal(done.planning.closeouts[0].minutes, null);
  assert.equal(done.workLogs, ordinary.workLogs);
  assert.equal(done.schedules, ordinary.schedules);
  assert.equal(applyPlanning(done, finish), done);
  const reviewed = applyPlanning(done, close({ ...review, id: finish.id, outcome: '종료', phase: null }, 1, 1));
  assert.equal(reviewed.planning.closeouts[0].reason, review.reason);
  const reopened = applyPlanning(reviewed, { kind: 'reopen', lifecycleRevision: 1 });
  assert.equal(reopened.planning.archived, false);
  assert.equal(reopened.planning.closeouts.length, 1);
  assert.throws(() => applyPlanning(reopened, finish), /변경/);
  assert.throws(() => applyPlanning(project, finish), /일반 프로젝트/);
  assert.throws(() => applyPlanning({ ...ordinary, workspaceKind: 'office' }, finish), /프로젝트/);
  assert.throws(() => applyPlanning(ordinary, { ...finish, day: '2026-11-31' }), /완료일/);
});

test('dropping in either existing status management or the planning form preserves schedules, dated episodes and evidence',()=>{
  const data={...project,workLogs:[publicLog],feedback:[{id:'feedback'}],notionPageId:'notion-project'};
  const dropped=trackCompetitionTransition(data,{...data,status:'드롭'},'event','2026-11-24');
  const event=dropped.planning.closeouts[0];
  assert.deepEqual([event.day,event.minutes,event.reason],['2026-11-24',null,'']);
  const filled=applyPlanning(dropped,close({...review,id:event.id},1,1));
  const reopened=trackCompetitionTransition(filled,{...filled,status:'작업중'},'unused','2026-11-25');
  assert.equal(reopened.planning.currentCloseout,null);
  const again=applyPlanning(reopened,close({...review,id:'new',day:'2026-11-26'},null,2));
  assert.deepEqual(again.planning.closeouts.map(x=>x.day),['2026-11-24','2026-11-26']);
  assert.equal(again.workLogs,data.workLogs);
  assert.equal(again.feedback,data.feedback);
  assert.equal(again.schedules,data.schedules);
  assert.equal(again.notionPageId,data.notionPageId);
});

test('historic outcomes retain their actual event date; malformed URLs and false dates never enter the report',()=>{
  const legacy={...project,status:'탈락'};
  for(const patch of [{day:'2026-02-29'}, {outcome:'드롭'}, {reason:' '},{url:'javascript:alert(1)'},{minutes:null}]) {
    assert.throws(()=>applyPlanning(legacy,close({...review,outcome:'탈락',...patch})));
  }
  const archived=applyPlanning(legacy,close({...review,outcome:'탈락',day:'2026-10-15'}));
  assert.equal(archived.planning.closeouts[0].day,'2026-10-15');
  assert.equal(archived.status,'탈락');
});
