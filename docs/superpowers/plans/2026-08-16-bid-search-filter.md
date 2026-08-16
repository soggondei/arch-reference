# 입찰정보 검색·필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입찰정보 탭에 공고명·공고기관 텍스트 검색, 발주처유형(교육청/지자체/조달청 등) 필터, 지역(시·도) 필터를 추가한다.

**Architecture:** 순수 클라이언트 사이드 필터링 — 새 데이터 소스나 API 호출은 없다. 이미 로드된 `bids` 배열에 대해 `classifyAgency()`(신규 순수 함수)로 발주처유형을 즉시 계산하고, 검색어/지역/발주처유형을 기존 `statusFilter`/`participationFilter`와 같은 방식으로 페이지 컴포넌트 state에 올려 `BidsView`에 내려준다.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, 기존 `app/page.tsx` 단일 파일 내 패턴 재사용.

## Global Constraints

- 발주처유형 분류는 클라이언트에서 즉시 계산하는 파생값이며 Notion/Supabase에 저장하지 않는다.
- 새 필터 3종(`searchQuery`/`regionFilter`/`agencyTypeFilter`)은 기존 `bidStatusFilter`/`participationFilter`와 동일하게 페이지 컴포넌트(`Home`) state에 둔다 — `BidsView`는 탭 전환 시 언마운트되므로 로컬 state로 두면 탭을 벗어났다 돌아올 때 필터가 초기화된다.
- 모든 필터(상태/참가여부/발주처유형/지역/검색어)는 AND로 결합한다.
- 이 프로젝트는 자동화 테스트가 없다 — 검증은 `npx tsc --noEmit` + `npm run build` + 브라우저 수동 확인으로 한다.
- `app/api/bids/route.ts`(Notion 읽기 전용 프록시)는 건드리지 않는다.

---

### Task 1: `classifyAgency` 함수 + 검색·지역·발주처유형 필터를 `BidsView`에 추가

**Files:**
- Modify: `app/page.tsx` (아래 각 지점 — 파일이 자체 편집으로 이미 조금씩 이동했을 수 있으니 줄 번호보다 주변 코드로 위치를 확인할 것)
  - `BID_STATUS_COLOR` 정의(200~202번째 줄) 근처에 `classifyAgency` + `AGENCY_TYPES` 추가
  - `BidsView` 시그니처(323~332번째 줄)에 새 props 추가
  - 필터 로직(333~341번째 줄)에 검색어/지역/발주처유형 조건 추가
  - 필터 UI(353~379번째 줄) 위·아래에 검색창+지역 드롭다운, 발주처유형 pill 줄 추가
  - 페이지 컴포넌트 state(854~859번째 줄 부근)에 3개 state 추가
  - `BidsView` 렌더 호출(1365~1375번째 줄)에 새 props 전달

**Interfaces:**
- Consumes: `BidItem`(기존, `공고명`/`공고기관`/`지역` 필드 사용)
- Produces: 없음 (최상위 페이지 컴포넌트, 더 이상 소비하는 곳 없음). `classifyAgency`는 `BidsView`와 같은 파일 내에서만 쓰인다.

- [ ] **Step 1: `AGENCY_TYPES` + `classifyAgency` 추가**

`BID_STATUS_COLOR` 정의 바로 뒤(현재 202번째 줄, `PARTICIPATION_FILTERS` 정의보다 앞)에 삽입:

```ts
const AGENCY_TYPES = ['교육청', '지자체', '조달청', '농어촌·수산', '국방·군부대', '대학교', '공사·공단·진흥원', '기타'] as const;
type AgencyType = typeof AGENCY_TYPES[number];

function classifyAgency(공고기관: string): AgencyType {
  if (공고기관.includes('교육청')) return '교육청';
  if (공고기관.includes('조달청')) return '조달청';
  if (/국방부|군부대|사단|여단|해병대|공군|해군|육군|방위사업청|국군/.test(공고기관)) return '국방·군부대';
  if (/농어촌공사|수산|어항|어촌/.test(공고기관)) return '농어촌·수산';
  if (공고기관.includes('대학교')) return '대학교';
  if (/공사|공단|진흥원|재단법인|연구소|본부/.test(공고기관)) return '공사·공단·진흥원';
  if (/특별시|광역시|특별자치시|특별자치도|도|시|군|구/.test(공고기관)) return '지자체';
  return '기타';
}
```

- [ ] **Step 2: 타입체크로 새 코드 자체의 문법 오류만 우선 확인**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit`
Expected: 이 시점에는 `BidsView`가 아직 새 props를 안 받으므로 에러 없이 통과해야 함 (독립적으로 추가만 한 상태).

- [ ] **Step 3: `BidsView` 시그니처에 새 props 추가**

`BidsView` 함수 정의(현재 323~332번째 줄)를 다음으로 교체:

```ts
function BidsView({
  bids, loaded, error, statusFilter, onStatusFilter,
  participations, participationFilter, onParticipationFilter, onParticipationChange,
  searchQuery, onSearchQuery, regionFilter, onRegionFilter, agencyTypeFilter, onAgencyTypeFilter,
}: {
  bids: BidItem[]; loaded: boolean; error: boolean; statusFilter: string; onStatusFilter: (s: string) => void;
  participations: Record<string, BidParticipation | undefined>;
  participationFilter: ParticipationFilter;
  onParticipationFilter: (f: ParticipationFilter) => void;
  onParticipationChange: (p: BidParticipation) => Promise<void>;
  searchQuery: string;
  onSearchQuery: (q: string) => void;
  regionFilter: string;
  onRegionFilter: (r: string) => void;
  agencyTypeFilter: AgencyType | '전체';
  onAgencyTypeFilter: (a: AgencyType | '전체') => void;
}) {
```

- [ ] **Step 4: 필터 로직에 검색어/지역/발주처유형 조건 추가**

필터 로직 블록(현재 333~341번째 줄)을 다음으로 교체:

```ts
  const statuses = ['공고중', '낙찰', '유찰'];
  const counts = Object.fromEntries(statuses.map(s => [s, bids.filter(b => b.상태 === s).length]));
  const regions = Array.from(new Set(bids.map(b => b.지역).filter(Boolean))).sort();
  const q = searchQuery.trim().toLowerCase();
  const filtered = bids.filter(b => {
    if (b.상태 !== statusFilter) return false;
    const pStatus = participations[b.공고번호]?.status ?? '미정';
    if (participationFilter === '참가필요' && !(pStatus === '미정' || pStatus === '참가예정')) return false;
    if (participationFilter !== '전체' && participationFilter !== '참가필요' && pStatus !== participationFilter) return false;
    if (regionFilter !== '전체' && b.지역 !== regionFilter) return false;
    if (agencyTypeFilter !== '전체' && classifyAgency(b.공고기관) !== agencyTypeFilter) return false;
    if (q && !b.공고명.toLowerCase().includes(q) && !b.공고기관.toLowerCase().includes(q)) return false;
    return true;
  });
```

(기존 `if (!loaded) { ... }`, `if (error) { ... }` 블록은 그대로 유지)

- [ ] **Step 5: 검색창 + 지역 드롭다운 줄 추가**

`return (` 이후 `<div className="flex-1 min-w-0">` 바로 다음, 기존 `{/* 상태 필터 */}` 블록(현재 353번째 줄) 바로 앞에 삽입:

```tsx
      {/* 검색 + 지역 */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchQuery(e.target.value)}
          placeholder="공고명·공고기관 검색"
          className="flex-1 min-w-0 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <select
          value={regionFilter}
          onChange={e => onRegionFilter(e.target.value)}
          className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-zinc-700 shrink-0"
        >
          <option value="전체">전체 지역</option>
          {regions.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

```

- [ ] **Step 6: 발주처유형 pill 줄 추가**

기존 참가여부 필터 블록(현재 369~379번째 줄, `{PARTICIPATION_FILTERS.map(...)}`로 끝나는 `</div>`) 바로 뒤에 삽입:

```tsx
      <div className="flex flex-wrap gap-2 mb-5">
        {(['전체', ...AGENCY_TYPES] as const).map(a => (
          <button
            key={a}
            onClick={() => onAgencyTypeFilter(a)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${agencyTypeFilter === a ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
          >
            {a}
          </button>
        ))}
      </div>
```

- [ ] **Step 7: 페이지 컴포넌트에 새 state 3개 추가**

현재 859번째 줄(`const [participationFilter, setParticipationFilter] = useState<ParticipationFilter>('전체');`) 바로 뒤에 추가:

```ts
  const [bidSearchQuery, setBidSearchQuery] = useState('');
  const [bidRegionFilter, setBidRegionFilter] = useState('전체');
  const [bidAgencyTypeFilter, setBidAgencyTypeFilter] = useState<AgencyType | '전체'>('전체');
```

- [ ] **Step 8: `BidsView` 렌더 호출에 새 props 전달**

`BidsView` 렌더 호출(현재 1365~1375번째 줄)을 다음으로 교체:

```tsx
          <BidsView
            bids={bids}
            loaded={bidsLoaded}
            error={bidsError}
            statusFilter={bidStatusFilter}
            onStatusFilter={setBidStatusFilter}
            participations={participations}
            participationFilter={participationFilter}
            onParticipationFilter={setParticipationFilter}
            onParticipationChange={handleParticipationChange}
            searchQuery={bidSearchQuery}
            onSearchQuery={setBidSearchQuery}
            regionFilter={bidRegionFilter}
            onRegionFilter={setBidRegionFilter}
            agencyTypeFilter={bidAgencyTypeFilter}
            onAgencyTypeFilter={setBidAgencyTypeFilter}
          />
```

- [ ] **Step 9: 타입체크 + 빌드**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit && npm run build`
Expected: 에러 없이 통과

- [ ] **Step 10: `classifyAgency` 로직을 실제 데이터로 수동 검증**

브라우저를 띄우기 전에, Node REPL이나 임시 스크립트로 아래 대표 샘플이 의도한 분류로 나오는지 먼저 확인 (`app/page.tsx`에서 함수 정의부만 복사해 임시로 돌려봐도 되고, 브라우저 콘솔에서 확인해도 됨):

| 공고기관 샘플 | 기대 분류 |
|---|---|
| `경상남도교육청 경상남도창원교육지원청` | 교육청 |
| `서울특별시 금천구` | 지자체 |
| `조달청 부산지방조달청` | 조달청 |
| `한국농어촌공사 경북지역본부 의성.군위지사` | 농어촌·수산 |
| `국방부 국군재정관리단` | 국방·군부대 |
| `국립공주대학교` | 대학교 |
| `부산항만공사` | 공사·공단·진흥원 |
| `법무부` | 기타 |

`한국농어촌공사`처럼 "공사"와 "농어촌공사" 규칙에 동시에 걸리는 케이스가 4번 규칙(농어촌·수산)으로 먼저 분류되는지 반드시 확인 — 순서가 바뀌면 조용히 오분류된다.

- [ ] **Step 11: 브라우저에서 수동 확인**

```bash
cd /Users/songseung-gon/Desktop/arch-reference && npm run dev
```

브라우저(`http://localhost:3001` 또는 콘솔에 뜨는 포트)에서:
1. "입찰정보" 탭 → 검색창에 실제 데이터에 있는 지역명(예: "창원")을 입력 → 해당 공고만 남는지 확인
2. 검색창 비우기 → 지역 드롭다운에서 하나 선택 → 그 지역 공고만 남는지 확인
3. 발주처유형 pill에서 "교육청" 클릭 → 교육청 관련 공고만 남는지 확인
4. 검색어 + 지역 + 발주처유형 + 기존 상태/참가여부 필터를 동시에 걸어서 AND로 좁혀지는지 확인
5. 다른 탭(레퍼런스 등)으로 이동했다가 다시 "입찰정보" 탭으로 돌아와서 방금 설정한 검색어/지역/발주처유형이 유지되는지 확인 (페이지 컴포넌트 state이므로 유지돼야 함)
6. 필터 초기화(각각 "전체"로, 검색창 비우기) 후 전체 목록이 원래대로 돌아오는지 확인

- [ ] **Step 12: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Add search, agency-type, and region filters to 입찰정보 tab

classifyAgency() derives an agency-type bucket (교육청/지자체/조달청/...)
from 공고기관 text client-side; combined with a free-text search box and
a region dropdown, all filters AND together with the existing
status/participation filters.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan Self-Review Notes

- **Spec coverage:** 검색(Step 5), 지역 필터(Step 5), 발주처유형 필터+분류 함수(Step 1, Step 6), 상태 지속성(Step 7, 부모 state로 유지) 모두 스펙 항목과 1:1 대응. "범위 밖" 항목(시군구 전용 드롭다운, 분류 결과 영속화, 검색어 하이라이팅/최근검색어)은 어떤 단계에도 포함하지 않음 — 의도된 누락.
- **분류 순서 정합성:** 스펙의 우선순위 표를 코드 순서(if-return 체인)에 그대로 반영했고, "한국농어촌공사"가 공사/공단 규칙보다 농어촌·수산 규칙에 먼저 걸리는지 Step 10에서 명시적으로 검증하도록 함.
- **AND 결합:** Step 4의 필터 로직에서 상태/참가여부/지역/발주처유형/검색어 5개 조건이 모두 `return false`로 단락평가되는 단일 `filter` 콜백 안에 있어 AND 결합이 코드 구조상 보장됨.
