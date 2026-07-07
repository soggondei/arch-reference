# 모바일 반응형 + PWA 설치 지원 설계

날짜: 2026-07-07
대상 프로젝트: arch-reference (`/Users/songseung-gon/Desktop/arch-reference`)

## 배경

현재 `arch-reference`는 데스크톱 전용 레이아웃이다 (`sm:`/`md:`/`lg:` 반응형 클래스가 전체 코드베이스에 11곳뿐). 필터 사이드바가 모든 화면 크기에서 고정 폭(`w-56`)으로 본문 옆에 나란히 배치되고, 업로드 폼·일정 섹션의 입력 필드가 `grid-cols-2` 고정이라 좁은 화면에서 압축된다.

## 목표 / 범위

- 모바일 브라우저에서 **전체 기능 동등 지원** (조회뿐 아니라 업로드, 태그 편집, 공모전 상태 변경, Notion 동기화까지 모바일에서 100% 사용 가능해야 함)
- 홈 화면에 추가해 앱처럼 쓰는 **PWA 설치 지원** (오프라인 캐싱은 범위 밖 — 설치/앱 느낌만)
- 데스크톱 레이아웃은 회귀 없이 그대로 유지

## 범위 밖

- 오프라인 캐싱 / 서비스워커 기반 데이터 캐시 전략
- 네이티브 앱 전환(React Native 등)
- 로고 디자인(별도 브랜드 로고 없음 → 이니셜 기반 아이콘으로 대체)

## 아키텍처 결정

- 브레이크포인트는 Tailwind 기본값 `md`(768px) 하나만 사용해 데스크톱/모바일을 분기한다. 새 브레이크포인트를 추가하지 않는다.
- 필터 하단 시트는 라이브러리 없이 커스텀 컴포넌트로 구현한다 (의존성 최소화).
- PWA는 수동 구성으로 진행한다 (`next-pwa` 등 플러그인 미사용) — manifest + 아이콘 + 캐싱 없는 최소 서비스워커.

## 설계 상세

### 1. 레이아웃 셸 (`app/page.tsx`)

- `<FilterPanel>` (약 615번 줄)을 `hidden md:flex`로 감싸 데스크톱에서만 사이드바로 노출한다.
- 모바일(`md:hidden`)에서는 그리드 위에 "필터" 플로팅 버튼을 노출한다. 버튼에는 현재 활성화된 필터 개수를 배지로 표시한다.
- 버튼 클릭 시 신규 `FilterSheet` 컴포넌트를 연다.

### 2. `FilterSheet` 컴포넌트 (신규: `components/FilterSheet.tsx`)

- `fixed inset-0` 반투명 배경(dim) + 하단에서 슬라이드업되는 패널(`max-h-[85vh]`, 상단 둥근 모서리, 상단 중앙에 드래그 핸들 바 표시).
- 열림/닫힘 상태는 부모(`page.tsx`)의 `useState`로 관리하고, `transition-transform` + `translate-y` 클래스로 애니메이션한다. 별도 애니메이션 라이브러리는 쓰지 않는다.
- 패널 내부 콘텐츠는 기존 `FilterPanel`을 재사용한다. `FilterPanel`에 `variant?: 'sidebar' | 'sheet'` 프롭을 추가해 `variant === 'sidebar'`일 때만 `<aside className="w-56 ...">` 래퍼를 적용하고, `'sheet'`일 때는 래퍼 없이 내용만 렌더링한다.
- 배경 클릭 또는 하단 "적용" 버튼으로 닫는다.

### 3. 헤더 (`app/page.tsx` 약 559번 줄)

- 검색창: `md:` 이상에서는 현재처럼 인라인 입력창을 유지한다. 모바일에서는 돋보기 아이콘 버튼만 노출하고, 탭하면 헤더 자리에 입력창이 펼쳐지는 방식(`useState`로 토글)으로 바꾼다.
- Refs/공모전 탭 바(약 596번 줄): `overflow-x-auto`를 추가해 가로 스크롤을 허용하고, 커스텀 유틸 클래스(`scrollbar-hide`, `globals.css`에 추가)로 스크롤바를 숨긴다.

### 4. 카드 그리드 / 상세 페이지

- 카드 그리드(약 649번 줄, `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)는 이미 모바일 대응돼 있어 수정하지 않는다.
- `app/reference/[id]/page.tsx`: 최상위 그리드(269번 줄, `grid-cols-1 lg:grid-cols-2`)는 유지한다. 내부 메타데이터 그리드 3곳(362, 408, 441번 줄)의 `grid-cols-2`를 `grid-cols-1 sm:grid-cols-2`로 변경한다.
- `components/SimilarPanel.tsx`의 `grid-cols-2 sm:grid-cols-3`는 이미 반응형이라 유지한다.

### 5. 업로드 폼 모달

- `app/page.tsx`의 업로드 모달(약 675번 줄, 현재 `w-full max-w-2xl mx-4` 중앙 다이얼로그)을 `md:` 미만에서 `fixed inset-0`으로 전체화면 전환한다. 전체화면일 때는 둥근 모서리/그림자를 제거하고, 상단에 닫기 버튼이 있는 고정 헤더 바를 추가한다.
- `components/UploadForm.tsx` 내부 필드 그리드(255, 409번 줄, `grid-cols-2`)를 `grid-cols-1 sm:grid-cols-2`로 변경한다.
- 이미지 미리보기/드래그앤드롭 영역은 폭 100% 기준이라 수정 불필요.

### 6. `ScheduleSection.tsx`

- 일정 입력 폼 그리드(258번 줄, `grid-cols-2`)를 `grid-cols-1 sm:grid-cols-2`로 변경한다.
- 일정 리스트 항목(308번 줄)은 이미 `flex` 기반이라 폭 문제 없음. 텍스트 오버플로우 시 `truncate` 처리가 적용돼 있는지만 확인하고, 빠져 있으면 추가한다.

### 7. PWA 설치 지원

**`public/manifest.json` (신규)**
```json
{
  "name": "Arch Reference",
  "short_name": "Arch Ref",
  "description": "건축사사무소 레퍼런스 검색 & 관리",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#18181b",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**아이콘**: 별도 로고가 없으므로 "AR" 이니셜 기반 심플 아이콘을 192px/512px PNG 2종으로 새로 생성해 `public/icon-192.png`, `public/icon-512.png`에 배치한다. 배경/텍스트 색상은 헤더 톤(zinc-900 계열)에 맞춘다.

**최소 서비스워커 (`public/sw.js`, 신규)**: 캐싱 없이 설치 가능 조건만 충족한다.
```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
```

**`app/layout.tsx` 변경**
- `<head>`에 `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color" content="#18181b">`, `<link rel="apple-touch-icon" href="/icon-192.png">` 추가.
- 서비스워커 등록을 위한 작은 클라이언트 컴포넌트(`components/RegisterSW.tsx`)를 추가해 `useEffect`에서 `navigator.serviceWorker.register('/sw.js')`를 호출하고, `RootLayout`에서 렌더링한다.

**iOS 대응**: iOS Safari는 자동 설치 배너가 없으므로, 헤더의 메뉴 영역에 "홈 화면에 추가" 안내 항목을 추가해 iOS 사용자에게 수동 설치 방법을 안내한다. Android/Chrome은 `beforeinstallprompt` 이벤트 기반 브라우저 기본 배너를 그대로 사용한다.

## 테스트 계획

- 로컬 개발 서버(`npm run dev`, 3001 포트)를 Chrome DevTools 모바일 에뮬레이션(iPhone SE / iPhone 14 Pro / Galaxy 크기)으로 확인.
- 확인 항목:
  - 필터 시트 열기/닫기, 필터 적용 후 그리드 반영
  - 헤더 검색 아이콘 → 입력창 펼침, 탭 가로 스크롤
  - 업로드 폼 전체화면 전환 + 이미지 업로드 + 태그 선택 실사용
  - 공모전 상태 변경 → 일정 자동 생성 → Notion 동기화까지 모바일에서 실제 확인 (기존 미커밋 변경사항인 `syncingIds` 가드 포함)
  - 레퍼런스 상세 페이지 메타데이터 그리드 줄바꿈 확인
  - `manifest.json` + 아이콘 인식 여부는 Chrome DevTools Application 탭에서 Installability 체크
- 회귀 확인: 데스크톱 레이아웃(사이드바, 2열 모달 등)이 기존 그대로 유지되는지 나란히 확인.

## 에러 처리 / 엣지 케이스

- 서비스워커 등록 실패는 조용히 무시한다(설치 배너가 안 뜰 뿐 앱 사용에는 지장 없음).
- 필터 시트가 열린 상태에서 뒤로가기(브라우저 네비게이션)를 누르면 시트만 닫히도록 처리할지는 구현 단계에서 필요 시 결정한다(현재는 범위에 포함하지 않음 — 배경 클릭/버튼으로만 닫음).
