import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { mergeCompetitionEdit } from '../lib/competition-edits.ts';

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === './project-color' || specifier === './workspace-navigation') return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { applyProjectActivity: apply } = await import('../lib/project-activity.ts');
const { projectColor, PROJECT_COLORS, suggestedProjectColor } = await import('../lib/project-color.ts');
hooks.deregister();

const task = { id: 'review', taskName: '평면 검토', category: 'design', status: 'in-progress', endDate: '2026-11-25' };
const project = { status: '작업중', schedules: [task] };
const log = { id: 'log', taskId: task.id, taskName: task.taskName, date: '2026-11-23', minutes: 75, author: '설계팀', body: '피난 동선 검토' };
const feedback = { id: 'feedback', taskId: task.id, taskName: task.taskName, date: '2026-11-24', author: '검토자', body: '동선 폭 확인', workLogId: log.id };
const followUp = { ...task, id: 'follow', taskName: '복도 폭 수정', assignee: '설계팀' };

test('stable legacy colors, distinct suggestions, and balanced reuse on the active calendar', () => {
  const first = { id: '공모-A', competitionData: project };
  const fallback = projectColor(first);
  assert.equal(projectColor({ ...first, title: '변경', competitionData: { ...project, status: '드롭' } }), fallback);
  assert.equal(projectColor({ ...first, competitionData: { ...project, projectColor: 'bad' } }), fallback);
  const assigned = [];
  for (let i = 0; i < PROJECT_COLORS.length; i++) {
    const next = { id: 'project-' + i, competitionData: project };
    const color = suggestedProjectColor(next, assigned);
    assigned.push({ ...next, competitionData: { ...project, projectColor: color } });
  }
  assert.equal(new Set(assigned.map(projectColor)).size, PROJECT_COLORS.length);
  const archived = assigned.map((ref, index) => index === 0
    ? { ...ref, competitionData: { ...ref.competitionData, planning: { archived: true } } } : ref);
  assert.equal(suggestedProjectColor(first, archived), projectColor(archived[0]));
  assert.equal(suggestedProjectColor(first, [first]), fallback);
  assert.equal(suggestedProjectColor(assigned[2], []), projectColor(assigned[2]));
});

test('color edits validate the palette, merge independent work, and reject a conflicting color revision', () => {
  const [first, second, third] = PROJECT_COLORS.map(color => color.value);
  const change = { type: 'projectColor', value: first };
  const saved = apply(project, change);
  assert.equal(saved.schedules, project.schedules);
  assert.equal(saved.projectColor, first);
  assert.equal(apply(saved, change), saved);
  const withTask = mergeCompetitionEdit(saved, project, { ...project, schedules: [followUp] });
  const edited = apply(withTask, { ...change, previous: first, value: second });
  assert.equal(edited.schedules[0].id, followUp.id);
  assert.throws(() => apply(edited, { ...change, previous: first, value: third }), /변경/);
  assert.throws(() => apply(edited, { ...change, previous: second, value: 'url(https://example.com)' }), /색상/);
  assert.equal(project.projectColor, undefined);
});

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

test('task submission checklist preserves other submissions, status, and Notion IDs across edits and retries', () => {
  const old = { ...project, schedules: [{ ...task, notionPageId: 'original-notion' }] };
  const first = { id:'panel', title:'A1 패널', criteria:'익명 표기 확인', checked:false };
  const second = { id:'book', title:'설명서', criteria:'페이지 순서 확인', checked:false };
  const mut = (id, value, previous) => ({ type:'deliverable', taskId:task.id, id, value, previous });
  const added = apply(apply(old, mut(first.id, first)), mut(second.id, second));
  const done = { ...first, checked:true };
  const checked = apply(added, mut(first.id, done, first));
  assert.equal(apply(checked, mut(first.id, done, first)), checked);
  assert.throws(() => apply(checked, mut(first.id, { ...first, title:'stale' }, first)), /최신/);
  assert.throws(() => apply(checked, mut(first.id, undefined, first)), /최신/);
  assert.deepEqual(checked.schedules[0].deliverables, [done, second]);
  assert.equal(checked.schedules[0].notionPageId, 'original-notion');
  assert.equal(checked.schedules[0].status, task.status);
  const synced = mergeCompetitionEdit(checked, old, { ...old, schedules:[{ ...old.schedules[0], endDate:'2026-12-11' }] });
  assert.deepEqual(synced.schedules[0].deliverables, [done, second]);
  const removed = apply(checked, mut(first.id, undefined, done));
  assert.equal(apply(removed, mut(first.id, undefined, done)), removed);
  assert.deepEqual(removed.schedules[0].deliverables, [second]);
});

test('review and result drawings follow the original feedback, validate URLs, and reject stale revisions', () => {
  const initial = { ...feedback, workLogId:undefined };
  const v3 = { number:'A-101', version:'v03', url:'https://example.org/drawings/v3' };
  const v4 = { ...v3, version:'v04', url:'https://example.org/drawings/v4', note:'동선 폭 수정' };
  const posted = apply(project, { type:'addFeedback', feedback:{ ...initial, reviewedDrawing:v3 } });
  const store = (field, value, previous) => ({ type:'drawing', feedbackId:feedback.id, field, value, previous });
  assert.throws(() => apply(posted, store('resultDrawing', v4)), /후속/);
  assert.throws(() => apply(posted, store('reviewedDrawing', { ...v3, url:'javascript:alert(1)' }, v3)), /http/);
  const linked = apply(posted, { type:'followUp', feedbackId:feedback.id, task:followUp });
  const resolved = apply(linked, store('resultDrawing', v4));
  assert.equal(apply(resolved, store('resultDrawing', v4)), resolved);
  assert.throws(() => apply(resolved, store('resultDrawing', { ...v4, note:'stale' })), /최신/);
  assert.throws(() => apply(resolved, store('reviewedDrawing', undefined)), /최신/);
  assert.deepEqual(resolved.feedback[0].reviewedDrawing, v3);
  assert.deepEqual(resolved.feedback[0].resultDrawing, v4);
  assert.equal(resolved.feedback[0].followUpTaskId, followUp.id);
  const historical = apply(project, { type:'addFeedback', feedback:initial });
  assert.deepEqual(apply(historical, store('reviewedDrawing', v3)).feedback[0].reviewedDrawing, v3);
});

test('reference design decisions are per link, preserve prior notes, and detect stale updates from both views', () => {
  const base = { type:'linkReference', referenceId:'ref', note:'참고 근거' };
  const old = apply(project, base);
  const richer = apply(old, { ...base, decision:'도면에 반영', previousNote:base.note });
  assert.deepEqual(richer.referenceLinks[0], { referenceId:'ref', note:base.note, decision:'도면에 반영' });
  assert.throws(() => apply(richer, { ...base, previousNote:base.note, decision:'다른 반영' }), /변경/);
  assert.throws(() => apply(richer, { type:'unlinkReference', referenceId:'ref', previousNote:base.note }), /변경/);
  const legacyEdit = apply(richer, { ...base, note:'검토 이유 보완', previousNote:base.note });
  assert.equal(legacyEdit.referenceLinks[0].decision, '도면에 반영');
  const cleared = apply(legacyEdit, { ...base, previousNote:'검토 이유 보완', previousDecision:'도면에 반영', decision:'' });
  assert.deepEqual(cleared.referenceLinks, old.referenceLinks);
});
