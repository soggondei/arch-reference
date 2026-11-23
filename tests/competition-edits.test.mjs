import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCompetitionEdit } from '../lib/competition-edits.ts';

const print = { id: 'print', taskName: '인쇄물 점검', category: 'admin', status: 'planned', endDate: '2026-11-23' };
const bind = { ...print, id: 'bind', taskName: '제출물 제본', endDate: '2026-11-25' };
const before = { status: '작업중', schedules: [print, bind] };

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
