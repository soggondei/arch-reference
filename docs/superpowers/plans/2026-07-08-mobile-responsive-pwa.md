# 모바일 반응형 + PWA 설치 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `arch-reference`(Next.js 16 App Router)를 모바일 브라우저에서 전체 기능(조회/업로드/태그편집/공모전 상태변경/Notion 동기화) 동등하게 쓸 수 있도록 반응형으로 전환하고, 홈 화면 설치가 가능한 PWA로 만든다.

**Architecture:** Tailwind `md`(768px) 브레이크포인트 하나로 데스크톱/모바일을 분기한다. 필터 사이드바는 데스크톱에서 그대로 두고 모바일에서는 커스텀 `FilterSheet`(하단 시트) 컴포넌트로 대체한다. PWA는 `next-pwa` 같은 플러그인 없이 `manifest.json` + 캐싱 없는 최소 서비스워커 + Next Metadata API(`metadata.manifest`, `metadata.icons`, `viewport.themeColor`)로 수동 구성한다.

**Tech Stack:** Next.js 16.2.7 (App Router), React 19, TypeScript, Tailwind CSS v4. 아이콘 생성에 `sharp`(이미 `node_modules`에 설치돼 있음, Next 기본 의존성) 사용.

## Global Constraints

- 브레이크포인트는 Tailwind 기본값 `md`(768px) 하나만 사용한다. 커스텀 브레이크포인트를 추가하지 않는다.
- 새 런타임 의존성을 추가하지 않는다 (필터 시트: 커스텀 컴포넌트, PWA: 수동 구성 — `vaul`, `next-pwa` 등 미사용). `package.json`을 수정하는 태스크는 없다.
- PWA 서비스워커는 오프라인 캐싱을 하지 않는다 (`fetch` 이벤트는 패스스루만).
- `manifest.json`의 값은 스펙에 정의된 값을 그대로 사용한다: `theme_color: "#18181b"`, `background_color: "#ffffff"`, `display: "standalone"`, 아이콘 192x192/512x512.
- 데스크톱 레이아웃(사이드바, 중앙 모달, 그리드)은 시각적으로 기존과 동일하게 유지되어야 한다 (회귀 없음).
- **이 프로젝트에는 자동화된 테스트가 없다** (jest/vitest/playwright 설정, `*test*` 파일 전무 확인됨). 새 테스트 프레임워크를 추가하는 것은 이 계획의 범위 밖이다. 각 태스크의 검증은 `npx tsc --noEmit`(타입 체크) + `npm run dev`(3001 포트) 기반 수동 브라우저 확인으로 한다.
- 참고 스펙: `docs/superpowers/specs/2026-07-07-mobile-responsive-pwa-design.md`

---

## File Structure Overview

- `components/FilterPanel.tsx` — 수정: `variant` prop 추가 (사이드바/시트 겸용)
- `components/FilterSheet.tsx` — 신규: 모바일 하단 시트 래퍼
- `app/globals.css` — 수정: `scrollbar-hide` 유틸 클래스 추가
- `app/page.tsx` — 수정: 헤더 검색 토글, 탭 가로 스크롤, 필터 시트 연결, 업로드 모달 전체화면 전환, iOS 설치 안내
- `components/UploadForm.tsx` — 수정: 고정 2열 그리드 → 반응형
- `components/ScheduleSection.tsx` — 수정: 고정 2열 그리드 → 반응형
- `app/reference/[id]/page.tsx` — 수정: 고정 2열 그리드 3곳 → 반응형
- `public/manifest.json` — 신규
- `public/icon-192.png`, `public/icon-512.png` — 신규 (스크립트로 생성)
- `public/sw.js` — 신규: 캐싱 없는 최소 서비스워커
- `components/RegisterSW.tsx` — 신규: 서비스워커 등록 클라이언트 컴포넌트
- `app/layout.tsx` — 수정: `manifest`/`icons`/`viewport.themeColor` 메타데이터, `<RegisterSW />` 렌더

---

### Task 1: `FilterPanel`에 `variant` prop 추가

**Files:**
- Modify: `components/FilterPanel.tsx`

**Interfaces:**
- Produces: `FilterPanelProps`(export됨) — `variant?: 'sidebar' | 'sheet'` 필드 추가, 기본값 `'sidebar'`. 이후 Task 2에서 `Omit<FilterPanelProps, 'variant'>`로 재사용.

- [ ] **Step 1: `FilterPanelProps`를 export하고 `variant` 필드 추가**

`components/FilterPanel.tsx`에서:

```ts
interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  collections: Collection[];
  totalCount: number;
  filteredCount: number;
  onCreateCollection?: (name: string) => void;
  onDeleteCollection?: (id: string) => void;
}
```

를 다음으로 교체:

```ts
export interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  collections: Collection[];
  totalCount: number;
  filteredCount: number;
  onCreateCollection?: (name: string) => void;
  onDeleteCollection?: (id: string) => void;
  variant?: 'sidebar' | 'sheet';
}
```

- [ ] **Step 2: 함수 시그니처에 `variant` 구조분해 + 기본값 추가**

```ts
export default function FilterPanel({ filters, onFilterChange, collections, totalCount, filteredCount, onCreateCollection, onDeleteCollection }: FilterPanelProps) {
```

를 다음으로 교체:

```ts
export default function FilterPanel({ filters, onFilterChange, collections, totalCount, filteredCount, onCreateCollection, onDeleteCollection, variant = 'sidebar' }: FilterPanelProps) {
```

- [ ] **Step 3: 최상위 래퍼의 고정폭 클래스를 `variant`에 따라 조건부로 변경**

```tsx
  return (
    <aside className="w-56 shrink-0 flex flex-col gap-5">
```

를 다음으로 교체:

```tsx
  return (
    <aside className={variant === 'sidebar' ? 'w-56 shrink-0 flex flex-col gap-5' : 'flex flex-col gap-5'}>
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 확인**

`npm run dev` 실행 후 `http://localhost:3001` 데스크톱 너비(≥768px)에서 필터 사이드바가 기존과 동일하게(폭 224px, 좌측 고정) 보이는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add components/FilterPanel.tsx
git commit -m "feat: FilterPanel에 sidebar/sheet variant 지원 추가"
```

---

### Task 2: `FilterSheet` 컴포넌트 신규 작성

**Files:**
- Create: `components/FilterSheet.tsx`

**Interfaces:**
- Consumes: `FilterPanel`(default export) + `FilterPanelProps`(Task 1에서 export됨) from `components/FilterPanel.tsx`
- Produces: `FilterSheet` default export, props: `{ open: boolean; onClose: () => void } & Omit<FilterPanelProps, 'variant'>`. Task 3에서 `app/page.tsx`가 이 컴포넌트를 사용.

- [ ] **Step 1: 컴포넌트 작성**

`components/FilterSheet.tsx` 생성:

```tsx
'use client';

import FilterPanel, { FilterPanelProps } from './FilterPanel';

interface FilterSheetProps extends Omit<FilterPanelProps, 'variant'> {
  open: boolean;
  onClose: () => void;
}

export default function FilterSheet({ open, onClose, ...filterPanelProps }: FilterSheetProps) {
  return (
    <div className={`fixed inset-0 z-40 md:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="sticky top-0 bg-white flex flex-col items-center pt-2 pb-1 border-b border-zinc-100">
          <span className="w-10 h-1 rounded-full bg-zinc-200" />
        </div>
        <div className="p-4">
          <FilterPanel variant="sheet" {...filterPanelProps} />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-zinc-100 p-4">
          <button
            onClick={onClose}
            className="w-full bg-zinc-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (아직 `page.tsx`에서 사용하지 않으므로 미사용 경고는 없음 — export만 있는 상태)

- [ ] **Step 3: 커밋**

```bash
git add components/FilterSheet.tsx
git commit -m "feat: 모바일 필터용 FilterSheet 컴포넌트 추가"
```

---

### Task 3: `app/page.tsx`에 모바일 필터 시트 연결

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `FilterSheet`(Task 2), `FilterPanel`(기존 import 유지, `variant` prop은 명시하지 않으면 기본 `'sidebar'`)

- [ ] **Step 1: `FilterSheet` import 추가**

```ts
import FilterPanel from '@/components/FilterPanel';
import UploadForm from '@/components/UploadForm';
```

를 다음으로 교체:

```ts
import FilterPanel from '@/components/FilterPanel';
import FilterSheet from '@/components/FilterSheet';
import UploadForm from '@/components/UploadForm';
```

- [ ] **Step 2: `filterSheetOpen` state 추가**

```ts
  const [tab, setTab] = useState<'refs' | 'competitions'>('refs');
  const syncingIds = useRef<Set<string>>(new Set());
```

를 다음으로 교체:

```ts
  const [tab, setTab] = useState<'refs' | 'competitions'>('refs');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const syncingIds = useRef<Set<string>>(new Set());
```

- [ ] **Step 3: 활성 필터 개수 계산 추가**

`filtered` 배열 계산이 끝나는 지점(`return true;\n  });`) 바로 다음 줄에 추가:

```ts
    return true;
  });

  const activeFilterCount =
    filters.program.length + filters.material.length + filters.mass.length + filters.scale.length +
    filters.designItem.length + filters.site.length + filters.region.length + filters.refType.length +
    (filters.collectionId ? 1 : 0);
```

- [ ] **Step 4: 데스크톱 사이드바를 `hidden md:flex`로 감싸고, 모바일 필터 버튼 + `FilterSheet` 추가**

```tsx
        {tab === 'refs' ? (
          <>
            <FilterPanel
              filters={filters}
              onFilterChange={setFilters}
              collections={collections}
              totalCount={regularRefs.length}
              filteredCount={filtered.length}
              onCreateCollection={handleCreateCollection}
              onDeleteCollection={handleDeleteCollection}
            />
            <main className="flex-1 min-w-0">
              {filtered.length === 0 ? (
```

를 다음으로 교체:

```tsx
        {tab === 'refs' ? (
          <>
            <div className="hidden md:flex">
              <FilterPanel
                filters={filters}
                onFilterChange={setFilters}
                collections={collections}
                totalCount={regularRefs.length}
                filteredCount={filtered.length}
                onCreateCollection={handleCreateCollection}
                onDeleteCollection={handleDeleteCollection}
              />
            </div>
            <main className="flex-1 min-w-0">
              <button
                onClick={() => setFilterSheetOpen(true)}
                className="md:hidden mb-4 flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-600 bg-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
                </svg>
                필터
                {activeFilterCount > 0 && (
                  <span className="bg-zinc-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {filtered.length === 0 ? (
```

- [ ] **Step 5: `</main>` 다음에 `FilterSheet` 렌더 추가**

```tsx
            </main>
          </>
        ) : (
          <CompetitionView
```

를 다음으로 교체:

```tsx
            </main>
            <FilterSheet
              open={filterSheetOpen}
              onClose={() => setFilterSheetOpen(false)}
              filters={filters}
              onFilterChange={setFilters}
              collections={collections}
              totalCount={regularRefs.length}
              filteredCount={filtered.length}
              onCreateCollection={handleCreateCollection}
              onDeleteCollection={handleDeleteCollection}
            />
          </>
        ) : (
          <CompetitionView
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 수동 확인**

`npm run dev` 실행 후 Chrome DevTools에서 iPhone 14 Pro 크기로 전환, `http://localhost:3001` 접속:
- 데스크톱 사이드바가 보이지 않고 대신 "필터" 버튼이 그리드 위에 보이는지 확인
- 필터 버튼 클릭 → 하단에서 시트가 올라오는지, 태그 클릭 시 그리드에 반영되는지, 배경 클릭 시 닫히는지 확인
- 태그 1개 이상 선택 후 시트를 닫고 다시 열면 버튼 배지 숫자가 맞는지 확인
- DevTools를 다시 데스크톱 너비로 돌리면 기존처럼 사이드바가 나타나는지 확인 (회귀 없음)

- [ ] **Step 8: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: 모바일에서 필터를 하단 시트로 노출"
```

---

### Task 4: 헤더 검색 토글 + 탭 가로 스크롤

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: `scrollbar-hide` 유틸 클래스 추가**

`app/globals.css` 끝에 추가:

```css

.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 2: `SearchInput` 헬퍼 컴포넌트 추가 (데스크톱/모바일 공용)**

`app/page.tsx`에서 `DDayLabel` 함수 정의 바로 다음, `CompetitionRow` 함수 정의 이전에 추가:

```tsx
function SearchInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="제목, 건축가, 태그 검색..."
        className="w-full pl-9 pr-3 py-1.5 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300"
      />
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: `mobileSearchOpen` state 추가**

Task 3에서 추가한 줄 바로 다음에 이어서 추가:

```ts
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
```

- [ ] **Step 4: 헤더의 인라인 검색창을 데스크톱 전용으로 바꾸고 모바일 아이콘 버튼 추가**

```tsx
          {tab === 'refs' && (
            <div className="flex-1 relative max-w-md">
              <input
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="제목, 건축가, 태그 검색..."
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          )}
```

를 다음으로 교체:

```tsx
          {tab === 'refs' && (
            <div className="hidden md:block flex-1 max-w-md">
              <SearchInput value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} />
            </div>
          )}
          {tab === 'refs' && (
            <button
              onClick={() => setMobileSearchOpen(v => !v)}
              className="md:hidden p-2 text-zinc-400 hover:text-zinc-700 shrink-0"
              aria-label="검색"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
```

- [ ] **Step 5: 헤더 첫 줄과 탭 줄 사이에 모바일 전용 검색 확장 행 추가**

```tsx
        </div>

        {/* 탭 */}
        <div className="max-w-screen-xl mx-auto px-6 flex gap-0 border-t border-zinc-100">
          <button
            onClick={() => setTab('refs')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'refs' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            레퍼런스 {regularRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{regularRefs.length}</span>}
          </button>
          <button
            onClick={() => setTab('competitions')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'competitions' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            공모전 {competitionRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{competitionRefs.length}</span>}
          </button>
        </div>
      </header>
```

를 다음으로 교체:

```tsx
        </div>

        {tab === 'refs' && mobileSearchOpen && (
          <div className="md:hidden px-6 pb-3">
            <SearchInput value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} autoFocus />
          </div>
        )}

        {/* 탭 */}
        <div className="max-w-screen-xl mx-auto px-6 flex gap-0 border-t border-zinc-100 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setTab('refs')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === 'refs' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            레퍼런스 {regularRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{regularRefs.length}</span>}
          </button>
          <button
            onClick={() => setTab('competitions')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === 'competitions' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            공모전 {competitionRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{competitionRefs.length}</span>}
          </button>
        </div>
      </header>
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 수동 확인**

모바일 에뮬레이션에서:
- 헤더에 검색 입력창 대신 돋보기 아이콘만 보이는지 확인
- 아이콘 클릭 → 헤더 아래 검색창이 펼쳐지고, 입력 시 그리드가 필터링되는지 확인
- 데스크톱 너비에서는 기존처럼 인라인 검색창이 그대로 보이는지 확인 (회귀 없음)
- 탭 영역 폭을 좁혀도 텍스트가 줄바꿈되지 않고 가로 스크롤되는지 확인

- [ ] **Step 8: 커밋**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: 모바일 헤더 검색 토글 및 탭 가로 스크롤 지원"
```

---

### Task 5: 업로드 모달 모바일 전체화면 전환

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 업로드 모달 컨테이너를 모바일에서 전체화면으로 전환**

```tsx
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
```

를 다음으로 교체:

```tsx
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center md:overflow-y-auto md:py-8">
          <div className="bg-white w-full h-full overflow-y-auto p-6 md:h-auto md:overflow-visible md:rounded-2xl md:shadow-2xl md:max-w-2xl md:mx-4">
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 확인**

모바일 에뮬레이션에서 "레퍼런스 추가" 버튼 클릭 → 모달이 화면 전체를 채우고 내부 스크롤이 되는지 확인. 이미지 업로드/태그 선택/저장까지 끝까지 진행해서 실제로 레퍼런스가 추가되는지 확인. 데스크톱 너비에서는 기존처럼 중앙 카드형 모달로 보이는지 확인 (회귀 없음).

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: 업로드 모달 모바일 전체화면 전환"
```

---

### Task 6: 폼/상세페이지 고정 2열 그리드를 반응형으로 전환

**Files:**
- Modify: `components/UploadForm.tsx`
- Modify: `components/ScheduleSection.tsx`
- Modify: `app/reference/[id]/page.tsx`

- [ ] **Step 1: `UploadForm.tsx` 제목/설명 필드 그리드**

```tsx
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">제목 *</label>
```

를 다음으로 교체:

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">제목 *</label>
```

- [ ] **Step 2: `UploadForm.tsx` 규모/기타 태그 필드 그리드**

```tsx
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">규모</label>
```

를 다음으로 교체:

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">규모</label>
```

- [ ] **Step 3: `ScheduleSection.tsx` 일정 추가 폼 그리드**

```tsx
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="태스크명"
              value={addForm.taskName}
              onChange={e => setAddForm(f => ({ ...f, taskName: e.target.value }))}
              className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm col-span-2 focus:outline-none focus:border-zinc-400"
            />
```

를 다음으로 교체:

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="태스크명"
              value={addForm.taskName}
              onChange={e => setAddForm(f => ({ ...f, taskName: e.target.value }))}
              className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm col-span-1 sm:col-span-2 focus:outline-none focus:border-zinc-400"
            />
```

- [ ] **Step 4: `app/reference/[id]/page.tsx` 공모전 정보 편집 폼 그리드**

```tsx
                    <div className="grid grid-cols-2 gap-x-4">
                      {[
                        { key: 'announcementDate', label: '공고일', placeholder: '2026-01-01' },
```

를 다음으로 교체:

```tsx
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      {[
                        { key: 'announcementDate', label: '공고일', placeholder: '2026-01-01' },
```

- [ ] **Step 5: `app/reference/[id]/page.tsx` 공모전 정보 표시 그리드 (일정/규모 2열)**

```tsx
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                      <div className="px-4 py-2 border-r border-zinc-100 flex flex-col gap-2">
```

를 다음으로 교체:

```tsx
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
                      <div className="px-4 py-2 border-r-0 sm:border-r border-zinc-100 flex flex-col gap-2">
```

(`border-r`을 모바일에서 제거하는 이유: 1열로 쌓일 때 화면 전체 폭에 걸친 세로줄이 남아 어색해 보이기 때문)

- [ ] **Step 6: `app/reference/[id]/page.tsx` 심사위원 목록 그리드**

```tsx
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {cd.judges.map((j, i) => (
```

를 다음으로 교체:

```tsx
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {cd.judges.map((j, i) => (
```

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 8: 수동 확인**

모바일 에뮬레이션에서:
- 업로드 폼을 열어 모든 입력 필드가 1열로 쌓이고 텍스트/입력창이 잘리지 않는지 확인
- 공모전 상세 페이지에서 일정 편집 폼, 일정/규모 정보 카드, 심사위원 목록이 1열로 쌓이고 좌측 세로줄이 사라졌는지 확인
- 데스크톱 너비에서는 기존처럼 2열로 보이는지 확인 (회귀 없음)

- [ ] **Step 9: 커밋**

```bash
git add components/UploadForm.tsx components/ScheduleSection.tsx "app/reference/[id]/page.tsx"
git commit -m "fix: 업로드/일정/상세페이지 고정 2열 그리드를 모바일 반응형으로 전환"
```

---

### Task 7: PWA 아이콘 생성 + `manifest.json` 추가

**Files:**
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/manifest.json`

**Interfaces:**
- Produces: `public/icon-192.png`, `public/icon-512.png`, `public/manifest.json` — Task 8에서 `app/layout.tsx`의 메타데이터가 이 파일들을 참조.

- [ ] **Step 1: "AR" 이니셜 아이콘 생성 (sharp 사용, 일회성 명령)**

Run:

```bash
cd /Users/songseung-gon/Desktop/arch-reference && node -e "
const sharp = require('sharp');
const svg = (size) => \`<svg width='\${size}' height='\${size}' viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'>
  <rect width='512' height='512' fill='#18181b'/>
  <text x='256' y='330' font-family='Arial, sans-serif' font-size='190' font-weight='700' fill='#ffffff' text-anchor='middle'>AR</text>
</svg>\`;
Promise.all([192, 512].map(size =>
  sharp(Buffer.from(svg(size))).resize(size, size).png().toFile(\`public/icon-\${size}.png\`)
)).then(() => console.log('icons generated')).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `icons generated` 출력, `public/icon-192.png`와 `public/icon-512.png` 파일 생성됨.

- [ ] **Step 2: 생성된 파일 확인**

Run: `ls -la public/icon-192.png public/icon-512.png`
Expected: 두 파일 모두 존재, 크기가 0이 아님.

- [ ] **Step 3: `manifest.json` 작성**

`public/manifest.json` 생성:

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

- [ ] **Step 4: 수동 확인**

`public/icon-192.png`, `public/icon-512.png`를 이미지 뷰어나 브라우저(`file://` 경로 또는 `npm run dev` 후 `http://localhost:3001/icon-192.png`)로 열어 짙은 배경에 흰색 "AR" 글씨가 중앙에 잘 보이는지 육안 확인.

- [ ] **Step 5: 커밋**

```bash
git add public/icon-192.png public/icon-512.png public/manifest.json
git commit -m "feat: PWA 아이콘(AR 이니셜) 및 manifest.json 추가"
```

---

### Task 8: 최소 서비스워커 + 등록 컴포넌트 + `layout.tsx` 메타데이터

**Files:**
- Create: `public/sw.js`
- Create: `components/RegisterSW.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `public/manifest.json`, `public/icon-192.png`(Task 7)
- Produces: `RegisterSW` default export (props 없음) — `app/layout.tsx`에서 렌더링.

- [ ] **Step 1: 캐싱 없는 최소 서비스워커 작성**

`public/sw.js` 생성:

```js
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // 캐싱 없음 — 설치 가능 조건 충족을 위한 최소 핸들러
});
```

- [ ] **Step 2: 서비스워커 등록 컴포넌트 작성**

`components/RegisterSW.tsx` 생성:

```tsx
'use client';

import { useEffect } from 'react';

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 설치 배너가 안 뜰 뿐 앱 사용에는 지장 없음 — 조용히 무시
      });
    }
  }, []);
  return null;
}
```

- [ ] **Step 3: `layout.tsx`에 manifest/icons/themeColor 메타데이터 및 `RegisterSW` 추가**

`app/layout.tsx` 전체를 다음으로 교체:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arch Reference",
  description: "건축사사무소 레퍼런스 검색 & 관리",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 프로덕션 빌드로 확인**

Run: `npm run build`
Expected: 빌드 성공 (에러 없음)

- [ ] **Step 6: 수동 확인**

`npm run dev` 실행 후 Chrome에서 `http://localhost:3001` 접속:
- DevTools → Application 탭 → Manifest에서 이름/아이콘/테마색이 올바르게 인식되는지 확인
- DevTools → Application 탭 → Service Workers에 `sw.js`가 activated 상태로 등록되어 있는지 확인
- (가능하면) 실제 안드로이드 기기/Chrome에서 주소창의 설치 아이콘 또는 자동 설치 배너가 뜨는지 확인

- [ ] **Step 7: 커밋**

```bash
git add public/sw.js components/RegisterSW.tsx app/layout.tsx
git commit -m "feat: PWA 설치 지원 (manifest, 최소 서비스워커, 메타데이터)"
```

---

### Task 9: iOS 홈 화면 추가 안내

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: `IOSInstallHint` 헬퍼 컴포넌트 추가**

`SearchInput` 함수 정의 바로 다음, `CompetitionRow` 함수 정의 이전에 추가:

```tsx
function IOSInstallHint() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setShow(isIOS && !isStandalone);
  }, []);

  if (!show) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(v => !v)}
        className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
      >
        앱 설치
      </button>
      {expanded && (
        <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-zinc-100 p-3 w-56 text-xs text-zinc-600 leading-relaxed">
          Safari 하단 공유 버튼을 누른 뒤 &quot;홈 화면에 추가&quot;를 선택하세요.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 헤더 우측 버튼 영역에 렌더링 추가**

```tsx
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">서울시 공모전</Link>
```

를 다음으로 교체:

```tsx
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <IOSInstallHint />
            <Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">서울시 공모전</Link>
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인**

Chrome DevTools에서 User-Agent를 iPhone으로 설정(Device Toolbar에서 iPhone 프리셋 선택 시 UA도 함께 바뀜)하고 `http://localhost:3001` 접속:
- 헤더에 "앱 설치" 링크가 보이는지 확인
- 클릭 시 안내 텍스트 박스가 펼쳐지는지 확인
- 안드로이드/데스크톱 UA에서는 "앱 설치" 링크가 보이지 않는지 확인

- [ ] **Step 5: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: iOS 홈 화면 추가 안내 UI 추가"
```

---

### Task 10: 전체 모바일 회귀·통합 확인 (최종)

**Files:** 없음 (검증 전용 태스크)

- [ ] **Step 1: 프로덕션 빌드**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 2: 프로덕션 모드로 로컬 실행**

Run: `npm run start` (기본 3000 포트 — 3001을 쓰려면 `PORT=3001 npm run start`)

- [ ] **Step 3: 모바일 에뮬레이션 통합 시나리오 확인**

Chrome DevTools 모바일 에뮬레이션(iPhone SE, iPhone 14 Pro, 삼성 Galaxy 프리셋 각각)으로 아래를 순서대로 확인:

1. 레퍼런스 목록 조회 → 필터 시트 열고 태그/폴더 필터 적용 → 결과 반영 확인
2. 헤더 검색 아이콘으로 검색 → 결과 반영 확인
3. "레퍼런스 추가"로 전체화면 업로드 폼 열기 → 이미지 업로드 + 태그 선택 + 저장까지 완료
4. 공모전 탭 이동(가로 스크롤 없이 탭 전환 확인) → 공모전 상태 변경 → 일정 자동 생성 → Notion 동기화 성공 메시지 확인 (`syncingIds` 가드가 중복 동기화를 막는지도 함께 확인)
5. 레퍼런스 상세 페이지 진입 → 메타데이터/일정/심사위원 그리드가 1열로 깨짐 없이 표시되는지 확인
6. 레퍼런스 삭제 → 연결된 Notion 스케줄 페이지도 정리되는지 확인 (Notion에서 직접 확인)
7. DevTools Application 탭에서 Manifest/Service Worker 정상 등록 확인
8. 데스크톱 너비(≥1280px)로 전환해 1~6 시나리오를 다시 훑어보며 기존 레이아웃과 동일한지 확인 (회귀 없음)

- [ ] **Step 4: 발견된 문제 기록**

문제가 있으면 해당 문제를 고치는 후속 커밋을 만들고 이 Step을 다시 수행. 문제가 없으면 다음 단계로.

- [ ] **Step 5: 최종 커밋 (필요 시)**

Step 3~4에서 수정이 있었다면:

```bash
git add -A
git commit -m "fix: 모바일 통합 QA에서 발견된 이슈 수정"
```

수정이 없었다면 커밋 생략.
