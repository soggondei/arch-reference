import pricing from './price-evidence.cjs';
import priceCases from './price-cases.json' with { type: 'json' };
import conditions from './price-conditions.json' with { type: 'json' };
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

export function mapBidPage(page: Page, now = Date.now()) {
  const props = page.properties;
  const result: Record<string, string | number | null> = { id: page.id };
  result.공고명 = text(props['공고명'], 'title');
  for (const name of ['공고기관', '공고번호', '적용낙찰률', '낙찰업체', '참가가능지역', '면허조건', '참가검토', '공고차수', '가격모델', '추천상태', '추천근거', '가격자료출처', '가격기준시점', '가격비교범위', '업무분류', '결과확인', '결과출처', '계약방법', '낙찰방법', '가격산식확인', '공고업종', '재입찰번호']) result[name] = text(props[name], 'rich_text');
  for (const name of ['지역', '상태', '입찰방법', '예가방법']) result[name] = (props[name]?.select as { name?: string } | null)?.name ?? '';
  for (const name of ['배정예산', '추천입찰가', '낙찰하한가', '실제낙찰금액', '실제낙찰률', '기초금액', '가격사례수', '사례참고가', '낙찰하한율', '공고설계비']) {
    const value = props[name]?.number;
    result[name] = typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  for (const name of ['공고일', '마감일', '개찰일', '추천갱신일']) result[name] = (props[name]?.date as { start?: string } | null)?.start ?? '';
  result.저장갱신일 = result.추천갱신일;
  // 2026-10-18: 과거 저장 상태가 공고중이어도 실제 마감시각이 지났으면 마감으로 표시한다.
  // 시각 없는 기존 날짜는 한국시간 해당일 종료까지 유지하고 낙찰·유찰 상태는 보존한다.
  const closing = String(result.마감일 || '');
  const deadline = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(closing) ? closing + 'T23:59:59.999+09:00' : closing);
  if (result.상태 === '공고중' && Number.isFinite(deadline) && deadline < now) result.상태 = '마감';
  // 2026-10-27 사용자 요청: 저장된 보류 상태와 무관하게 조회 시 동일 엔진으로 재계산한다.
  // 과거 공고에는 마감 이후 공개된 낙찰 결과가 들어가지 않는다.
  const day = new Date(now + 9*3600000).toISOString().slice(0,10);
  const asOf = Number.isFinite(deadline) && deadline < now ? closing.slice(0,10) : day;
  const storedGuidance = result.가격모델 === 'bid-guidance-v3' && result.가격기준시점 && String(result.가격기준시점).slice(0,10) <= asOf && (Number(result.추천입찰가) > 0 || Number(result.공고설계비) > 0);
  result.사례자료기준 = storedGuidance ? '수집기 갱신 자료' : '2026-10-18 수집 자료';
  if (!storedGuidance) {
  const source = conditions.find(c => c.공고번호 === result.공고번호 && c.공고차수 === (result.공고차수 || '000') && c.공고명 === result.공고명);
  const input = { ...result };
  // 저장된 최신 필드를 우선하고, 기존 수집 공고의 누락 조건만 보완한다.
  if (source) for (const [name,value] of Object.entries(source)) if (input[name] == null || input[name] === '') input[name] = value as string | number | null;
  input.기초금액출처 = input.가격자료출처 || input.기초금액출처 || '';
  const analysis = pricing.analyzeBidPrice(input, priceCases, { asOf }) as Record<string, unknown>;
  result.추천입찰가 = typeof analysis.추천입찰가 === 'number' ? analysis.추천입찰가 : null;
  result.공고설계비 = typeof analysis.공고설계비 === 'number' ? analysis.공고설계비 : null;
  result.사례참고가 = typeof analysis.사례참고가 === 'number' ? analysis.사례참고가 : null;
  result.가격사례수 = Number(analysis.사례수 || 0);
  result.가격비교범위 = String(analysis.비교범위 || '');
  result.추천상태 = String(analysis.추천상태);
  result.추천근거 = String(analysis.분석);
  result.가격모델 = String(analysis.모델버전);
  result.가격기준시점 = asOf;
  result.추천갱신일 = day;
  result.적용낙찰률 = String(analysis.적용낙찰률 || '');
  result.낙찰하한가 = null;
  }
  const finalConfirmed = result.결과확인 === '최종낙찰 확인' && result.결과출처 === 'getScsbidListSttusServc';
  if (!finalConfirmed) {
    result.기존결과금액 = result.실제낙찰금액;
    result.실제낙찰금액 = null; result.실제낙찰률 = null; result.낙찰업체 = '';
    if (['낙찰', '유찰'].includes(String(result.상태))) result.상태 = '결과확인필요';
  }
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
        if (text(page.properties.공고번호, 'rich_text') === '__BIDCP_FEED_V1__') {
          pages.set(page.id, { id: page.id, 공고번호: '__BIDCP_FEED_V1__', 공고기관: text(page.properties.공고기관, 'rich_text') });
        } else pages.set(page.id, mapBidPage(page));
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
