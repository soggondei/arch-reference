import store from './bidcp-store.cjs';
export class BidcpSnapshotError extends Error { status = 502; }
type Bid = Record<string, string | number | null>;
export type SourceSnapshot = { version: number; capturedAt: string; checkedAt?: string; lastError?: { at: string; message: string } | null; source: string; filter: Record<string,string>; total: number; entries: Bid[] };
// 동기화 상태 행은 사용자 공고 목록에 포함하지 않는다.
export async function loadBidcpSnapshot(bids: Bid[], token: string, request: typeof fetch = fetch): Promise<SourceSnapshot | undefined> {
  const markers = bids.filter(b=>b.공고번호 === store.MARKER);
  if (!markers.length) return undefined;
  if (markers.length !== 1) throw new BidcpSnapshotError('상공회의소 동기화 상태가 중복되었습니다.');
  if (!markers[0].공고기관) return undefined; // 첫 스냅샷을 아직 공개하지 않은 준비 상태
  try {
    const manifest = JSON.parse(String(markers[0].공고기관));
    if (manifest.version !== 1 || !/^[a-f0-9-]{32,36}$/i.test(manifest.pageId) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isFinite(Date.parse(manifest.checkedAt))) throw new Error('manifest');
    const response = await request(`https://api.notion.com/v1/blocks/${manifest.pageId}/children?page_size=100`, {cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Notion-Version':'2022-06-28'},signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('response');
    const body = await response.json();
    if (!Array.isArray(body.results) || body.has_more !== false) throw new Error('blocks');
    const payload = store.decodeBlocks(body.results);
    if (store.digest(payload) !== manifest.sha256) throw new Error('digest');
    const snapshot = store.validateSnapshot(JSON.parse(payload));
    if (snapshot.total !== manifest.total) throw new Error('total');
    return {...snapshot,checkedAt:manifest.checkedAt,lastError:manifest.lastError};
  } catch { throw new BidcpSnapshotError('상공회의소 저장 자료 검증에 실패했습니다. 일부 목록을 정상 자료로 표시하지 않습니다.'); }
}
