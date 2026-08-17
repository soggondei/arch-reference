# 창원시 전용 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상단 탭 바에 "창원시" 탭을 추가해 창원 관련 입찰 공고만 모아 보여주고, 참가 진행률 요약을 상단에 표시한다.

**Architecture:** 순수 클라이언트 사이드 파생 필터링 — 새 데이터 소스나 API 호출은 없다. "입찰정보" 탭과 `bids`/`participations` state를 공유하며, `classifyChangwon()`으로 걸러낸 부분집합을 기존 `BidsView` 컴포넌트에 그대로 넘겨서 재사용한다.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, 기존 `app/page.tsx` 단일 파일 내 패턴 재사용.

## Global Constraints

- 창원 판별은 `bid.공고명.includes('창원') || bid.공고기관.includes('창원')` — Notion/Supabase에 새 필드 저장하지 않고 매번 클라이언트에서 계산.
- 진행률 요약(전체/참가완료/낙찰/패찰/결과대기)은 창원 판별을 통과한 **전체** 공고 기준으로 고정 계산한다 — 아래 `BidsView`의 상태/참가여부 필터 선택과 무관하게 항상 "전체 그림"을 보여줘야 한다.
- 창원시 탭의 검색어/지역/발주처유형/참가여부/상태 필터는 "입찰정보" 탭의 필터 state와 완전히 독립이어야 한다 (서로 다른 페이지 레벨 state).
- `BidsView` 컴포넌트 자체는 수정하지 않는다 — 이미 검색/필터/참가상태 편집 기능을 다 갖추고 있으므로 그대로 재사용한다.
- 이 프로젝트는 자동화 테스트가 없다 — 검증은 `npx tsc --noEmit` + `npm run build` + 브라우저 수동 확인.

---

### Task 1: `classifyChangwon` + `ChangwonView` + 탭 바/렌더 연결

**Files:**
- Modify: `app/page.tsx` (아래 각 지점 — 파일이 계속 편집되고 있으므로 줄 번호보다 주변 코드로 위치를 확인할 것)
  - `classifyAgency` 함수(현재 207~216번째 줄) 바로 뒤에 `classifyChangwon` 추가
  - `BidsView` 함수 정의(현재 368번째 줄) 바로 앞에 `ChangwonView` 컴포넌트 추가
  - 탭 타입 선언(현재 954번째 줄)에 `'changwon'` 추가
  - 페이지 state(966~968번째 줄 부근)에 창원시 탭 전용 필터 state 5개 추가
  - "입찰정보" 탭 버튼(현재 1310~1347번째 줄)의 `onClick` 데이터 로딩 로직을 재사용 가능한 `loadBidsIfNeeded` 함수로 추출
  - "입찰정보" 탭 버튼 바로 뒤(현재 1348번째 줄 앞)에 "창원시" 탭 버튼 추가
  - 탭 콘텐츠 렌더 분기(현재 1473~1474번째 줄 부근, `) : tab === 'bids' ? (`)에 `changwon` 분기 추가

**Interfaces:**
- Consumes: `BidItem`, `BidParticipation`, `Outcome`, `deriveOutcome`(기존, 208번째 줄대 정의), `BidsView`(기존 컴포넌트, prop 시그니처 변경 없이 그대로 사용)
- Produces: 없음 (최상위 페이지 컴포넌트, `classifyChangwon`/`ChangwonView` 모두 같은 파일 내에서만 쓰임)

- [ ] **Step 1: `classifyChangwon` 추가**

`classifyAgency` 함수 정의(현재 207~216번째 줄) 바로 뒤에 삽입:

```ts
function classifyChangwon(bid: BidItem): boolean {
  return bid.공고명.includes('창원') || bid.공고기관.includes('창원');
}
```

- [ ] **Step 2: `ChangwonView` 컴포넌트 추가**

`BidsView` 함수 정의 바로 앞(현재 368번째 줄)에 삽입. `BidsView`와 완전히 동일한 prop 인터페이스를 그대로 받아서 전달하되, `bids`만 창원 건으로 미리 거르고 상단에 진행률 요약을 추가한다:

```tsx
function ChangwonView(props: {
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
  const changwonBids = props.bids.filter(classifyChangwon);

  let 참가완료 = 0, 낙찰 = 0, 패찰 = 0, 결과대기 = 0;
  changwonBids.forEach(bid => {
    const p = props.participations[bid.공고번호];
    if (p?.status === '참가완료') {
      참가완료++;
      const outcome = deriveOutcome(bid, p);
      if (outcome === '낙찰') 낙찰++;
      else if (outcome === '패찰') 패찰++;
      else if (outcome === '결과대기') 결과대기++;
    }
  });

  return (
    <div className="flex-1 min-w-0">
      {props.loaded && !props.error && (
        <div className="mb-4 text-sm text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3">
          전체 <span className="font-semibold text-zinc-900">{changwonBids.length}건</span>
          {' · '}참가완료 <span className="font-semibold text-zinc-900">{참가완료}건</span>
          {' '}(낙찰 {낙찰} · 패찰 {패찰} · 결과대기 {결과대기})
        </div>
      )}
      <BidsView {...props} bids={changwonBids} />
    </div>
  );
}
```

- [ ] **Step 3: 타입체크로 새 컴포넌트 자체의 문법 오류만 우선 확인**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit`
Expected: `ChangwonView`가 아직 아무 데서도 안 쓰이므로(다음 스텝에서 사용) "선언되었지만 사용되지 않음" 경고가 날 수 있음 — 이 시점에는 문법 에러만 없으면 됨. 다음 스텝까지 마친 뒤 최종 확인한다.

- [ ] **Step 4: 탭 타입에 `'changwon'` 추가**

현재 954번째 줄:
```ts
const [tab, setTab] = useState<'refs' | 'competitions' | 'bids' | 'links'>('refs');
```
을 다음으로 교체:
```ts
const [tab, setTab] = useState<'refs' | 'competitions' | 'bids' | 'changwon' | 'links'>('refs');
```

- [ ] **Step 5: 창원시 탭 전용 필터 state 5개 추가**

현재 968번째 줄(`const [bidAgencyTypeFilter, setBidAgencyTypeFilter] = useState<AgencyType | '전체'>('전체');`) 바로 뒤에 추가:

```ts
const [changwonStatusFilter, setChangwonStatusFilter] = useState<string>('공고중');
const [changwonParticipationFilter, setChangwonParticipationFilter] = useState<ParticipationFilter>('전체');
const [changwonSearchQuery, setChangwonSearchQuery] = useState('');
const [changwonRegionFilter, setChangwonRegionFilter] = useState('전체');
const [changwonAgencyTypeFilter, setChangwonAgencyTypeFilter] = useState<AgencyType | '전체'>('전체');
```

- [ ] **Step 6: 데이터 로딩 로직을 `loadBidsIfNeeded`로 추출**

"입찰정보" 탭 버튼(현재 1310~1347번째 줄)을 다음으로 교체 — `onClick` 안의 로딩 로직을 별도 함수로 뽑아내고, 버튼은 그 함수를 호출하도록 바꾼다:

```tsx
          <button
            onClick={() => { setTab('bids'); loadBidsIfNeeded(); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === 'bids' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            입찰정보
          </button>
          <button
            onClick={() => { setTab('changwon'); loadBidsIfNeeded(); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === 'changwon' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            창원시
          </button>
```

그리고 이 두 버튼보다 앞쪽, 같은 컴포넌트 함수 본문 안(다른 핸들러 함수들이 정의된 위치 — `handleCompetitionStatusChange` 등 기존 핸들러 함수 정의부 근처, 대략 현재 1310번째 줄 이전의 아무 핸들러 정의 뒤)에 다음 함수를 추가한다:

```ts
function loadBidsIfNeeded() {
  if (bidsLoaded) return;
  // Bids (Notion feed) and participations (Supabase) are independent
  // data sources — a failure in one must not block the other.
  fetch('/api/bids')
    .then(r => r.json())
    .then((data: BidItem[] | { error: string }) => {
      if (Array.isArray(data)) {
        setBids(data);
        setBidsError(false);
      } else {
        setBids([]);
        setBidsError(true);
      }
      setBidsLoaded(true);
    })
    .catch(() => {
      setBids([]);
      setBidsError(true);
      setBidsLoaded(true);
    });
  getBidParticipations()
    .then(participationsData => {
      setParticipations(Object.fromEntries(participationsData.map(p => [p.bidNo, p])));
    })
    .catch(() => {
      // Degrade gracefully: treat every bid as 미정 rather than
      // letting a Supabase hiccup block the bid list.
      setParticipations({});
    });
}
```

이 함수는 `Home` 컴포넌트 함수 본문의 최상위 레벨(다른 `function xxx() {...}` 형태의 이벤트 핸들러들과 같은 위치)에 정의한다 — 기존 파일에 이미 `function handleCompetitionStatusChange(...)` 같은 일반 함수 선언 핸들러들이 여럿 있으므로 그 옆에 추가하면 된다.

- [ ] **Step 7: 탭 콘텐츠 렌더 분기에 `changwon` 추가**

현재 `) : tab === 'bids' ? (` 로 시작해서 `<BidsView ... />`로 끝나는 블록(현재 1473~1489번째 줄 부근) 바로 뒤에 삽입:

```tsx
        ) : tab === 'changwon' ? (
          <ChangwonView
            bids={bids}
            loaded={bidsLoaded}
            error={bidsError}
            statusFilter={changwonStatusFilter}
            onStatusFilter={setChangwonStatusFilter}
            participations={participations}
            participationFilter={changwonParticipationFilter}
            onParticipationFilter={setChangwonParticipationFilter}
            onParticipationChange={handleParticipationChange}
            searchQuery={changwonSearchQuery}
            onSearchQuery={setChangwonSearchQuery}
            regionFilter={changwonRegionFilter}
            onRegionFilter={setChangwonRegionFilter}
            agencyTypeFilter={changwonAgencyTypeFilter}
            onAgencyTypeFilter={setChangwonAgencyTypeFilter}
          />
```

(`handleParticipationChange`는 "입찰정보" 탭의 `<BidsView>`에 이미 넘기고 있는 기존 핸들러를 그대로 재사용 — 새로 만들지 않는다)

- [ ] **Step 8: 타입체크 + 빌드**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit && npm run build`
Expected: 에러 없이 통과

- [ ] **Step 9: 브라우저에서 수동 확인**

```bash
cd /Users/songseung-gon/Desktop/arch-reference && npm run dev
```

브라우저(`http://localhost:3001` 또는 콘솔에 뜨는 포트)에서:
1. "입찰정보" 탭을 먼저 클릭해 데이터를 로드한 뒤 "창원시" 탭으로 전환 → 별도 API 재호출 없이 바로 뜨는지(네트워크 탭에서 확인 가능) 확인
2. 새로고침 후 "창원시" 탭을 먼저 클릭 → 정상적으로 데이터가 로드되는지 확인
3. 진행률 요약 숫자가 실제로 창원 관련 공고 중 참가완료/낙찰/패찰/결과대기 건수와 일치하는지 눈으로 검증 (몇 건을 직접 세어봐도 됨)
4. 창원시 탭에서 검색어를 입력하거나 필터를 바꾼 뒤 "입찰정보" 탭으로 전환 → 그 탭의 필터가 그대로인지(서로 안 섞였는지) 확인, 반대 방향도 확인
5. 창원시 탭 목록의 카드에서 참가상태 배지 클릭 → 인라인 편집이 "입찰정보" 탭과 동일하게 동작하는지 확인

- [ ] **Step 10: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Add dedicated 창원시 tab with participation progress summary

classifyChangwon() filters the shared bids feed client-side (no new
storage). ChangwonView wraps BidsView with a fixed-scope progress
summary (총/참가완료/낙찰/패찰/결과대기) and its own independent
filter state, sharing the same loaded bids/participations data as
the 입찰정보 tab via the extracted loadBidsIfNeeded() loader.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan Self-Review Notes

- **Spec coverage:** 새 탭(Step 4, 6, 7), 진행률 요약(Step 2), 기존 카드리스트 재사용(Step 2의 `<BidsView {...props} bids={changwonBids} />`), 독립 필터 state(Step 5) 모두 스펙과 1:1 대응. "범위 밖" 항목(지역 드롭다운 숨김, 저장, 별도 통계)은 어떤 단계에도 포함하지 않음.
- **DRY 판단:** 두 탭이 동일한 로딩 로직을 필요로 하게 되면서 원래 인라인이던 코드를 `loadBidsIfNeeded` 함수로 뽑아냈다 — 이건 "따로 요청받지 않은 리팩토링"이 아니라 이번 태스크가 요구하는 최소한의 구조 변경이다(두 번째 탭이 생기는 순간 중복이 발생하므로).
- **타입 일치:** `ChangwonView`의 props 타입이 `BidsView`의 props 타입과 정확히 동일해야 `{...props}` 스프레드가 타입 에러 없이 통과한다 — Step 2의 인터페이스가 Step 7에서 실제로 넘기는 값들과 정확히 일치하는지 구현자가 다시 한 번 확인해야 함.
