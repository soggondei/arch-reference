export interface ScorerListEntry {
  id: number;
  announcementDate: string;
  lastmod: string;
}

export function scorerDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.trim().match(/^(\d{2}|\d{4})[.-](\d{2})[.-](\d{2})\.?$/);
  if (!match) return '';
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  const date = `${year}-${match[2]}-${match[3]}`;
  const time = Date.parse(date);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? date : '';
}

// The public table pins promoted rows ahead of the requested date ordering, even
// on subsequent pages. Accumulate a prefix, deduplicate, and only release dates
// newer than its last normal row so pinned old competitions cannot jump ahead.
export function createScorerListLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  const batchSize = 100;
  let cache = new Map<number, ScorerListEntry>();
  let fetchedAt = 0;
  let offset = 0;
  let total = 0;
  let complete = false;
  let boundary = '';
  let pending: Promise<void> | null = null;

  const ordered = () => [...cache.values()].sort((a, b) =>
    b.announcementDate.localeCompare(a.announcementDate) || b.id - a.id);
  const ready = () => ordered().filter(item => complete || item.announcementDate > boundary);

  async function extend() {
    const body = new URLSearchParams({
      draw: '1', start: String(offset), length: String(batchSize),
      'search[value]': '', 'order[0][column]': '0',
      'order[0][dir]': 'desc', 'columns[0][name]': 'date_issue',
    });
    const response = await fetcher('https://scorer.co.kr/new_get_competition', {
      method: 'POST', body, cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`공모 목록 HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.data) || !Number.isSafeInteger(payload.recordsFiltered) || payload.recordsFiltered < 0) {
      throw new Error('공모 목록 응답 형식이 변경되었습니다.');
    }
    const normal: ScorerListEntry[] = [];
    const entries: ScorerListEntry[] = [];
    for (const row of payload.data) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('공모 번호를 확인할 수 없습니다.');
      const announcementDate = scorerDate(row.date_issue);
      if (row.date_issue && !announcementDate) throw new Error('공모 공고일 형식이 변경되었습니다.');
      const entry = { id, announcementDate, lastmod: scorerDate(row.date_edited) };
      entries.push(entry);
      if (!row.promoted) normal.push(entry);
    }
    total = payload.recordsFiltered;
    for (const entry of entries) cache.set(entry.id, entry);
    // Pinned rows consume response slots but do not advance the normal list.
    offset += normal.length;
    complete = payload.data.length < batchSize || normal.length === 0;
    boundary = normal.at(-1)?.announcementDate || '';
    if (!fetchedAt) fetchedAt = now();
  }

  return async (page: number, pageUnit: number) => {
    if (!pending && fetchedAt && now() - fetchedAt >= 300_000) {
      cache = new Map();
      fetchedAt = offset = total = 0;
      complete = false;
      boundary = '';
    }
    const end = page * pageUnit;
    while (!complete && ready().length < end) {
      if (!pending) pending = extend().finally(() => { pending = null; });
      await pending;
    }
    const items = ready();
    return {
      entries: items.slice((page - 1) * pageUnit, end),
      total: complete ? cache.size : total,
      hasMore: !complete || end < items.length,
    };
  };
}
