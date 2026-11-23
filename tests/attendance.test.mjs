import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceDate, attendanceTime, durationLabel, shiftMilliseconds } from '../lib/attendance.ts';

test('attendance dates use the Seoul calendar across midnight and month end', () => {
  assert.equal(attendanceDate('2026-11-30T14:59:59Z'), '2026-11-30');
  assert.equal(attendanceDate('2026-11-30T15:00:00Z'), '2026-12-01');
  assert.equal(attendanceTime('2026-11-30T15:00:00Z'), '00:00:00');
});

test('completed shifts sum elapsed time across midnight while an open shift contributes zero', () => {
  const shifts = [
    { clock_in: '2026-11-30T13:30:00Z', clock_out: '2026-11-30T17:00:00Z' },
    { clock_in: '2026-12-01T00:00:00Z', clock_out: '2026-12-01T00:15:08Z' },
    { clock_in: '2026-12-01T01:00:00Z', clock_out: null },
  ];
  assert.equal(durationLabel(shifts.reduce((sum, shift) => sum + shiftMilliseconds(shift), 0)), '3시간 45분 8초');
  assert.equal(durationLabel(shiftMilliseconds(shifts[2])), '0초');
});
