import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { calendarHref, directoryGroupFor, isActiveWorkspaceProject, parseDirectoryGroup, projectDirectoryHref, projectHref, scheduleHref, workspaceSection } from '../lib/workspace-navigation.ts';

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === './competition-dates' || specifier === './workspace-navigation') {
    return next(specifier + '.ts', context);
  }
  return next(specifier, context);
} });
const { weekBounds } = await import('../lib/weekly-report.ts');
const { buildCalendarEvents, calendarBounds, calendarMonthDays, eventsInRange, isCalendarDate,
  isOfficialCalendarTask, nearestCalendarDate, redateOfficialCalendarTasks, shiftCalendar } = await import('../lib/project-calendar.ts');
const { generateScheduleTemplate } = await import('../lib/schedule-template.ts');
hooks.deregister();

test('project management defaults to the directory and keeps submitted, terminal and office work distinct', () => {
  const route = search => {
    const query = new URLSearchParams(search);
    return workspaceSection(query.get('tab'), query);
  };
  assert.equal(route('tab=projects'), 'directory');
  assert.equal(route('tab=projects&group=completed'), 'directory');
  for (const group of ['candidate', 'completed', 'dropped']) {
    assert.equal(projectDirectoryHref(group), '/?tab=projects&group=' + group);
    assert.equal(parseDirectoryGroup(group), group);
  }
  assert.equal(parseDirectoryGroup('other'), 'active');
  assert.equal(route('tab=projects&section=calendar'), 'calendar');
  assert.equal(route('tab=projects&project=p'), 'calendar');
  assert.equal(route('tab=projects&project=p&task=t'), 'schedule');
  assert.equal(route('tab=projects&project=p&section=calendar&task=t'), 'calendar');
  assert.equal(route('tab=schedule'), 'calendar');
  assert.equal(route('tab=schedule&task=t&taskProject=other'), 'calendar');
  for (const status of ['등록예정','등록완료','작업중','제출완료']) {
    assert.equal(directoryGroupFor({competitionData:{status}}), 'active');
  }
  for (const status of ['입선','탈락']) {
    assert.equal(directoryGroupFor({competitionData:{status}}), 'completed');
  }
  assert.equal(directoryGroupFor({competitionData:{status:'관심'}}), null);
  assert.equal(directoryGroupFor({competitionData:{status:'관심',processTemplateId:'competition'}}), 'candidate');
  const candidate = {competitionData:{status:'관심', schedules:[{id:'scheduled'}]}};
  assert.equal(directoryGroupFor(candidate), 'candidate');
  assert.equal(isActiveWorkspaceProject(candidate), false);
  assert.equal(directoryGroupFor({competitionData:{status:'드롭',planning:{archived:true}}}), 'dropped');
  assert.equal(directoryGroupFor({competitionData:{status:'드롭'}}), 'dropped');
  const drop = {id:'stopped',outcome:'드롭'};
  const general = {status:'작업중',workspaceKind:'project'};
  assert.equal(directoryGroupFor({competitionData:{...general,planning:{archived:true,currentCloseout:drop.id,closeouts:[drop]}}}), 'dropped');
  assert.equal(directoryGroupFor({competitionData:{...general,planning:{archived:false,currentCloseout:null,closeouts:[drop]}}}), 'active');
  assert.equal(directoryGroupFor({competitionData:{status:'작업중',workspaceKind:'office'}}), null);
  assert.equal(directoryGroupFor({competitionData:{status:'작업중',workspaceKind:'project'}}), 'active');
  assert.equal(directoryGroupFor({competitionData:{status:'작업중',workspaceKind:'project',planning:{archived:true}}}), 'completed');
});

test('the schedule tab retains calendar, list, scope and project-qualified task links independently of project detail', () => {
  const day = '2026-08-27';
  const task = { projectId: '세종 & 화성', taskId: '작업/1' };
  const query = href => Object.fromEntries(new URL(href, 'https://example.test').searchParams);
  assert.deepEqual(query(scheduleHref(undefined, 'month', day)), { tab: 'schedule', view: 'month', date: day });
  assert.deepEqual(query(scheduleHref(undefined, 'week', day, 'list', task, 'all')), {
    tab: 'schedule', layout: 'list', view: 'week', date: day, scope: 'all', task: task.taskId, taskProject: task.projectId,
  });
  assert.deepEqual(query(scheduleHref(task.projectId, 'day', day, 'calendar', task, 'all')), {
    tab: 'schedule', view: 'day', date: day, project: task.projectId, task: task.taskId,
  });
  assert.deepEqual(query(calendarHref(undefined, 'week', day, task)), {
    tab: 'projects', section: 'calendar', view: 'week', date: day, task: task.taskId, taskProject: task.projectId,
  });
  assert.deepEqual(query(projectHref(task.projectId, 'schedule', task.taskId)), {
    tab: 'projects', project: task.projectId, section: 'schedule', task: task.taskId,
  });
});

const competition = {
  status: '드롭',
  announcementDate: '2026-10-13 ~ 2026-10-20 (18:00)',
  registrationDate: '2026-10-13 ~ 2026-10-20 (18:00)',
  submissionDate: '2026-11-25 ~ 2026-11-26 (17:00)',
  resultDate: '2026-12-04',
};
const project = (id, data) => ({ id, title: '프로젝트 ' + id, competitionData: data });
const task = (id, startDate, endDate) => ({ id, taskName: '도면작업', category: 'design', status: 'planned', startDate, endDate });

test('all four imported competition dates appear once with stable, actionable IDs after template generation', () => {
  const p = project('A', competition);
  const metadata = buildCalendarEvents([p]);
  assert.equal(metadata.length, 4);
  assert.deepEqual(metadata.map(e => [e.officialField, e.end, e.endTime]), [
    ['announcementDate', '2026-10-13', undefined], ['registrationDate', '2026-10-20', '18:00'],
    ['submissionDate', '2026-11-26', '17:00'], ['resultDate', '2026-12-04', undefined],
  ]);
  assert.ok(metadata.every(e => e.start === e.end && !e.taskId && e.milestone));
  const schedules = generateScheduleTemplate(competition);
  const registration = schedules.find(row => row.taskName === '응모 등록 마감');
  registration.endDate = '2026-10-13'; // Original imported schedule held the opening date.
  registration.status = 'done';
  const withTasks = project('A', { ...competition, schedules });
  const events = buildCalendarEvents([withTasks]);
  assert.equal(events.length, schedules.length);
  assert.equal(events.filter(e => e.officialField).length, 4);
  assert.ok(events.every(e => schedules.some(row => row.id === e.taskId)));
  const entry = events.find(e => e.taskId === registration.id);
  assert.equal(entry.end, '2026-10-20');
  assert.equal(entry.endTime, '18:00');
  assert.equal(entry.status, 'done');
  assert.equal(registration.endDate, '2026-10-13');
  assert.equal(isOfficialCalendarTask(withTasks, registration), true);
  const dateOnly = project('A', { ...competition, registrationDate: '2026-10-13 ~ 2026-10-20', schedules });
  assert.equal(buildCalendarEvents([dateOnly]).find(e => e.taskId === registration.id).endTime, undefined);
});

test('intentional deadline changes and unrelated same-name tasks keep their own dates and identities', () => {
  const moved = { ...task('registration', undefined, '2026-10-19'), taskName: '응모 등록 마감', isMilestone: true, category: 'external' };
  const sameName = { ...moved, id: 'manual', category: 'admin', endDate: '2026-10-20' };
  const p = project('A', { ...competition, schedules: [moved, sameName] });
  const events = buildCalendarEvents([p]);
  assert.equal(events.length, 6);
  assert.ok(!isOfficialCalendarTask(p, moved));
  assert.ok(!isOfficialCalendarTask(p, sameName));
  assert.deepEqual(eventsInRange(events, '2026-10-20').map(e => e.taskId ?? e.officialField).sort(), ['manual', 'registrationDate']);
  assert.equal(eventsInRange(events, '2026-10-19')[0].taskId, 'registration');
});

test('amended official dates carry real task IDs, status and Notion links forward once without touching design periods', () => {
  const schedules = generateScheduleTemplate(competition).map(row => ({ ...row, notionPageId: 'notion-' + row.id, status: 'in-progress' }));
  const before = { ...competition, schedules };
  const next = { ...before, announcementDate: '2026-10-14', registrationDate: '2026-10-15 ~ 2026-10-25 (17:00)',
    submissionDate: '2026-11-30', resultDate: '2026-12-06 (16:30)' };
  const saved = redateOfficialCalendarTasks(before, next);
  const events = buildCalendarEvents([project('A', saved)]);
  assert.equal(events.filter(e => e.officialField && e.taskId).length, 4);
  assert.equal(events.length, schedules.length);
  for (const row of saved.schedules) {
    const original = schedules.find(original => original.id === row.id);
    assert.equal(row.notionPageId, original.notionPageId);
    assert.equal(row.status, original.status);
    if (row.category !== 'external') assert.equal(row, original);
  }
  for (const [title, end, time] of [
    ['공고', '2026-10-14', undefined], ['응모 등록 마감', '2026-10-25', '17:00'],
    ['작품접수', '2026-11-30', undefined], ['당선 발표', '2026-12-06', '16:30'],
  ]) {
    const row = saved.schedules.find(item => item.taskName === title);
    assert.equal(row.endDate, end);
    assert.equal(row.endTime, time);
  }
  assert.equal(redateOfficialCalendarTasks(before, saved), saved);
  assert.equal(redateOfficialCalendarTasks(saved, saved), saved);
  assert.equal(schedules.find(row => row.taskName === '작품접수').endTime, '17:00');
});

test('official revisions retain independently moved, removed and new tasks, and leave unknown dates alone', () => {
  const schedules = generateScheduleTemplate(competition);
  const before = { ...competition, schedules };
  const alternate = schedules.find(row => row.taskName === '작품접수');
  const current = schedules.filter(row => row.taskName !== '당선 발표').map(row =>
    row.id === alternate.id ? { ...row, endDate: '2026-11-20' } : row);
  current.push({ ...alternate, id: 'manually-added' });
  const next = { ...before, schedules: current, submissionDate: '2026-11-30', registrationDate: '미정', resultDate: '2026-12-06' };
  assert.equal(redateOfficialCalendarTasks(before, next), next);
});

test('periods are inclusive across months and years and appear once per aggregate per project', () => {
  const span = task('shared-id', '2026-12-30', '2027-01-03');
  const projects = ['A', 'B'].map(id => project(id, { workspaceKind: 'project', schedules: [span, span] }));
  const events = buildCalendarEvents(projects);
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
  for (const day of ['2026-12-30', '2027-01-01', '2027-01-03']) {
    assert.deepEqual(eventsInRange(events, day).map(e => e.projectId), ['A', 'B']);
  }
  for (const view of ['week', 'month', 'year']) {
    assert.equal(eventsInRange(events, ...calendarBounds(view, '2027-01-01')).length, 2);
  }
  assert.equal(eventsInRange(events, '2027-01-04').length, 0);
});

test('pending and invalid official dates add no fictitious events; a valid deadline survives a broken start', () => {
  const p = project('A', { registrationDate: '2026-10-13 ~ 미정', resultDate: '2026-02-30', schedules: [
    task('broken', undefined, '2026-02-30'), task('reversed', '2026-12-06', '2026-12-01'),
    task('missing', '2026-12-06', ''), task('invalid-start', '2026-02-30', '2026-12-02'),
  ] });
  const events = buildCalendarEvents([p, project('B', undefined), project('C', { ...competition, workspaceKind: 'office' })]);
  assert.deepEqual(events.map(e => [e.taskId, e.start, e.end]), [
    ['reversed', '2026-12-01', '2026-12-01'], ['invalid-start', '2026-12-02', '2026-12-02'],
  ]);
});

test('calendar periods match Monday-based reports; contiguous month rows include leap days and year boundaries', () => {
  const day = '2027-01-01';
  assert.deepEqual(calendarBounds('day', day), [day, day]);
  assert.deepEqual(calendarBounds('week', day), weekBounds(day));
  assert.deepEqual(calendarBounds('week', day), ['2026-12-28', '2027-01-03']);
  assert.deepEqual(calendarBounds('month', '2024-02-10'), ['2024-02-01', '2024-02-29']);
  assert.deepEqual(calendarBounds('year', day), ['2027-01-01', '2027-12-31']);
  const leap = calendarMonthDays('2024-02-15');
  assert.equal(leap[0], '2024-01-29');
  assert.equal(leap.at(-1), '2024-03-03');
  assert.equal(leap.length, 35);
  assert.ok(leap.includes('2024-02-29'));
  assert.equal(calendarMonthDays('2021-02-14').length, 28);
  assert.equal(calendarMonthDays('2026-08-01').length, 42);
});

test('calendar navigation stays in the requested period for short months, years and device DST transitions', () => {
  assert.equal(shiftCalendar('month', '2024-01-31', 1), '2024-02-29');
  assert.equal(shiftCalendar('month', '2026-03-31', -1), '2026-02-28');
  assert.equal(shiftCalendar('year', '2024-02-29', 1), '2025-02-28');
  assert.equal(shiftCalendar('week', '2026-12-29', 1), '2027-01-05');
  assert.equal(shiftCalendar('day', '2026-03-08', 1), '2026-03-09');
  assert.equal(shiftCalendar('day', '0001-01-01', -1), '0001-01-01');
  assert.equal(shiftCalendar('day', '9999-12-31', 1), '9999-12-31');
  assert.ok(isCalendarDate('2024-02-29'));
  for (const bad of ['0000-01-01', '2026-1-1', '2026-02-29', '2026-10-20T00:00:00Z', '', undefined]) {
    assert.equal(isCalendarDate(bad), false);
  }
});

test('jump to schedule respects spans, historical projects, empty calendars and future ties', () => {
  const list = [{ start: '2026-10-01', end: '2026-10-03' }, { start: '2026-10-07', end: '2026-10-10' }];
  assert.equal(nearestCalendarDate(list, '2026-10-02'), '2026-10-02');
  assert.equal(nearestCalendarDate(list, '2026-10-05'), '2026-10-07');
  assert.equal(nearestCalendarDate([...list].reverse(), '2026-10-05'), '2026-10-07');
  assert.equal(nearestCalendarDate(list, '2026-11-01'), '2026-10-10');
  assert.equal(nearestCalendarDate(list, '2026-09-01'), '2026-10-01');
  assert.equal(nearestCalendarDate([], '2026-11-01'), undefined);
});
