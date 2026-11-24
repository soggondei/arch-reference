import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const lib = new URL('../lib/', import.meta.url).href;
registerHooks({ resolve(spec, context, next) {
  return next(context.parentURL?.startsWith(lib) && spec.startsWith('./') && !spec.endsWith('.ts') ? spec + '.ts' : spec, context);
} });
const { applyProcess, checkedProcessTemplates, DEFAULT_PROCESS_LIBRARY, processRows } = await import('../lib/process-template.ts');
const { generateScheduleTemplate } = await import('../lib/schedule-template.ts');
const { phaseSummary } = await import('../lib/project-planning.ts');
const [competition, privateDesign, admin] = DEFAULT_PROCESS_LIBRARY.templates;
const cd = { status: '작업중', submissionDate: '2026-11-27', schedules: [] };

test('the original 18 competition processes keep their dates, and official generation can run independently', () => {
  const schedules = generateScheduleTemplate(cd);
  assert.equal(competition.steps.length, 18);
  assert.equal(schedules.length, 19);
  assert.deepEqual(generateScheduleTemplate(cd, null).map(item => item.taskName), ['작품접수']);
  const rows = processRows(cd, competition);
  for (const row of rows) {
    const scheduled = schedules.find(item => item.taskName === row.taskName);
    assert.equal(scheduled.endDate, row.endDate);
    assert.equal(scheduled.startDate || scheduled.endDate, row.startDate);
    assert.equal(scheduled.processStepId, row.stepId);
  }
  const drawing = rows.find(row => row.stepId === 'drawings');
  assert.deepEqual([drawing.startDate, drawing.endDate, drawing.durationDays], ['2026-11-11', '2026-11-22', 12]);
});

test('legacy adoption preserves calendar IDs, Notion, logs, phases, custom/retired tasks and project dates', () => {
  const drawing = { id: 'existing', taskName: '도면작업', category: 'design', status: 'in-progress', endDate: '2026-11-18', assignee: 'PM', notionPageId: 'linked' };
  const retired = { ...drawing, id: 'old', taskName: '최종수정' };
  const custom = { ...drawing, id: 'custom', taskName: '직접 만든 업무' };
  const log = { id: 'logged', taskId: 'existing', taskName: '도면작업', minutes: 90, date: '2026-11-15' };
  const data = { ...cd, schedules: [drawing, retired, custom], workLogs: [log], feedback: [{ taskId: drawing.id, id: 'review' }] };
  const renamed = { ...competition, steps: [{ ...competition.steps.find(step => step.id === 'drawings'), taskName: '도면 작성 및 검토' }] };
  const baseline = processRows(data, renamed);
  assert.deepEqual([baseline[0].taskId, baseline[0].taskName, baseline[0].endDate], ['existing','도면 작성 및 검토','2026-11-18']);
  const saved = applyProcess(data, renamed, baseline, baseline);
  const kept = saved.schedules.find(item => item.id === 'existing');
  assert.equal(kept.taskName, '도면 작성 및 검토');
  assert.deepEqual([kept.endDate, kept.status, kept.assignee, kept.notionPageId], [drawing.endDate, drawing.status, drawing.assignee, drawing.notionPageId]);
  assert.equal(saved.schedules.length, 3);
  assert.equal(saved.schedules.find(item => item.id === 'old'), retired);
  assert.equal(saved.schedules.find(item => item.id === 'custom'), custom);
  assert.equal(data.workLogs, saved.workLogs);
  assert.equal(data.feedback, saved.feedback);
  assert.equal(phaseSummary(saved).rows.find(row => row.id === 'production').actualMinutes, 90);
  assert.deepEqual(applyProcess(saved, renamed, baseline, baseline), saved);
});

test('undated local names and durations survive reopens and template revisions until assigned actual dates', () => {
  const local = { ...cd, workspaceKind: 'project' };
  const rows = processRows(local, admin, '');
  const draft = { ...rows[0], taskName: '서무 요청 확인', durationDays: 7 };
  const saved = applyProcess(local, admin, [draft], rows);
  assert.equal(saved.schedules.length, 0);
  const renamed = { ...admin, steps: [{...admin.steps[0], taskName: '개정된 기본명', durationDays: 3}, ...admin.steps.slice(1)] };
  const [undated] = processRows(saved, renamed);
  assert.deepEqual([undated.taskName, undated.startDate, undated.endDate, undated.durationDays], ['서무 요청 확인', '', '', 7]);
  const [dated] = processRows(saved, renamed, '2026-12-22');
  assert.deepEqual([dated.startDate,dated.endDate], ['2026-12-12','2026-12-18']);
  const scheduled = applyProcess(saved, renamed, [dated], [undated]);
  assert.equal(scheduled.processDrafts.length, 0);
  assert.equal(scheduled.schedules.length, 1);
  const updated = { ...renamed, steps: [{ ...renamed.steps[0], taskName: '기본명 재개정', durationDays: 9 }, ...renamed.steps.slice(1)] };
  const [next] = processRows(scheduled, updated);
  assert.deepEqual([next.taskName, next.startDate,next.endDate,next.taskId], ['서무 요청 확인','2026-12-12','2026-12-18',scheduled.schedules[0].id]);
});

test('adopt legacy local titles when recorded work uniquely identifies the original generated task', () => {
  const data = { ...cd, schedules: [{ id:'renamed', taskName:'협의 도면 작성', category:'design', endDate:'2026-11-18', status:'done' }],
    workLogs: [{id:'log',taskId:'renamed',taskName:'도면작업',minutes:60,date:'2026-11-16'}] };
  const template = { ...competition, steps:[{...competition.steps.find(step => step.id === 'drawings'),taskName:'도면 제작'}] };
  const rows = processRows(data,template);
  assert.equal(rows[0].taskId,'renamed');
  assert.equal(rows[0].taskName,'협의 도면 작성');
  const result = applyProcess(data,template,rows,rows);
  assert.equal(result.schedules.length,1);
  assert.equal(result.schedules[0].status,'done');
  assert.equal(result.schedules[0].endDate,'2026-11-18');
});

test('scope step IDs by type, preserve retired schedules, reject stale date edits and closed projects', () => {
  const first = { ...admin, steps: [admin.steps[0]] };
  const second = { ...privateDesign, steps: [{ ...admin.steps[0], taskName: '새 계약 업무' }] };
  const saved = applyProcess(cd, first, processRows(cd, first));
  const revised = applyProcess(saved, second, processRows(saved, second));
  assert.equal(revised.schedules.length, 2);
  const original = saved.schedules[0];
  assert.deepEqual(revised.schedules.find(item => item.id === original.id), original);
  const [before] = processRows(revised, second);
  const moved = applyProcess(revised, second, [{...before, startDate:'2026-11-03', endDate:'2026-11-04', durationDays:2}], [before]);
  assert.throws(() => applyProcess(moved, second, [{...before,startDate:'2026-12-03',endDate:'2026-12-04'}], [before]), /다른 곳/);
  const merged = applyProcess(moved, second, [{...before,taskName:'별도 변경'}], [before]);
  assert.equal(merged.schedules.find(item => item.id === before.taskId).endDate, '2026-11-04');
  assert.equal(merged.schedules.find(item => item.id === before.taskId).taskName,'별도 변경');
  assert.throws(() => applyProcess({...moved,status:'드롭'}, second,[],[]), /완료/);
  assert.throws(() => checkedProcessTemplates([first,first]), /유형/);
});

test('Supabase compare-and-swap protects global edits and projects; reapplying uses the same identity', async t => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://process-fixture.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-key';
  const { getProcessLibrary, saveProcessLibrary, saveProjectProcess } = await import('../lib/store.ts');
  const office = 'lv-lab-office-common', id = 'reviewed-candidate';
  const records = new Map([[id, { id, title: '검토 공모', competition_data: { ...cd, status: '관심', projectColor: '#112233' } }]]);
  const copy = r => structuredClone(r);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const q = new URL(url).searchParams;
    if (options.method === 'POST') {
      const record = JSON.parse(options.body);
      if (!records.has(record.id)) records.set(record.id, record);
      return new Response(null, {status:201});
    }
    const key=q.get('id')?.slice(3);
    const record = records.get(key);
    if (options.method === 'GET' && q.get('select') === 'library:competition_data->processLibrary') {
      return Response.json(record ? [{library:record.competition_data.processLibrary ?? null}] : []);
    }
    if (options.method === 'GET') return Response.json(copy(record));
    assert.equal(options.method,'PATCH');
    const rev=record.competition_data.scheduleRevision;
    if (q.get('competition_data->>scheduleRevision') !== (rev===undefined?'is.null':'eq.'+rev)) return Response.json([]);
    Object.assign(record, JSON.parse(options.body));
    return Response.json([copy(record)]);
  });
  const initial = await getProcessLibrary();
  assert.equal(initial.revision,0);
  const modified = {...competition, name:'현상 공모'};
  const next = await saveProcessLibrary(0,[modified,privateDesign,admin]);
  assert.equal(next.revision,1);
  assert.equal(records.get(office).competition_data.workspaceKind,'office');
  await assert.rejects(saveProcessLibrary(0,[competition,admin]),/기본 프로세스가 변경/);
  const data = records.get(id).competition_data;
  const preview = processRows(data,modified,'');
  await assert.rejects(saveProjectProcess(id,competition,preview,preview,{startProject:true}),/기본 프로세스/);
  await assert.rejects(saveProjectProcess(id,modified,preview,preview),/진행을 시작/);
  const [row]=preview;
  const edits=[{...row,startDate:'2026-11-24',endDate:'2026-11-24'}];
  const saved = await saveProjectProcess(id,modified,edits,preview,{expectedTemplateId:undefined,startProject:true});
  assert.equal(saved.competitionData.status,'작업중');
  assert.equal(saved.competitionData.schedules.length,1);
  const again = await saveProjectProcess(id,modified,edits,preview,{expectedTemplateId:undefined,startProject:true});
  assert.equal(again.competitionData.schedules.length,1);
  assert.equal(again.competitionData.schedules[0].id,saved.competitionData.schedules[0].id);
});
