type Property = Record<string, unknown>;
type Page = { id: string; properties: Record<string, Property> };

export class BidFeedError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

function text(prop: Property | undefined, key: string): string {
  const parts = prop?.[key];
  if (!Array.isArray(parts)) return '';
  return parts.map(p => p?.plain_text ?? p?.text?.content ?? '').join('');
}

export function mapBidPage(page: Page) {
  const props = page.properties;
  const result: Record<string, string | number | null> = { id: page.id };
  result.공고명 = text(props['공고명'], 'title');
  for (const name of ['공고기관', '공고번호', '적용낙찰률', '낙찰업체', '참가가능지역', '면허조건', '참가검토']) result[name] = text(props[name], 'rich_text');
  for (const name of ['지역', '상태', '입찰방법', '예가방법']) result[name] = (props[name]?.select as { name?: string } | null)?.name ?? '';
  for (const name of ['배정예산', '추천입찰가', '낙찰하한가', '실제낙찰금액', '실제낙찰률']) {
    const value = props[name]?.number;
    result[name] = typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  for (const name of ['공고일', '마감일', '개찰일']) result[name] = (props[name]?.date as { start?: string } | null)?.start ?? '';
  result.공고URL = typeof props['공고URL']?.url === 'string' ? props['공고URL'].url : '';
  return result;
}

export async function loadBidFeed(token: string, databaseId: string, request: typeof fetch = fetch) {
  const pages = new Map<string, ReturnType<typeof mapBidPage>>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  const deadline = Date.now() + 50000;
  do {
    if (Date.now() >= deadline) throw new BidFeedError('입찰 목록 조회 시간이 초과됐습니다. 다시 시도해 주세요.', 504);
    try {
      const response = await request(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
        body: JSON.stringify({ page_size: 100, sorts: [{ property: '공고일', direction: 'descending' }], ...(cursor ? { start_cursor: cursor } : {}) }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - Date.now()))),
      });
      if (!response.ok) {
        if (response.status === 429) throw new BidFeedError('입찰 저장소의 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.', 503);
        if ([401, 403, 404].includes(response.status)) throw new BidFeedError('입찰 저장소 연결 또는 접근 권한을 확인해야 합니다.', 503);
        throw new BidFeedError('입찰 저장소가 응답하지 않습니다. 다시 시도해 주세요.');
      }
      const data = await response.json();
      if (!Array.isArray(data.results) || typeof data.has_more !== 'boolean') throw new BidFeedError('입찰 저장소의 응답 형식이 올바르지 않습니다.');
      for (const page of data.results) {
        if (!page?.id || !page.properties) throw new BidFeedError('입찰 항목을 읽을 수 없습니다.');
        pages.set(page.id, mapBidPage(page));
      }
      if (data.has_more) {
        if (typeof data.next_cursor !== 'string' || !data.next_cursor || cursors.has(data.next_cursor)) throw new BidFeedError('입찰 목록의 다음 페이지를 읽을 수 없습니다.');
        cursor = data.next_cursor;
        cursors.add(data.next_cursor);
      } else cursor = undefined;
    } catch (error) {
      if (error instanceof BidFeedError) throw error;
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new BidFeedError('입찰 목록 조회 시간이 초과됐습니다. 다시 시도해 주세요.', 504);
      throw new BidFeedError('입찰 저장소 연결에 실패했습니다. 다시 시도해 주세요.');
    }
  } while (cursor);
  return [...pages.values()];
}
