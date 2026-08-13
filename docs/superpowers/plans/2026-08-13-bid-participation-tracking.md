# 입찰 참가기록 트래킹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입찰정보 탭에서 공고별로 참가 여부(참가예정/참가완료/패스)와 참가완료 시 실제 제출 입찰금액·제출일을 기록하고, 참가여부로 필터링할 수 있게 한다.

**Architecture:** arch-reference의 Supabase에 새 테이블 `bid_participations`을 추가한다. 프론트엔드는 기존처럼 Notion 기반 `/api/bids`로 공고 데이터를 가져오고, 별도로 `lib/store.ts`의 새 함수로 Supabase 참가기록을 가져와 공고번호(`공고번호` / DB 컬럼 `bid_no`)로 조인해서 표시한다. bid-monitor(Notion 쓰기 파이프라인)는 전혀 건드리지 않는다.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, Supabase (`@supabase/supabase-js`), 기존 `lib/store.ts` row-mapper 패턴 재사용.

## Global Constraints

- Notion DB에는 아무것도 쓰지 않는다 (bid-monitor 파이프라인과 분리 유지).
- 이 프로젝트는 자동화 테스트가 없다 — 각 태스크 검증은 `npx tsc --noEmit` + `npm run build` (+ 필요 시 curl/브라우저 수동 확인)로 한다.
- Supabase 스키마 변경은 CLI/마이그레이션 파일 없이 대시보드 SQL Editor에서 수동 실행하는 것이 이 프로젝트의 기존 방식이다 (`refs`/`collections` 테이블도 이렇게 만들어짐). 이번 태스크도 동일하게 진행한다.
- 참가상태 값 3종은 `'참가예정' | '참가완료' | '패스'` (문자열 그대로 유니온 타입 — `CompetitionStatus`와 동일한 컨벤션, 별도 라벨 매핑 불필요). `미정`은 DB에 행이 없는 상태로 표현하며 타입에는 포함하지 않는다.

---

### Task 1: Supabase `bid_participations` 테이블 생성

**Files:** 없음 (Supabase 대시보드 작업 + REST 확인)

**Interfaces:**
- Produces: `public.bid_participations` 테이블 — 컬럼 `bid_no text primary key`, `status text not null`, `submitted_price numeric`, `submitted_date date`, `updated_at timestamptz not null default now()`. `anon` role에 대해 RLS `for all using (true) with check (true)` 정책 적용 (기존 `refs`/`collections`와 동일 패턴).

- [ ] **Step 1: 사용자에게 SQL 전달하고 대시보드에서 실행 요청**

다음 SQL을 사용자에게 보여주고, Supabase 대시보드(`https://supabase.com/dashboard/project/bjhvftpxhcotezgxyxzm/sql/new`) SQL Editor에서 실행해달라고 요청한다:

```sql
create table public.bid_participations (
  bid_no text primary key,
  status text not null,
  submitted_price numeric,
  submitted_date date,
  updated_at timestamptz not null default now()
);

alter table public.bid_participations enable row level security;
create policy "Allow all" on public.bid_participations for all using (true) with check (true);
```

사용자가 실행 완료했다고 확인해줄 때까지 기다린다.

- [ ] **Step 2: REST로 테이블 존재 확인**

`/Users/songseung-gon/Desktop/arch-reference/.env.local`에서 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 값을 읽어(파일 내용을 화면에 출력하지 말 것 — 변수로만 사용) 다음처럼 확인:

```bash
cd /Users/songseung-gon/Desktop/arch-reference
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
curl -s "$URL/rest/v1/bid_participations?select=*&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Expected: `[]` (빈 배열 — 테이블은 있지만 아직 행이 없음). `relation "public.bid_participations" does not exist` 같은 에러가 나오면 Step 1의 SQL이 아직 실행되지 않은 것이니 사용자에게 다시 요청한다.

- [ ] **Step 3: 커밋 없음**

이 태스크는 코드 변경이 없으므로 커밋하지 않는다.

---

### Task 2: `lib/types.ts` — 참가상태 타입 추가

**Files:**
- Modify: `lib/types.ts` (22번째 줄 `COMPETITION_STATUSES` 블록 뒤에 추가)

**Interfaces:**
- Produces: `BID_PARTICIPATION_STATUSES`(배열), `BidParticipationStatus`(타입), `BID_PARTICIPATION_STATUS_COLOR`(색상 맵), `BidParticipation`(인터페이스: `{ bidNo: string; status: BidParticipationStatus; submittedPrice: number | null; submittedDate: string | null }`) — Task 3/4에서 그대로 사용.

- [ ] **Step 1: 타입 추가**

`lib/types.ts`의 `COMPETITION_STATUS_COLOR` 정의(현재 25~33번째 줄) 바로 뒤에 다음을 추가:

```ts
export const BID_PARTICIPATION_STATUSES = ['참가예정', '참가완료', '패스'] as const;
export type BidParticipationStatus = typeof BID_PARTICIPATION_STATUSES[number];

export const BID_PARTICIPATION_STATUS_COLOR: Record<BidParticipationStatus, string> = {
  '참가예정': '#f97316',
  '참가완료': '#22c55e',
  '패스': '#94a3b8',
};

export interface BidParticipation {
  bidNo: string;
  status: BidParticipationStatus;
  submittedPrice: number | null;
  submittedDate: string | null;
}
```

- [ ] **Step 2: 타입체크로 확인**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit`
Expected: 에러 없음 (기존에 있던 에러가 없었다는 전제 하에 — 있었다면 새로 늘지 않았는지만 확인)

- [ ] **Step 3: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add lib/types.ts
git commit -m "$(cat <<'EOF'
Add BidParticipation types for bid participation tracking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `lib/store.ts` — Supabase 조회/저장 함수 추가

**Files:**
- Modify: `lib/store.ts` (상단 import에 `BidParticipation` 추가, `uploadImage` 함수 앞 `// ── Image Upload ──` 구분선 앞에 새 섹션 추가)

**Interfaces:**
- Consumes: `BidParticipation`, `BidParticipationStatus` (Task 2에서 정의)
- Produces: `getBidParticipations(): Promise<BidParticipation[]>`, `upsertBidParticipation(p: BidParticipation): Promise<void>` — Task 4의 `app/page.tsx`에서 그대로 호출.

- [ ] **Step 1: import 수정**

`lib/store.ts` 2번째 줄을 수정:

```ts
import { Reference, Collection, CompetitionData, BidParticipation } from './types';
```

- [ ] **Step 2: mapper + 함수 추가**

`lib/store.ts`의 168번째 줄(`// ── Image Upload ──` 구분선) 바로 앞에 삽입:

```ts
// ── Bid Participations ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBidParticipation(row: any): BidParticipation {
  return {
    bidNo: row.bid_no,
    status: row.status,
    submittedPrice: row.submitted_price ?? null,
    submittedDate: row.submitted_date ?? null,
  };
}

export async function getBidParticipations(): Promise<BidParticipation[]> {
  const { data, error } = await supabase.from('bid_participations').select('*');
  if (error) throw error;
  return (data ?? []).map(toBidParticipation);
}

export async function upsertBidParticipation(p: BidParticipation): Promise<void> {
  const { error } = await supabase.from('bid_participations').upsert({
    bid_no: p.bidNo,
    status: p.status,
    submitted_price: p.status === '참가완료' ? p.submittedPrice : null,
    submitted_date: p.status === '참가완료' ? p.submittedDate : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
```

- [ ] **Step 3: 타입체크**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 smoke test (curl로 upsert/조회 확인)**

Task 1과 동일하게 `.env.local`에서 URL/KEY를 읽어 실제로 한 행을 넣고 조회해본다:

```bash
cd /Users/songseung-gon/Desktop/arch-reference
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
curl -s "$URL/rest/v1/bid_participations" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -X POST -d '{"bid_no":"__smoke_test__","status":"패스","submitted_price":null,"submitted_date":null}'
curl -s "$URL/rest/v1/bid_participations?bid_no=eq.__smoke_test__" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Expected: 두 번째 curl 결과에 `bid_no: "__smoke_test__", status: "패스"` 행이 보임. 확인 후 정리:

```bash
curl -s "$URL/rest/v1/bid_participations?bid_no=eq.__smoke_test__" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -X DELETE
```

- [ ] **Step 5: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add lib/store.ts
git commit -m "$(cat <<'EOF'
Add getBidParticipations/upsertBidParticipation to store.ts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `app/page.tsx` — 입찰정보 탭에 참가여부 UI 연결

**Files:**
- Modify: `app/page.tsx` (import 줄 5·7, `BidsView`/`BID_STATUS_COLOR` 부근 184~299번째 줄, 페이지 컴포넌트 상태 680~704번째 줄, 탭 클릭 핸들러 1031~1044번째 줄, `BidsView` 렌더 호출 1170~1171번째 줄 — 정확한 줄 번호는 Task 2/3 커밋 이후 다시 확인)

**Interfaces:**
- Consumes: `BidParticipation`, `BidParticipationStatus`, `BID_PARTICIPATION_STATUSES`, `BID_PARTICIPATION_STATUS_COLOR` (Task 2), `getBidParticipations`, `upsertBidParticipation` (Task 3)
- Produces: 없음 (최상위 페이지 컴포넌트, 더 이상 소비하는 곳 없음)

- [ ] **Step 1: import 추가**

5번째 줄을 수정 (타입 추가):

```ts
import { Reference, Collection, FilterState, CompetitionStatus, CompetitionData, COMPETITION_STATUSES, COMPETITION_STATUS_COLOR, ScheduleItem, LINK_CATEGORIES, BidParticipation, BidParticipationStatus, BID_PARTICIPATION_STATUSES, BID_PARTICIPATION_STATUS_COLOR } from '@/lib/types';
```

7번째 줄을 수정 (함수 추가):

```ts
import { getRefs, getCollections, deleteRef, addCollection, deleteCollection, updateRef, generateId, updateCompetitionStatus, archiveRefNotionSchedules, getBidParticipations, upsertBidParticipation } from '@/lib/store';
```

- [ ] **Step 2: 참가여부 필터 타입 + `BidParticipationControl` 컴포넌트 추가**

`BID_STATUS_COLOR` 정의(현재 200~202번째 줄) 바로 뒤, `BidsView` 함수 정의(현재 204번째 줄) 바로 앞에 삽입:

```ts
const PARTICIPATION_FILTERS = ['전체', '참가필요', '참가완료', '패스'] as const;
type ParticipationFilter = typeof PARTICIPATION_FILTERS[number];

function BidParticipationControl({
  bidNo,
  participation,
  onChange,
}: {
  bidNo: string;
  participation: BidParticipation | undefined;
  onChange: (p: BidParticipation) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(false);
  const [price, setPrice] = useState(participation?.submittedPrice?.toString() ?? '');
  const [date, setDate] = useState(participation?.submittedDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(status: BidParticipationStatus) {
    setSaving(true);
    setError(null);
    try {
      await onChange({
        bidNo,
        status,
        submittedPrice: status === '참가완료' ? (Number(price) || null) : null,
        submittedDate: status === '참가완료' ? (date || null) : null,
      });
      setOpen(false);
      setPendingComplete(false);
    } catch {
      setError('저장 실패, 다시 시도해주세요');
    } finally {
      setSaving(false);
    }
  }

  function pick(status: BidParticipationStatus) {
    if (status === '참가완료') {
      setPendingComplete(true);
    } else {
      void save(status);
    }
  }

  const badgeLabel = participation?.status ?? '미정';
  const badgeColor = participation ? BID_PARTICIPATION_STATUS_COLOR[participation.status] : '#d4d4d8';

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => { setOpen(v => !v); setPendingComplete(false); setError(null); }}
        className="flex items-center gap-1 text-[10px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ backgroundColor: badgeColor }}
      >
        {badgeLabel}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-20 bg-white rounded-xl shadow-lg border border-zinc-100 py-2 px-3 min-w-[200px] text-xs">
          {!pendingComplete ? (
            <div className="flex flex-col gap-1">
              {BID_PARTICIPATION_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => pick(s)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 text-left rounded-lg"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BID_PARTICIPATION_STATUS_COLOR[s] }} />
                  <span className={participation?.status === s ? 'font-bold text-zinc-900' : 'text-zinc-600'}>{s}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">제출입찰가</span>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="border border-zinc-200 rounded-lg px-2 py-1"
                  placeholder="예: 21439585"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">제출일</span>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="border border-zinc-200 rounded-lg px-2 py-1"
                />
              </label>
              {error && <span className="text-red-500">{error}</span>}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => void save('참가완료')}
                  disabled={saving || !price}
                  className="flex-1 bg-zinc-900 text-white rounded-lg py-1 disabled:opacity-40"
                >
                  저장
                </button>
                <button
                  onClick={() => setPendingComplete(false)}
                  className="flex-1 bg-zinc-100 text-zinc-600 rounded-lg py-1"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `BidsView` 시그니처 + 필터 로직 수정**

`BidsView` 함수 정의(현재 204~209번째 줄)를 다음으로 교체:

```ts
function BidsView({
  bids, loaded, statusFilter, onStatusFilter,
  participations, participationFilter, onParticipationFilter, onParticipationChange,
}: {
  bids: BidItem[]; loaded: boolean; statusFilter: string; onStatusFilter: (s: string) => void;
  participations: Record<string, BidParticipation>;
  participationFilter: ParticipationFilter;
  onParticipationFilter: (f: ParticipationFilter) => void;
  onParticipationChange: (p: BidParticipation) => Promise<void>;
}) {
  const statuses = ['공고중', '낙찰', '유찰'];
  const counts = Object.fromEntries(statuses.map(s => [s, bids.filter(b => b.상태 === s).length]));
  const filtered = bids.filter(b => {
    if (b.상태 !== statusFilter) return false;
    const pStatus = participations[b.공고번호]?.status ?? '미정';
    if (participationFilter === '전체') return true;
    if (participationFilter === '참가필요') return pStatus === '미정' || pStatus === '참가예정';
    return pStatus === participationFilter;
  });
```

(이 아래 `if (!loaded) { ... }` 부터 파일 끝까지 기존 코드는 그대로 유지)

- [ ] **Step 4: 필터 UI에 참가여부 필터 줄 추가**

기존 상태 필터 `<div className="flex gap-2 mb-5">...</div>` 블록(현재 218~231번째 줄, `총 {bids.length}건`으로 끝나는 부분) 바로 뒤에 삽입:

```tsx
<div className="flex gap-2 mb-5">
  {PARTICIPATION_FILTERS.map(f => (
    <button
      key={f}
      onClick={() => onParticipationFilter(f)}
      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${participationFilter === f ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
    >
      {f}
    </button>
  ))}
</div>
```

- [ ] **Step 5: 카드에 참가상태 배지와 제출입찰가 표시 추가**

상태 뱃지 `<span ... >{bid.상태}</span>`가 있는 블록(현재 240~243번째 줄) 바로 뒤에 삽입:

```tsx
<BidParticipationControl
  bidNo={bid.공고번호}
  participation={participations[bid.공고번호]}
  onChange={onParticipationChange}
/>
```

금액 정보 블록에서 `{bid.실제낙찰금액 && ( ... )}` 뒤(현재 276번째 줄 부근, 낙찰업체 표시 앞)에 삽입:

```tsx
{participations[bid.공고번호]?.status === '참가완료' && (
  <div>
    <span className="text-zinc-400">제출입찰가 </span>
    <span className="font-semibold text-purple-600">{fmtWon(participations[bid.공고번호]!.submittedPrice)}</span>
    {participations[bid.공고번호]?.submittedDate && (
      <span className="text-zinc-400 ml-1">({participations[bid.공고번호]!.submittedDate} 제출)</span>
    )}
  </div>
)}
```

- [ ] **Step 6: 페이지 컴포넌트에 상태·로딩 로직 연결**

현재 692~694번째 줄(`bids`/`bidsLoaded`/`bidStatusFilter` state 선언) 바로 뒤에 추가:

```ts
const [participations, setParticipations] = useState<Record<string, BidParticipation>>({});
const [participationFilter, setParticipationFilter] = useState<ParticipationFilter>('전체');
```

탭 클릭 핸들러(현재 1031~1044번째 줄)를 다음으로 교체:

```tsx
onClick={() => {
  setTab('bids');
  if (!bidsLoaded) {
    Promise.all([
      fetch('/api/bids').then(r => r.json()) as Promise<BidItem[]>,
      getBidParticipations(),
    ]).then(([bidsData, participationsData]) => {
      setBids(bidsData);
      setParticipations(Object.fromEntries(participationsData.map(p => [p.bidNo, p])));
      setBidsLoaded(true);
    }).catch(() => {});
  }
}}
```

`handleCompetitionStatusChange` 함수(현재 818번째 줄) 바로 앞에 새 핸들러 추가:

```ts
async function handleParticipationChange(p: BidParticipation) {
  await upsertBidParticipation(p);
  setParticipations(prev => ({ ...prev, [p.bidNo]: p }));
}
```

`BidsView` 렌더 호출(현재 1171번째 줄)을 다음으로 교체:

```tsx
<BidsView
  bids={bids}
  loaded={bidsLoaded}
  statusFilter={bidStatusFilter}
  onStatusFilter={setBidStatusFilter}
  participations={participations}
  participationFilter={participationFilter}
  onParticipationFilter={setParticipationFilter}
  onParticipationChange={handleParticipationChange}
/>
```

- [ ] **Step 7: 타입체크 + 빌드**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit && npm run build`
Expected: 에러 없이 통과

- [ ] **Step 8: 브라우저에서 수동 확인**

```bash
cd /Users/songseung-gon/Desktop/arch-reference && npm run dev
```

브라우저(`http://localhost:3001`, 포트가 다르면 콘솔에 뜨는 포트 사용)에서:
1. "입찰정보" 탭 클릭 → 카드마다 회색 "미정" 배지가 보이는지 확인
2. 아무 카드나 배지 클릭 → 드롭다운에서 "참가예정" 선택 → 배지가 주황색 "참가예정"으로 바뀌는지 확인
3. 같은 카드 배지 다시 클릭 → "참가완료" 선택 → 제출입찰가/제출일 입력 폼이 나오는지 확인 → 금액 입력 후 저장 → 배지가 초록 "참가완료"로 바뀌고 카드에 제출입찰가가 표시되는지 확인
4. 페이지 새로고침 → 입찰정보 탭 다시 클릭 → 방금 입력한 참가완료 상태와 금액이 유지되는지 확인 (Supabase에 실제로 저장됐는지 검증)
5. 참가여부 필터에서 "참가완료" 클릭 → 방금 처리한 카드만 보이는지, "참가필요" 클릭 → 그 카드는 안 보이는지 확인
6. 테스트로 만든 참가기록은 다시 "미정"으로 되돌릴 수 없으므로(현재 UI에 '미정으로 되돌리기' 옵션 없음), 확인 후 Supabase 대시보드 Table Editor에서 해당 행을 수동으로 지워 정리

- [ ] **Step 9: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Add bid participation tracking UI to 입찰정보 tab

Adds inline status control (참가예정/참가완료/패스) and a
participation filter, joined against the existing Notion-backed
bid feed by 공고번호.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan Self-Review Notes

- **Spec coverage:** 데이터 모델(Task 1), `lib/store.ts` 함수(Task 3), UI 필터+배지+인라인편집(Task 4 Step 3~6) 모두 스펙 항목과 1:1 대응. "범위 밖" 항목(Notion 쓰기, 담당자/메모, 승률 통계)은 어떤 태스크에도 포함하지 않음 — 의도된 누락.
- **`참가필요` 정의 재확인:** 스펙대로 `미정 + 참가예정`을 의미하도록 필터 로직에 명시(Task 4 Step 3).
- **`미정→다른 상태로 되돌리기` UX 갭:** 이번 스펙 범위에서 "미정"은 애초에 상태 변경 대상이 아니고(행이 없는 디폴트 상태), 일단 `참가예정`이나 `참가완료`로 바뀐 뒤 다시 "미정"으로 되돌리는 UI는 만들지 않기로 스펙에 명시되어 있지 않았지만 자연스럽게 범위 밖으로 처리함 — 필요해지면 "삭제" 버튼을 추가하는 별도 후속 작업으로 남긴다.
