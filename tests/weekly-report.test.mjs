import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, durationLabel, weekBounds } from '../lib/weekly-report.ts';

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
