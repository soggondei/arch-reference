# 모바일 헤더 더보기 메뉴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `arch-reference` 헤더의 서울시 공모전/스코어러/북마클릿 링크와 iOS 설치 안내를, 모바일(768px 미만)에서 케밥(⋮) 아이콘 드롭다운 메뉴로 접근 가능하게 만든다.

**Architecture:** 새 헬퍼 컴포넌트 `MobileMoreMenu`를 `app/page.tsx`에 추가해 기존 `IOSInstallHint`를 흡수·대체한다. 드롭다운 열림/닫힘 및 바깥-클릭-닫기는 `components/ReferenceCard.tsx`의 폴더 선택 드롭다운과 동일한 `useRef` + `document.mousedown` 패턴을 그대로 따른다. 기존 데스크톱 인라인 링크 3개는 브레이크포인트를 `sm`(640px)에서 `md`(768px)로 통일해 새 메뉴(`md:hidden`)와 정확히 상호 배타적으로 전환되게 한다.

**Tech Stack:** Next.js 16.2.7 (App Router), React 19, TypeScript, Tailwind CSS v4. 새 의존성 없음 — 순수 React state + DOM 이벤트.

## Global Constraints

- 새 런타임 의존성을 추가하지 않는다.
- 데스크톱(≥768px) 노출 방식(인라인 링크 3개, 각각 `text-xs text-zinc-400 hover:text-zinc-700 transition-colors`)은 시각적으로 기존과 동일하게 유지한다 — 브레이크포인트 값만 바뀐다.
- 아이패드 가로모드 등 768px 이상 iOS 화면에서 설치 안내가 사라지는 것은 의도된 트레이드오프다 (스펙에서 범위 밖으로 확정됨) — 별도 처리 불필요.
- 이 프로젝트에는 자동화된 테스트가 없다. 검증은 `npx tsc --noEmit` + `npm run build` + 수동 브라우저 확인으로 한다.
- 참고 스펙: `docs/superpowers/specs/2026-07-09-mobile-more-menu-design.md`

---

## File Structure Overview

- `app/page.tsx` — 수정: `IOSInstallHint` 함수를 `MobileMoreMenu` 함수로 교체, 헤더 렌더 지점 교체, 기존 링크 3개 브레이크포인트 변경

---

### Task 1: `MobileMoreMenu` 컴포넌트로 `IOSInstallHint` 대체 + 링크 브레이크포인트 통일

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: `IOSInstallHint` 함수를 `MobileMoreMenu` 함수로 교체**

`app/page.tsx`에서 다음 블록을 찾는다:

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

전체를 다음으로 교체:

```tsx
function MobileMoreMenu() {
  const [open, setOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsIOS(ios && !isStandalone);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative md:hidden" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="p-2 text-zinc-400 hover:text-zinc-700"
        aria-label="더보기"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[160px]">
          <Link href="/seoul-import" className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setOpen(false)}>서울시 공모전</Link>
          <Link href="/scorer-import" className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setOpen(false)}>스코어러</Link>
          <Link href="/bookmarklet" className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setOpen(false)}>북마클릿</Link>
          {isIOS && (
            <div className="border-t border-zinc-100 mt-1 pt-2 px-3 pb-2 text-xs text-zinc-500 leading-relaxed">
              Safari 하단 공유 버튼을 누른 뒤 &quot;홈 화면에 추가&quot;를 선택하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

`useRef`와 `Link`는 파일 상단에 이미 import돼 있으므로 (`import { useState, useEffect, useCallback, useRef, Suspense } from 'react';`, `import Link from 'next/link';`) 새 import는 필요 없다.

- [ ] **Step 2: 헤더 렌더 지점 교체**

```tsx
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <IOSInstallHint />
            <Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">서울시 공모전</Link>
            <Link href="/scorer-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">스코어러</Link>
            <Link href="/bookmarklet" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">북마클릿</Link>
```

를 다음으로 교체 (렌더 지점을 `MobileMoreMenu`로 바꾸고, 세 링크의 브레이크포인트를 `sm`→`md`로 통일):

```tsx
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <MobileMoreMenu />
            <Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden md:block">서울시 공모전</Link>
            <Link href="/scorer-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden md:block">스코어러</Link>
            <Link href="/bookmarklet" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden md:block">북마클릿</Link>
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 프로덕션 빌드**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 수동 확인**

`npm run dev` 실행 후 (`.env.local`이 이미 있는 워크트리라면 그대로, 아니라면 메인 체크아웃의 `.env.local`을 복사) `http://localhost:3001` 접속해서 Chrome DevTools로 확인:

1. **모바일(<768px)**: 헤더에 케밥(⋮) 버튼이 보이고, 데스크톱 링크 3개는 안 보이는지 확인
2. 케밥 버튼 클릭 → 드롭다운에 "서울시 공모전"/"스코어러"/"북마클릿" 3개 항목이 보이는지 확인
3. 각 링크 클릭 시 해당 페이지(`/seoul-import`, `/scorer-import`, `/bookmarklet`)로 정상 이동하는지 확인
4. 드롭다운이 열린 상태에서 메뉴 바깥을 클릭하면 자동으로 닫히는지 확인
5. **640~768px 사이 폭**(예: 700px)으로 맞춰서: 케밥 메뉴만 보이고 데스크톱 인라인 링크는 보이지 않는지 확인 (두 UI가 동시에 안 보이는지가 이번 수정의 핵심)
6. **데스크톱(≥768px)**: 케밥 버튼이 사라지고 기존처럼 인라인 링크 3개가 그대로 보이는지 확인 — 회귀 없음
7. **iOS UA 스푸핑** (Chrome DevTools 기기 툴바에서 iPhone 프리셋 선택): 케밥 메뉴를 열었을 때 링크 3개 아래 구분선과 함께 "Safari 하단 공유 버튼을 누른 뒤 홈 화면에 추가를 선택하세요" 안내 문구가 보이는지 확인
8. **일반 UA(데스크톱/Android)**: 케밥 메뉴를 열었을 때 안내 문구가 보이지 않는지 확인 (링크 3개만)

- [ ] **Step 6: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: 서울시공모전/스코어러/북마클릿+iOS설치안내를 모바일 더보기 메뉴로 통합"
```
