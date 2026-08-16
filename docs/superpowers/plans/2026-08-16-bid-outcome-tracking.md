# 입찰 낙찰/패찰 판정 + 개인 바이어스 보정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참가완료한 입찰 건에 낙찰/패찰/결과대기 배지를 자동 표시하고, 패찰 건들의 격차를 평균 내어 "개인화 추천가"를 카드에 병기한다.

**Architecture:** 순수 클라이언트 사이드 파생 계산 — 새 Supabase 컬럼도, 새 API 호출도 없다. 이미 로드된 `bids`(Notion `낙찰업체`/`실제낙찰금액`/`실제낙찰률` 포함)와 `participations`(Supabase `제출입찰가`)를 조인해서 렌더링 시점에 즉시 계산한다.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, 기존 `app/page.tsx` 단일 파일 내 패턴 재사용.

## Global Constraints

- 상호명 비교는 정확히 일치할 때만 "낙찰"로 판정한다: `bid.낙찰업체.trim() === 'LV LAB건축사사무소'`. 부분일치·유사매칭 금지.
- 낙찰/패찰 판정은 `participations[b.공고번호]?.status === '참가완료'`인 건에만 적용한다.
- 바이어스 계산은 패찰 건 중 `제출입찰가`·`실제낙찰금액`·`실제낙찰률`이 모두 존재하는 건만 대상으로 하며, **3건 미만이면 `null`을 반환**해 개인화 추천가를 아예 표시하지 않는다.
- 우리제출률 계산: `실제낙찰률 * (제출입찰가 / 실제낙찰금액)`. 격차: `우리제출률 - 실제낙찰률`. 바이어스는 격차들의 평균.
- 개인화 추천가: `round(추천입찰가 * (1 + bias / 100))` — 근사치이며 UI에 "근사" 문구를 명시한다.
- 바이어스는 `bids` 전체(필터링 전) 기준으로 한 번 계산해서 모든 카드에 동일하게 적용한다 — 필터마다 다시 계산하지 않는다.
- Notion에는 아무것도 쓰지 않는다. Supabase 스키마 변경 없음.
- 이 프로젝트는 자동화 테스트가 없다 — 검증은 `npx tsc --noEmit` + `npm run build` + 브라우저 수동 확인으로 한다.

---

### Task 1: `deriveOutcome`/`computePersonalBias` 추가 + `BidsView`에 배지·개인화 추천가 표시

**Files:**
- Modify: `app/page.tsx` (아래 각 지점 — 파일이 계속 편집되고 있으므로 줄 번호보다 주변 코드로 위치를 확인할 것)
  - `classifyAgency` 정의(현재 207~217번째 줄) 바로 뒤, `PARTICIPATION_FILTERS` 정의(현재 218번째 줄) 바로 앞에 `Outcome`/`OUTCOME_COLOR`/`deriveOutcome`/`computePersonalBias` 추가
  - `BidsView` 함수 본문 상단(현재 354~357번째 줄 부근, `regions` 계산 다음)에 `bias` 계산 추가
  - 카드 렌더링의 `filtered.map(bid => (` (현재 444번째 줄)을 블록 바디로 변경해 `outcome` 로컬 변수 추가, 닫는 `))}` (현재 516번째 줄)도 `})}`로 변경
  - `BidParticipationControl` 바로 뒤(현재 451~455번째 줄)에 결과 배지 JSX 추가
  - 금액 정보 블록의 `추천입찰가` 표시(현재 475~481번째 줄) 바로 뒤에 개인화 추천가 줄 추가

**Interfaces:**
- Consumes: `BidItem`(기존, `낙찰업체`/`실제낙찰금액`/`실제낙찰률`/`추천입찰가` 필드), `BidParticipation`(기존, `status`/`submittedPrice` 필드)
- Produces: 없음 (모두 `app/page.tsx` 내부에서만 쓰임)

- [ ] **Step 1: `Outcome`/`OUTCOME_COLOR`/`deriveOutcome`/`computePersonalBias` 추가**

`classifyAgency` 함수 정의 바로 뒤(현재 217번째 줄, `PARTICIPATION_FILTERS` 정의보다 앞)에 삽입:

```ts
type Outcome = '낙찰' | '패찰' | '결과대기';

const OUTCOME_COLOR: Record<Outcome, string> = {
  '낙찰': '#22c55e',
  '패찰': '#ef4444',
  '결과대기': '#d4d4d8',
};

// 상호명 정확 일치일 때만 낙찰로 판정 (오탐 방지 — 부분일치 금지)
const OUR_COMPANY_NAME = 'LV LAB건축사사무소';

function deriveOutcome(bid: BidItem, p: BidParticipation | undefined): Outcome | null {
  if (p?.status !== '참가완료') return null;
  if (!bid.낙찰업체) return '결과대기';
  return bid.낙찰업체.trim() === OUR_COMPANY_NAME ? '낙찰' : '패찰';
}

// 패찰 건들의 "우리 제출률 - 실제낙찰률" 평균 (%p). 표본 3건 미만이면 null.
function computePersonalBias(bids: BidItem[], participations: Record<string, BidParticipation | undefined>): number | null {
  const gaps: number[] = [];
  for (const bid of bids) {
    const p = participations[bid.공고번호];
    if (deriveOutcome(bid, p) !== '패찰') continue;
    if (!p?.submittedPrice || !bid.실제낙찰금액 || !bid.실제낙찰률) continue;
    const 우리제출률 = bid.실제낙찰률 * (p.submittedPrice / bid.실제낙찰금액);
    gaps.push(우리제출률 - bid.실제낙찰률);
  }
  if (gaps.length < 3) return null;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}
```

- [ ] **Step 2: 타입체크로 새 코드 자체의 문법 오류만 우선 확인**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit`
Expected: 아직 아무도 이 함수들을 안 쓰므로 미사용 변수 경고 없이(export 안 했으므로 lint 설정에 따라 다를 수 있음, tsc 자체는 에러 없이) 통과해야 함.

- [ ] **Step 3: `BidsView`에 `bias` 계산 추가**

`BidsView` 함수 본문에서 `const regions = Array.from(new Set(bids.map(b => b.지역).filter(Boolean))).sort();` 줄(현재 356번째 줄) 바로 뒤에 추가:

```ts
  const bias = computePersonalBias(bids, participations);
```

(이 줄은 `filtered` 계산보다 위, `bids`는 필터링 전 전체 배열이어야 하므로 `const filtered = bids.filter(...)` 줄보다 반드시 앞에 위치해야 함 — 이미 그 위치에 있음)

- [ ] **Step 4: 카드 map 콜백을 블록 바디로 변경 + 결과 배지 추가**

`filtered.map(bid => (` 로 시작하는 블록(현재 444번째 줄부터 516번째 줄 `))}`까지)을 다음과 같이 변경한다:

1. 444번째 줄 `{filtered.map(bid => (`를 `{filtered.map(bid => {`로 변경
2. 그 다음 줄(445번째 줄, `<div key={bid.id} ...`) 바로 앞에 삽입:
   ```ts
   const outcome = deriveOutcome(bid, participations[bid.공고번호]);
   return (
   ```
3. `<BidParticipationControl ... />`(현재 451~455번째 줄) 바로 뒤, `{/* 공고명 */}` 주석(현재 456번째 줄) 바로 앞에 삽입:
   ```tsx
                {outcome && (
                  <span className="shrink-0 mt-0.5 text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: OUTCOME_COLOR[outcome] }}>
                    {outcome}
                  </span>
                )}
   ```
4. 516번째 줄 `))}`를 `);\n          })}`로 변경 (즉 `return (...)`을 닫는 `);`와 `.map` 콜백을 닫는 `})}`로 분리)

변경 후 이 블록의 전체 구조는 다음과 같아야 한다 (발췌, 일부 생략):

```tsx
          {filtered.map(bid => {
            const outcome = deriveOutcome(bid, participations[bid.공고번호]);
            return (
            <div key={bid.id} className="bg-white border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                {/* 상태 뱃지 */}
                <span className="shrink-0 mt-0.5 text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: BID_STATUS_COLOR[bid.상태] ?? '#94a3b8' }}>
                  {bid.상태}
                </span>
                <BidParticipationControl
                  bidNo={bid.공고번호}
                  participation={participations[bid.공고번호]}
                  onChange={onParticipationChange}
                />
                {outcome && (
                  <span className="shrink-0 mt-0.5 text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: OUTCOME_COLOR[outcome] }}>
                    {outcome}
                  </span>
                )}
                {/* 공고명 */}
                ...
              </div>
              ...
            </div>
            );
          })}
```

(들여쓰기는 기존 파일의 스타일에 맞춰 정리할 것 — 위 발췌는 구조 확인용이며 정확한 공백 수는 기존 코드와 일치시킨다)

- [ ] **Step 5: 개인화 추천가 표시 추가**

`추천입찰가` 표시 블록(현재 475~481번째 줄, `{bid.추천입찰가 && ( ... )}`) 바로 뒤, `실제낙찰금액` 블록(현재 482번째 줄) 바로 앞에 삽입:

```tsx
                {bid.추천입찰가 && bias !== null && (
                  <div>
                    <span className="text-zinc-400">개인화 </span>
                    <span className="font-semibold text-indigo-600">{fmtWon(Math.round(bid.추천입찰가 * (1 + bias / 100)))}</span>
                    <span className="text-zinc-400 ml-1">(근사, {bias >= 0 ? '+' : ''}{bias.toFixed(1)}%p 보정)</span>
                  </div>
                )}
```

- [ ] **Step 6: 타입체크 + 빌드**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit && npm run build`
Expected: 에러 없이 통과

- [ ] **Step 7: 브라우저에서 수동 확인**

```bash
cd /Users/songseung-gon/Desktop/arch-reference && npm run dev
```

브라우저(`http://localhost:3001` 또는 콘솔에 뜨는 포트)에서:

1. 이미 개찰이 끝나 `낙찰업체`가 채워진 실제 공고를 하나 찾는다 (상태 필터를 "낙찰" 또는 "유찰"로 바꾸면 개찰 완료된 건들이 보임).
2. 그 공고를 임시로 "참가완료"로 표시하고 아무 금액이나 넣어 저장 → 카드에 낙찰/패찰 배지가 뜨는지 확인 (그 공고의 `낙찰업체`가 "LV LAB건축사사무소"와 일치하면 낙찰, 아니면 패찰이 떠야 함 — 실제 데이터라면 대부분 패찰로 뜰 것).
3. `실제낙찰금액`·`실제낙찰률`이 있는 개찰 완료 건 3개 이상을 임시로 참가완료+제출가로 마킹 → 카드에 "개인화" 줄이 뜨는지 확인. 2개만 마킹된 상태에서는 뜨지 않는지도 확인.
4. 확인 후, 테스트로 만든 참가기록은 Supabase 대시보드 Table Editor에서 해당 행들을 삭제해 정리한다 (UI에 "미정으로 되돌리기" 기능이 없으므로).

- [ ] **Step 8: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Add win/loss outcome badges and personal bias-corrected recommendation

deriveOutcome() compares Notion's 낙찰업체 against our own company name
for 참가완료 bids (낙찰/패찰/결과대기, no new storage — purely derived).
computePersonalBias() averages the gap between our submitted rate and
the actual winning rate across lost bids (min 3 samples) and the result
is shown as an approximate personalized recommendation alongside the
existing market-average 추천입찰가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan Self-Review Notes

- **Spec coverage:** 낙찰/패찰/결과대기 판정(Step 1, 4), 바이어스 계산(Step 1, 3), 개인화 추천가 표시(Step 5) 모두 스펙과 1:1 대응. "범위 밖" 항목(나라장터 로그인 스크래핑, bid-monitor 수정, Supabase 스키마 변경, Notion 쓰기)은 어떤 단계에도 포함하지 않음 — 의도된 누락.
- **표본 3건 미만 시 미표시:** `computePersonalBias`가 `gaps.length < 3`이면 `null`을 반환하고, Step 5의 조건문이 `bias !== null`을 명시적으로 체크하므로 표본 부족 시 줄 자체가 렌더링되지 않음이 코드 구조로 보장됨.
- **상호명 정확 일치:** `deriveOutcome`이 `.trim() === OUR_COMPANY_NAME`만 쓰고 `includes`나 정규식을 쓰지 않아 부분일치로 인한 오탐(예: 유사 상호명 업체를 우리로 오판)을 구조적으로 방지.
