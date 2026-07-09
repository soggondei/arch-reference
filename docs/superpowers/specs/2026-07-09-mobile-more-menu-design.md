# 모바일 헤더 "더보기" 메뉴 설계

날짜: 2026-07-09
대상 프로젝트: arch-reference (`/Users/songseung-gon/Desktop/arch-reference`)

## 배경

`docs/superpowers/specs/2026-07-07-mobile-responsive-pwa-design.md`로 모바일 반응형 + PWA 작업(PR #1)을 완료했다. 그 작업 범위는 레퍼런스 조회/업로드/태그/공모전 상태변경으로 한정했고, 헤더의 "서울시 공모전"/"스코어러"/"북마클릿" 링크는 건드리지 않았다.

이 세 링크는 원래부터 `hidden sm:block` (640px 미만에서 숨김) 클래스가 붙어 있어, 모바일 화면에서는 접근할 방법이 아예 없었다. 사용자가 이를 인지하고 모바일에서도 접근 가능하게 해달라고 요청했다.

또한 PR #1에서 추가한 `IOSInstallHint`(iOS 홈 화면 추가 안내)도 이번에 같은 메뉴로 통합하기로 했다.

## 목표 / 범위

- 서울시 공모전/스코어러/북마클릿 링크를 모바일(768px 미만)에서도 접근 가능하게 한다.
- 기존 `IOSInstallHint`를 새 메뉴에 흡수하고, 기존 컴포넌트는 제거한다.
- 데스크톱(768px 이상) 노출 방식은 그대로 유지하되, 브레이크포인트만 `sm`(640px) → `md`(768px)로 통일한다.

## 범위 밖

- 아이패드 가로모드 등 768px 이상 iOS 화면에서의 설치 안내 노출 — 접근 불가능해지는 트레이드오프를 인지하고 범위에서 제외 (아이폰 세로 화면이 압도적 다수라는 판단).
- 세 링크(서울시 공모전/스코어러/북마클릿) 각 페이지 자체의 모바일 반응형 여부 — 이번 스펙은 "헤더에서 접근 가능하게" 하는 것만 다루고, 각 하위 페이지(`/seoul-import`, `/scorer-import`, `/bookmarklet`)의 모바일 레이아웃은 별도 논의 대상.

## 설계 상세

### 1. `MobileMoreMenu` 컴포넌트 (신규)

- `app/page.tsx`에 새 헬퍼 컴포넌트로 추가 (기존 `SearchInput`, `IOSInstallHint` 등과 같은 위치 — 파일 상단 헬퍼 컴포넌트 구역).
- 케밥(⋮) 아이콘 버튼 하나, `md:hidden` 클래스로 768px 미만에서만 노출.
- 클릭 시 드롭다운 패널이 열린다. 구조는 `ReferenceCard.tsx`의 폴더 선택 드롭다운과 동일한 패턴을 따른다:
  - `useState`로 열림/닫힘 상태 관리
  - `useRef` + `useEffect`의 `document.addEventListener('mousedown', ...)`로 바깥 클릭 시 자동 닫힘 (컴포넌트 언마운트 시 리스너 해제)
  - 스타일: `absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[160px]` (기존 드롭다운과 동일 톤)
- 드롭다운 내용:
  1. "서울시 공모전" — `/seoul-import`로 가는 `Link`
  2. "스코어러" — `/scorer-import`로 가는 `Link`
  3. "북마클릿" — `/bookmarklet`으로 가는 `Link`
  4. (조건부) iOS 기기이고 아직 설치되지 않은 경우에만: 구분선(`border-t border-zinc-100`) 아래에 "Safari 하단 공유 버튼을 누른 뒤 홈 화면에 추가를 선택하세요" 안내 텍스트를 정적으로 표시 (클릭 토글 없음 — 메뉴를 여는 것 자체가 이미 의도된 조회 행위이므로 이중 토글 불필요)
- iOS 감지 로직은 기존 `IOSInstallHint`와 동일하게 이식한다: `useEffect`에서 1회 `navigator.userAgent`에 `/iphone|ipad|ipod/i` 정규식 매칭 + `(window.navigator as unknown as { standalone?: boolean }).standalone !== true` 체크.

### 2. 기존 `IOSInstallHint` 제거

- `app/page.tsx`에서 `IOSInstallHint` 함수 정의와 헤더 내 `<IOSInstallHint />` 렌더 지점을 삭제한다.
- 그 자리(헤더 `ml-auto` 그룹의 첫 번째 위치)에 `<MobileMoreMenu />`를 렌더한다.

### 3. 기존 데스크톱 링크 3개의 브레이크포인트 통일

```tsx
<Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">서울시 공모전</Link>
<Link href="/scorer-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">스코어러</Link>
<Link href="/bookmarklet" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">북마클릿</Link>
```

세 줄 모두 `hidden sm:block` → `hidden md:block`으로 변경한다. `MobileMoreMenu`가 `md:hidden`이므로 768px를 기준으로 정확히 상호 배타적으로 전환되어, 640~768px 구간에서 두 UI가 동시에 보이는 문제가 없어진다.

## 테스트 계획

- `npx tsc --noEmit` 통과
- `npm run build` 통과
- 모바일 뷰포트(<768px)에서: 케밥 버튼 노출 → 클릭 시 드롭다운에 3개 링크 + (iOS UA 스푸핑 시) 안내 문구 노출 확인, 각 링크 클릭 시 정상 이동 확인, 바깥 클릭 시 닫힘 확인
- 640~768px 구간에서: 케밥 메뉴만 보이고 데스크톱 인라인 링크는 보이지 않는지 확인 (겹침 없음)
- 데스크톱(≥768px)에서: 케밥 버튼이 사라지고 기존처럼 인라인 링크 3개가 그대로 보이는지 확인 — 회귀 없음
- iOS UA 스푸핑 해제 시 안내 문구가 드롭다운에서 사라지는지 확인
