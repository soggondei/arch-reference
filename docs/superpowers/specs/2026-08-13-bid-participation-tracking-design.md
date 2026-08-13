# 입찰 참가기록 트래킹 — 설계

## 배경

`app/api/bids`가 bid-monitor(외부 Node 프로젝트)가 채우는 Notion DB(`나라장터 건축입찰 모니터`)를 읽기 전용으로 조회해서 `BidsView`(입찰정보 탭)에 표시하고 있다. 지금은 공고 자체의 모니터링 정보(배정예산·추천입찰가·낙찰결과)만 있고, "우리가 실제로 이 건에 참가했는지, 얼마를 써서 냈는지"는 어디에도 기록되지 않는다. 여러 건이 동시에 마감되는 경우 어떤 건을 참가하기로 했고 어떤 건이 이미 처리됐는지 한눈에 구분되지 않아 진행에 불편함이 있다.

## 목표

1. 공고별로 참가 여부(미정/참가예정/참가완료/패스)와, 참가완료 시 실제 제출 입찰금액·제출일을 기록한다.
2. 입찰정보 탭에서 참가여부 기준으로 필터링해 "참가해야 하는 건"과 "이미 처리된 건"을 구분해서 볼 수 있게 한다.

## 아키텍처

bid-monitor의 자동 수집 파이프라인(Notion DB)은 건드리지 않는다. arch-reference의 Supabase에 새 테이블 `bid_participations`를 추가하고, 프론트엔드에서 Notion 기반 공고 데이터(`/api/bids`)와 Supabase 참가기록을 **공고번호**로 조인해서 표시한다. 두 시스템의 책임을 분리한다: bid-monitor는 "어떤 공고가 있고 낙찰가는 얼마였는지"를, arch-reference는 "우리가 그 공고에 어떻게 대응했는지"를 소유한다.

Supabase 접근은 기존 `refs`/`collections`와 동일하게 `lib/store.ts`의 클라이언트 사이드 함수를 통해 이뤄진다 (별도 Next.js API route를 새로 만들지 않음 — Notion 토큰처럼 서버에만 있는 비밀값이 필요한 경우에만 API route를 쓰는 게 기존 컨벤션).

## 데이터 모델

Supabase 테이블 `bid_participations`:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `공고번호` | text, primary key | Notion `BidItem.공고번호`와 조인 키 |
| `상태` | text | `참가예정` \| `참가완료` \| `패스` (`미정`은 행이 아예 없는 상태로 표현) |
| `제출입찰가` | numeric, nullable | `상태='참가완료'`일 때만 값 존재 |
| `제출일` | date, nullable | `상태='참가완료'`일 때만 값 존재 |
| `updated_at` | timestamptz, default now(), on update now() | |

- RLS 정책은 `refs`/`collections`와 동일하게 맞춘다 (anon key로 공개 read/write).
- 공고번호가 Notion DB 안에서 유일함은 `save-notion.js`의 중복 체크(공고번호 기준 upsert)로 이미 보장되어 있음을 확인했다.

## `lib/store.ts` 추가 함수

```ts
export interface BidParticipation {
  공고번호: string;
  상태: '참가예정' | '참가완료' | '패스';
  제출입찰가: number | null;
  제출일: string | null;
}

export async function getBidParticipations(): Promise<BidParticipation[]>
export async function upsertBidParticipation(p: BidParticipation): Promise<void>
```

- `getBidParticipations`: 테이블 전체를 한 번에 가져온다 (건수가 수백 건 수준이라 `getRefs`와 동일하게 페이지네이션 없이 처리).
- `upsertBidParticipation`: `supabase.from('bid_participations').upsert(...)`. `상태`를 `참가예정`이나 `패스`로 바꾸면 `제출입찰가`/`제출일`은 `null`로 같이 저장한다 (참가완료가 아닌데 금액이 남아있는 상태를 방지).

## UI 변경 (`app/page.tsx` — `BidsView` 및 관련 상태)

### 상태 관리
- `page.tsx`에 `participations: BidParticipation[]` 상태 추가, `bids`와 같은 타이밍(탭 최초 진입 시)에 `getBidParticipations()`로 로드.
- 공고번호 → `BidParticipation` 맵을 만들어 `BidsView`에 넘긴다. 맵에 없으면 `상태: '미정'`으로 취급.

### 필터
기존 `공고중/낙찰/유찰` 상태 필터 줄 옆에 구분선을 두고 참가여부 필터를 별도 그룹으로 추가:
- `전체`
- `참가필요` (미정 + 참가예정)
- `참가완료`
- `패스`

두 필터는 AND로 결합된다 (예: "공고중" + "참가필요"를 동시에 좁혀볼 수 있음). 참가여부 필터 기본값은 `전체`.

### 카드
- 상태 배지(공고중/낙찰/유찰) 옆에 참가상태 배지 추가:
  - 미정 = 회색, 참가예정 = 주황, 참가완료 = 초록, 패스 = 흐린 회색(취소선 느낌 아님, 단순 회색조)
- 금액 정보 줄에 `제출입찰가`가 있으면 `추천입찰가` 옆에 병기 (예: `제출입찰가 2,150만 (2026-08-14 제출)`)
- 카드 하단에 "참가상태 변경" 토글 버튼 → 클릭 시 인라인 편집 영역이 펼쳐짐:
  - 상태 라디오/드롭다운 (미정/참가예정/참가완료/패스)
  - `참가완료` 선택 시에만 제출입찰가(숫자 입력)·제출일(날짜 입력) 필드 노출
  - 저장 버튼 클릭 → `upsertBidParticipation` 호출 → 성공 시 로컬 `participations` 상태 optimistic update, 편집 영역 닫힘
  - 실패 시 alert 또는 인라인 에러 텍스트로 실패를 알리고 편집 영역은 유지 (재시도 가능하게)

## 범위 밖

- Notion DB에는 아무것도 쓰지 않는다 (bid-monitor 파이프라인과 완전 분리 유지).
- 담당자/메모 필드는 추가하지 않는다.
- 우리 제출가와 실제 낙찰가를 비교하는 통계/승률 기능은 이번 범위가 아니다.

## 테스트 / 검증 방침

이 프로젝트는 자동화 테스트가 없다 (jest/vitest/playwright 전무, 기존 관행 유지). 검증은:
1. `npx tsc --noEmit`
2. `npm run build`
3. 로컬 브라우저에서 입찰정보 탭 열어 실제로 상태 변경 → 새로고침 후에도 값 유지되는지 확인 (Supabase 반영 확인), 필터 조합 동작 확인
