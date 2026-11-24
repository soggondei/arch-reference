import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === './workspace-navigation' ? specifier + '.ts' : specifier, context);
} });
const { buildWeeklyReport, durationLabel, weekBounds, weeklyDecisions } = await import('../lib/weekly-report.ts');
hooks.deregister();

test('weekly decisions use recorded completion days and only show current open actions for active projects', () => {
  const base = {taskName:'평면',endDate:'2026-11-25',category:'design',status:'planned'};
  const data = {status:'작업중',schedules:[
    {...base,id:'legacy',status:'done'}, {...base,id:'finished',status:'done',completedDates:['2026-11-23']},
    {...base,id:'reply',waitingFor:'구조 회신',nextAction:'도면 검토'},
    {...base,id:'delivery',isMilestone:true},
  ]};
  const now = weeklyDecisions(data,'2026-11-23','2026-11-23');
  assert.deepEqual(now.completed.map(x=>x.task.id), ['finished']);
  assert.deepEqual(now.waiting.map(x=>x.id), ['reply']);
  assert.deepEqual(now.actions.map(x=>x.id), ['reply']);
  assert.equal(now.nextDelivery.id,'delivery');
  assert.equal(weeklyDecisions(data,'2026-11-15','2026-11-23').live,false);
  assert.equal(weeklyDecisions({...data,status:'드롭'},'2026-11-23','2026-11-23').live,false);
  assert.equal(weeklyDecisions({...data,status:'관심'},'2026-11-23','2026-11-23').live,false);
  assert.equal(weeklyDecisions({...data,workspaceKind:'project',planning:{archived:true}},'2026-11-23','2026-11-23').live,false);
});

test('a shared time entry is included once together with existing project logs', () => {
  const baseline = {id:'office-log',date:'2026-11-23',author:'기존',taskId:'plan',taskName:'도면작업',minutes:60,body:'평면 검토'};
  const shared = {...baseline,id:'personal:shared',author:'사무소 대표',minutes:90};
  const d = {workLogs:[baseline]};
  assert.equal(buildWeeklyReport(d,baseline.date,[shared,shared]).minutes,150);
  assert.equal(buildWeeklyReport(d,baseline.date,[{...shared,minutes:30}]).minutes,90);
  assert.equal(buildWeeklyReport(d,baseline.date,[]).minutes,60);
});

test('uses Monday to Sunday across month, leap-day, and year boundaries', () => {
  assert.deepEqual(weekBounds('2027-01-03'), ['2026-12-28', '2027-01-03']);
  assert.deepEqual(weekBounds('2027-01-04'), ['2027-01-04', '2027-01-10']);
  assert.deepEqual(weekBounds('2024-02-29'), ['2024-02-26', '2024-03-03']);
});

test('attributes integer minutes to the recorded date, task and author once per log ID', () => {
  const first = { id: 'a', taskId: 'plan', taskName: '평면', author: '김', date: '2026-12-28', minutes: 65, body: '선 검토' };
  const data = {
    schedules: [{ id: 'plan', taskName: '1층 평면', status: 'planned' }],
    workLogs: [
      { ...first, id: 'before', date: '2026-12-27' }, first, first,
      { ...first, id: 'b', author: '이', minutes: 45 },
      { ...first, id: 'c', taskId: 'old', taskName: '삭제 전 업무명', date: '2027-01-03', minutes: 60 },
      { ...first, id: 'after', date: '2027-01-04' },
    ],
  };
  const report = buildWeeklyReport(data, '2027-01-01');
  assert.equal(report.minutes, 170);
  assert.equal(report.logCount, 3);
  assert.deepEqual(report.tasks.map(x => [x.label, x.minutes]), [['1층 평면', 110], ['삭제 전 업무명', 60]]);
  assert.deepEqual(report.authors.map(x => [x.label, x.minutes]), [['김', 125], ['이', 45]]);
  assert.deepEqual(report.days.map(x => [x.date, x.minutes, x.logs.length]), [['2026-12-28', 110, 2], ['2027-01-03', 60, 1]]);
  assert.equal(durationLabel(report.minutes), '2시간 50분');
});

test('includes feedback by its own date even without a log that week and resolves the actual follow-up', () => {
  const f = { id: 'f1', taskId: 'source', taskName: '검토', author: '박', body: '보완', date: '2026-12-29', followUpTaskId: 'next' };
  const data = {
    schedules: [{ id: 'next', taskName: '도면 보완', status: 'done' }],
    feedback: [f, f, { ...f, id: 'f2', date: '2027-01-04' }],
  };
  const report = buildWeeklyReport(data, '2027-01-01');
  assert.equal(report.minutes, 0);
  assert.deepEqual(report.feedback, [f]);
  assert.equal(report.schedule.get(report.feedback[0].followUpTaskId).status, 'done');
  assert.equal(buildWeeklyReport(undefined, '2027-01-01').logCount, 0);
  assert.equal(buildWeeklyReport({ status: '작업중' }, '2027-01-01').feedback.length, 0);
});
