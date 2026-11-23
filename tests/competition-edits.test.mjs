import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCompetitionEdit, recordTaskCompletions } from '../lib/competition-edits.ts';

test('completion dates follow the change of status and survive retries or reopenings', () => {
  const initial = {schedules:[{id:'a',status:'planned'},{id:'legacy',status:'done'}]};
  const done = {...initial,schedules:initial.schedules.map(task=>({...task,status:'done'}))};
  const saved = recordTaskCompletions(initial,done,'2026-11-23');
  assert.deepEqual(saved.schedules[0].completedDates,['2026-11-23']);
  assert.equal(saved.schedules[1].completedDates,undefined);
  assert.deepEqual(recordTaskCompletions(saved,saved,'2026-11-24'),saved);
  const reopened = {schedules:[{...saved.schedules[0],status:'in-progress'}]};
  const again = recordTaskCompletions(reopened,{schedules:[{...reopened.schedules[0],status:'done'}]},'2026-11-26');
  assert.deepEqual(again.schedules[0].completedDates,['2026-11-23','2026-11-26']);
});

const print = { id: 'print', taskName: '인쇄물 점검', category: 'admin', status: 'planned', endDate: '2026-11-23' };
const bind = { ...print, id: 'bind', taskName: '제출물 제본', endDate: '2026-11-25' };
const before = { status: '작업중', schedules: [print, bind] };

test('dropping and resuming a competition preserves concurrent work and its existing Notion links', () => {
  const current = {
    ...before,
    notionPageId: 'project-page',
    schedules: [{ ...print, assignee: '담당자', notionPageId: 'task-page' }, bind],
    workLogs: [{ id: 'log', taskId: print.id, taskName: print.taskName, author: '담당자', date: print.endDate, minutes: 45, body: '검토 완료' }],
    feedback: [{ id: 'feedback', taskId: print.id, taskName: print.taskName, author: '담당자', date: print.endDate, body: '서체 확인', workLogId: 'log' }],
    referenceLinks: [{ referenceId: 'ref', note: '표지 참고' }],
  };
  const dropped = mergeCompetitionEdit(current, before, { ...before, status: '드롭' });
  assert.deepEqual(dropped, { ...current, status: '드롭' });
  assert.deepEqual(mergeCompetitionEdit(dropped, dropped, { ...dropped, status: '작업중' }), current);
});

test('a stale Notion sync only applies its new page IDs and preserves office changes', () => {
  const current = { ...before, scheduleRevision: 4, schedules: [{ ...print, status: 'done', assignee: '담당자' }, bind] };
  const synced = { ...before, schedules: [{ ...print, notionPageId: 'page' }, bind] };
  const result = mergeCompetitionEdit(current, before, synced);
  assert.deepEqual(result.schedules, [{ ...current.schedules[0], notionPageId: 'page' }, bind]);
  assert.equal(result.scheduleRevision, 4);
});

test('a stale addition or deletion preserves tasks added elsewhere and never revives deleted tasks', () => {
  const other = { ...bind, id: 'other', taskName: '자료 확인' };
  const current = { ...before, schedules: [bind, other] };
  const added = { ...bind, id: 'new', taskName: '제출 준비' };
  const next = { ...before, schedules: [{ ...print, status: 'done' }, added] };
  assert.deepEqual(mergeCompetitionEdit(current, before, next).schedules, [other, added]);
  assert.deepEqual(mergeCompetitionEdit({ ...current, schedules: [other, added] }, before, next).schedules, [other, added]);
});

test('independently initialized templates cannot create two sets of deadlines', () => {
  const empty = { ...before, schedules: [] };
  const duplicate = { ...before, schedules: before.schedules.map(item => ({ ...item, id: 'new-' + item.id })) };
  assert.throws(() => mergeCompetitionEdit(before, empty, duplicate), /먼저 등록/);
  assert.deepEqual(mergeCompetitionEdit(before, empty, before).schedules, before.schedules);
});
