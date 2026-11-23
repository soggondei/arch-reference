import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { phaseSummary } from '../lib/project-planning.ts';

const library = new URL('../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(library) && specifier.startsWith('./') && !specifier.endsWith('.ts')) {
    return next(specifier + '.ts', context);
  }
  return next(specifier, context);
} });
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://schedule-test.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-fixture';
const { patchOfficeSchedule, addOfficeTask } = await import('../lib/store.ts');

function backend(t, data) {
  const row = { id: 'market', title: '시장 공모', competition_data: structuredClone(data) };
  t.mock.method(globalThis, 'fetch', async (target, options = {}) => {
    const url = new URL(target);
    assert.equal(url.origin + url.pathname, 'https://schedule-test.invalid/rest/v1/refs');
    assert.equal(url.searchParams.get('id'), 'eq.market');
    if (options.method === 'GET') return Response.json(row);
    assert.equal(options.method, 'PATCH');
    const revision = row.competition_data.scheduleRevision;
    const guard = url.searchParams.get('competition_data->>scheduleRevision');
    if (guard !== (revision === undefined ? 'is.null' : 'eq.' + revision)) return Response.json([]);
    Object.assign(row, JSON.parse(options.body));
    return Response.json([row]);
  });
  return row;
}

const drawing = { id: 'a', taskName: '도면작업', category: 'design', status: 'planned', endDate: '2026-11-23', notionPageId: 'linked' };
test('renaming an ordinary task keeps links and phase hours, including during independent edits and retries', async t => {
  const log = { id: 'log', taskId: 'a', taskName: '도면작업', minutes: 90, date: '2026-11-22' };
  const feedback = { id: 'feedback', taskId: 'a', taskName: '도면작업' };
  const data = { status: '작업중', schedules: [drawing], workLogs: [log], feedback: [feedback] };
  const row = backend(t, data);
  await Promise.all([
    patchOfficeSchedule('market', 'a', { taskName: '  단면 협의  ', category: 'admin', isMilestone: true }, drawing),
    patchOfficeSchedule('market', 'a', { assignee: '대표' }, drawing),
  ]);
  const saved = row.competition_data;
  assert.deepEqual(saved.schedules[0], { ...drawing, taskName: '단면 협의', category: 'admin', isMilestone: true, assignee: '대표' });
  assert.deepEqual(saved.workLogs, [log]);
  assert.deepEqual(saved.feedback, [feedback]);
  assert.equal(saved.planning.assignments.a, 'production');
  assert.equal(phaseSummary(saved).rows.find(p => p.id === 'production').actualMinutes, 90);
  await patchOfficeSchedule('market', 'a', { taskName: '단면 협의' }, drawing);
  assert.equal(row.competition_data.scheduleRevision, saved.scheduleRevision);
  await assert.rejects(patchOfficeSchedule('market', 'a', { taskName: '오래된 이름' }, drawing), /같은 업무 항목/);
  await assert.rejects(patchOfficeSchedule('market', 'a', { category: 'external' }, drawing), /같은 업무 항목/);
  await assert.rejects(patchOfficeSchedule('market', 'a', { isMilestone: false }, drawing), /같은 업무 항목/);
  assert.equal(row.competition_data.scheduleRevision, saved.scheduleRevision);
});

test('official milestone identities are protected and invalid fields do not persist', async t => {
  const official = { ...drawing, taskName: '작품접수', category: 'external', isMilestone: true };
  const row = backend(t, { status: '등록완료', submissionDate: official.endDate, schedules: [official] });
  for (const patch of [{ taskName: '작품접수 수정' }, { category: 'admin' }, { isMilestone: false }]) {
    await assert.rejects(patchOfficeSchedule('market', 'a', patch, official), /공식 일정/);
  }
  await assert.rejects(patchOfficeSchedule('market', 'a', { taskName: '  ' }, official), /일정명/);
  await assert.rejects(addOfficeTask('market', { ...drawing, id: 'bad', category: 'other' }), /구분/);
  await patchOfficeSchedule('market', 'a', { status: 'in-progress' }, official);
  assert.deepEqual(row.competition_data.schedules, [{ ...official, status: 'in-progress' }]);
});
