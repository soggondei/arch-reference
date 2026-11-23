import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { competitionPeriod, deadlineLabel, getDDay, getDeadlineDate, normalizeRegistrationSchedule, notionDate } from '../lib/competition-dates.ts';
import { syncNotionSchedule } from '../lib/notion-schedule-client.ts';

const registrationDate = '2026-10-13 ~ 2026-10-20 (18:00)';
const registration = {
  id: 'registration', notionPageId: 'existing-notion-id', taskName: '응모 등록 마감',
  category: 'external', isMilestone: true, status: 'done', endDate: '2026-10-13',
};

test('the closing endpoint and Korean time are shared by list, schedule, Notion and D-day', () => {
  const period = competitionPeriod(registrationDate);
  assert.deepEqual(period, { firstDate: '2026-10-13', endDate: '2026-10-20', endTime: '18:00' });
  assert.equal(deadlineLabel(registrationDate), '2026-10-20 18:00');
  assert.equal(notionDate(period.endDate, period.endTime), '2026-10-20T18:00:00+09:00');
  assert.equal(getDDay(registrationDate, new Date('2026-10-19T15:00:00Z')), 0);
  assert.equal(getDeadlineDate('~ 2026-10-20 (18:00)'), period.endDate);
  assert.equal(deadlineLabel('2026.10.20 (09:00 ~ 18:00)'), '2026-10-20 18:00');
  assert.equal(deadlineLabel('2026-10-20T18:00:00+09:00'), '2026-10-20 18:00');
  assert.equal(deadlineLabel('2026-10-20'), '2026-10-20');
  assert.equal(getDeadlineDate('2026-10-13 ~ 미정'), undefined);
  assert.equal(getDeadlineDate('2026-02-30'), undefined);
  assert.equal(getDDay('미정'), null);
});

test('existing Suyu schedules keep every ID, Notion link, assignment and completion state', () => {
  const others = Array.from({length: 21}, (_, i) => ({
    id: String(i), taskName: '설계 업무', category: 'design', endDate: '2026-11-26', status: 'planned',
  }));
  const saved = { status: '작업중', registrationDate, schedules: [{...registration, assignee: 'PM'}, ...others] };
  const fixed = normalizeRegistrationSchedule(saved);
  assert.equal(fixed.schedules.length, 22);
  assert.deepEqual(fixed.schedules[0], {...saved.schedules[0], endDate: '2026-10-20', endTime: '18:00'});
  assert.equal(saved.schedules[0].endDate, '2026-10-13');
  assert.ok(others.every((item, i) => fixed.schedules[i + 1] === item));
  assert.equal(normalizeRegistrationSchedule(fixed), fixed);
  const manuallyMoved = {...saved, schedules: [{...registration, endDate: '2026-10-19'}]};
  assert.equal(normalizeRegistrationSchedule(manuallyMoved), manuallyMoved);
  const revised = {...fixed, registrationDate: '2026-10-15 ~ 2026-10-22 (17:00)'};
  assert.equal(normalizeRegistrationSchedule(revised, registrationDate).schedules[0].endDate, '2026-10-22');
});

test('sync patches a linked Notion page, transient failures never create a duplicate', async t => {
  const requests = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({url, method: options.method, body: JSON.parse(options.body)});
    return Response.json({error: 'rate limit', notFound: false}, {status: 429});
  });
  const item = {...registration, endDate: '2026-10-20', endTime: '18:00'};
  await assert.rejects(syncNotionSchedule('수유재래시장', item), /rate limit/);
  assert.deepEqual(requests.map(r => r.method), ['PATCH']);
  assert.equal(requests[0].body.notionPageId, registration.notionPageId);
  assert.equal(requests[0].body.endTime, '18:00');
  fetch.mock.mockImplementation(async () => Response.json({ok: true}));
  assert.equal(await syncNotionSchedule('수유재래시장', item), item);
});

test('targeted repair updates only the date of the two existing Notion pages', async t => {
  // Match Next's TS alias resolution when running the actual handlers in node:test.
  const hooks = registerHooks({resolve(spec, context, next) {
    if (spec === '@/lib/competition-dates') return next(new URL('../lib/competition-dates.ts', import.meta.url).href, context);
    return next(spec === 'next/server' ? 'next/server.js' : spec, context);
  }});
  t.after(() => hooks.deregister());
  const oldToken = process.env.NOTION_TOKEN;
  process.env.NOTION_TOKEN = 'local-fixture';
  t.after(() => {
    if (oldToken === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = oldToken;
  });
  const { PATCH: schedule } = await import('../app/api/notion-schedule/route.ts');
  const { PATCH: project } = await import('../app/api/notion-project/route.ts');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, method: options.method, ...JSON.parse(options.body) });
    return Response.json({ id: 'linked' });
  });
  const req = id => new Request('http://localhost.test', {
    method: 'PATCH', body: JSON.stringify({ notionPageId: id, registrationDate }),
  });
  assert.equal((await schedule(req('linked-schedule'))).status, 200);
  assert.equal((await project(req('linked-project'))).status, 200);
  const date = {date: {start: '2026-10-20T18:00:00+09:00'}};
  assert.deepEqual(requests, [
    {url: 'https://api.notion.com/v1/pages/linked-schedule', method: 'PATCH', properties: {'날짜': date}},
    {url: 'https://api.notion.com/v1/pages/linked-project', method: 'PATCH', properties: {'등록마감일': date}},
  ]);
});
