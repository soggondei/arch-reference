import test from 'node:test';
import assert from 'node:assert/strict';
import { createScorerListLoader, scorerDate } from '../lib/scorer-list.ts';

test('normalizes public table dates and rejects invalid dates', () => {
  assert.equal(scorerDate('26.11.13.'), '2026-11-13');
  assert.equal(scorerDate('2025-03-04'), '2025-03-04');
  assert.equal(scorerDate('26.02.30.'), '');
  assert.equal(scorerDate(null), '');
});

function source() {
  const promoted = { id: 8000, date_issue: '25.03.04.', promoted: true };
  const rows = Array.from({ length: 205 }, (_, i) => ({
    id: 1000 - i,
    date_issue: new Date(Date.UTC(2026, 10, 13 - Math.floor(i / 3))).toISOString().slice(0, 10),
    promoted: false,
  }));
  const starts = [];
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://scorer.co.kr/new_get_competition');
    assert.equal(options.body.get('columns[0][name]'), 'date_issue');
    assert.equal(options.body.get('order[0][dir]'), 'desc');
    const start = Number(options.body.get('start'));
    starts.push(start);
    return Response.json({ recordsFiltered: 206, data: [promoted, ...rows.slice(start, start + 99)] });
  };
  return { fetcher, starts, rows, promoted };
}

test('old high-ID promoted competition does not precede newer announcements', async () => {
  const s = source();
  const load = createScorerListLoader(s.fetcher);
  const page = await load(1, 20);
  assert.deepEqual(page.entries.map(x => x.id), s.rows.slice(0, 20).map(x => x.id));
  assert.equal(page.hasMore, true);
});

test('all pages preserve tied dates, promotions and every row without duplicates or gaps', async () => {
  const s = source();
  const load = createScorerListLoader(s.fetcher);
  const entries = [];
  for (let page = 1; page <= 11; page++) {
    const result = await load(page, 20);
    entries.push(...result.entries);
    assert.equal(result.hasMore, page < 11);
  }
  assert.deepEqual(entries.map(x => x.id), [...s.rows, s.promoted].map(x => x.id));
  assert.deepEqual(s.starts, [0, 99, 198]);
});

test('concurrent requests share the same upstream request', async () => {
  const s = source();
  const load = createScorerListLoader(s.fetcher);
  await Promise.all([load(1, 20), load(2, 20)]);
  assert.deepEqual(s.starts, [0]);
});

test('refreshes the list after five minutes', async () => {
  const s = source();
  let time = 1000;
  const load = createScorerListLoader(s.fetcher, () => time);
  await load(1, 20);
  time += 300_000;
  await load(1, 20);
  assert.deepEqual(s.starts, [0, 0]);
});

test('upstream failure surfaces and retry does not advance the offset', async () => {
  const s = source();
  let fail = true;
  const load = createScorerListLoader(async (...args) => {
    if (fail) { fail = false; return new Response('', { status: 503 }); }
    return s.fetcher(...args);
  });
  await assert.rejects(load(1, 20), /503/);
  assert.equal((await load(1, 20)).entries.length, 20);
  assert.deepEqual(s.starts, [0]);
});
