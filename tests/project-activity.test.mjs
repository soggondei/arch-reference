import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProjectActivity as apply } from '../lib/project-activity.ts';
import { mergeCompetitionEdit } from '../lib/competition-edits.ts';

const task = { id: 'review', taskName: '평면 검토', category: 'design', status: 'in-progress', endDate: '2026-11-25' };
const project = { status: '작업중', schedules: [task] };
const log = { id: 'log', taskId: task.id, taskName: task.taskName, date: '2026-11-23', minutes: 75, author: '설계팀', body: '피난 동선 검토' };
const feedback = { id: 'feedback', taskId: task.id, taskName: task.taskName, date: '2026-11-24', author: '검토자', body: '동선 폭 확인', workLogId: log.id };
const followUp = { ...task, id: 'follow', taskName: '복도 폭 수정', assignee: '설계팀' };

test('work log additions preserve unrelated records, and a lost response can be retried', () => {
  const first = apply(project, { type: 'saveLog', log });
  const second = apply(first, { type: 'saveLog', log: { ...log, id: 'next-day', date: '2026-11-24', minutes: 30 } });
  assert.equal(apply(second, { type: 'saveLog', log }), second);
  assert.equal(second.schedules, project.schedules);
  assert.deepEqual(second.workLogs.map(row => row.minutes), [75, 30]);
  assert.equal(project.workLogs, undefined);
});

test('only the viewed revision of a log may be changed, with historical title preserved', () => {
  const first = apply(project, { type: 'saveLog', log: { ...log, taskName: 'stale display title' } });
  const edited = apply(first, { type: 'saveLog', previous: log, log: { ...log, minutes: 90 } });
  assert.throws(() => apply(edited, { type: 'saveLog', previous: log, log: { ...log, body: 'another edit' } }), /최신/);
  assert.equal(apply(edited, { type: 'saveLog', previous: log, log: { ...log, minutes: 90 } }), edited);
  // Legacy schedule regeneration must preserve the journal even if its named task is removed.
  const regenerated = mergeCompetitionEdit(edited, project, { ...project, schedules: [] });
  assert.deepEqual(regenerated.workLogs, [{ ...log, minutes: 90 }]);
  const corrected = apply(regenerated, { type: 'saveLog', previous: edited.workLogs[0], log: { ...log, minutes: 80 } });
  assert.equal(corrected.workLogs[0].taskName, task.taskName);
});

test('invalid reporting dates, amounts, and missing owner tasks are rejected', () => {
  for (const minutes of [0, -1, 3.5, 1441, NaN]) assert.throws(() => apply(project, { type: 'saveLog', log: { ...log, minutes } }), /투입시간/);
  for (const date of ['2026-02-29', '2026-13-01', '2026-2-10', '']) assert.throws(() => apply(project, { type: 'saveLog', log: { ...log, date } }), /날짜/);
  assert.throws(() => apply(project, { type: 'saveLog', log: { ...log, taskId: 'missing' } }), /업무/);
  assert.throws(() => apply(project, { type: 'addFeedback', feedback }), /일지/);
  const wrongTask = { ...project, workLogs: [{ ...log, taskId: 'other' }] };
  assert.throws(() => apply(wrongTask, { type: 'addFeedback', feedback }), /일지/);
});

test('feedback conversion creates exactly one task atomically, including a second submission with a different ID', () => {
  const withLog = apply(project, { type: 'saveLog', log });
  const withFeedback = apply(withLog, { type: 'addFeedback', feedback });
  const result = apply(withFeedback, { type: 'followUp', feedbackId: feedback.id, task: followUp });
  assert.equal(result.schedules.length, 2);
  assert.equal(result.feedback[0].followUpTaskId, followUp.id);
  assert.equal(result.feedback[0].workLogId, log.id);
  assert.equal(result.schedules.find(row => row.id === followUp.id).status, 'planned');
  assert.equal(apply(result, { type: 'followUp', feedbackId: feedback.id, task: { ...followUp, id: 'competitor' } }), result);
  assert.equal(apply(result, { type: 'addFeedback', feedback }), result);
  assert.throws(() => apply(withFeedback, { type: 'followUp', feedbackId: feedback.id, task }), /등록된 업무/);
  assert.equal(withFeedback.feedback[0].followUpTaskId, undefined);
});

test('a reference is linked independently per project and concurrent notes are preserved', () => {
  const link = { type: 'linkReference', referenceId: 'ref-a', note: '입면 리듬' };
  const first = apply(project, link);
  const second = apply({ status: '작업중', workspaceKind: 'project' }, { ...link, note: '재료 접합' });
  assert.equal(apply(first, link), first);
  const updated = apply(first, { ...link, previousNote: link.note, note: '상부 입면' });
  assert.throws(() => apply(updated, { ...link, previousNote: link.note, note: 'stale' }), /변경/);
  assert.throws(() => apply(updated, { type: 'unlinkReference', referenceId: 'ref-a', previousNote: link.note }), /변경/);
  const unlinked = apply(updated, { type: 'unlinkReference', referenceId: 'ref-a', previousNote: '상부 입면' });
  assert.equal(unlinked.referenceLinks.length, 0);
  assert.deepEqual(second.referenceLinks, [{ referenceId: 'ref-a', note: '재료 접합' }]);
});
