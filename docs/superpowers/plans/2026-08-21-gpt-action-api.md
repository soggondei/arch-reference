# Custom GPT Action용 레퍼런스 조회 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom GPT가 API 키로 인증해서 저장된 건축 레퍼런스를 태그/키워드로 검색할 수 있는 읽기 전용 API와, GPT Action 설정에 바로 쓸 수 있는 OpenAPI 스펙 엔드포인트를 추가한다.

**Architecture:** 기존 `app/api/refs-by-tag/route.ts`와 동일한 패턴(Supabase 직접 조회, `lib/store.ts` 경유 안 함)으로 새 라우트 두 개를 추가한다. 인증은 `Authorization: Bearer <GPT_API_KEY>` 헤더 비교로 처리한다.

**Tech Stack:** Next.js Route Handler + `@supabase/supabase-js`, 기존 프로젝트 패턴 재사용.

## Global Constraints

- 읽기 전용 — 레퍼런스 추가/수정/삭제 기능 없음.
- `GET /api/gpt/refs`는 `Authorization: Bearer <GPT_API_KEY>` 헤더가 정확히 일치해야만 200을 반환, 아니면 401.
- `GET /api/gpt/openapi.json`은 인증 없이 공개 — 스펙 문서 자체는 민감정보 아님.
- 응답 필드는 `title`/`imageUrl`/`sourceUrl`/`refType`/`architect`/`year`/`description`/`tags`/`createdAt`만 포함 — `id`/`collectionIds`/`competitionData` 등 내부 필드는 제외.
- `tags.scale`과 `tags.region`은 단일 문자열, 나머지(`program`/`material`/`mass`/`designItem`/`site`)는 문자열 배열 — 필터링 로직에서 이 차이를 정확히 반영해야 한다.
- `limit`은 기본 20, 최대 50으로 clamp.
- 이 프로젝트는 자동화 테스트가 없다 — 검증은 `npx tsc --noEmit` + `npm run build` + `curl` 수동 확인.

---

### Task 0: `GPT_API_KEY` 생성 + Vercel 환경변수 등록 (컨트롤러가 직접 수행, 서브에이전트 아님)

이 태스크는 코드 작성이 아니라 시크릿 발급/등록이라 실행 세션(컨트롤러)이 직접 처리한다 — Supabase 테이블 생성을 컨트롤러가 직접 처리했던 것과 동일한 이유.

- [ ] **Step 1: 랜덤 키 생성**

```bash
openssl rand -hex 24
```

- [ ] **Step 2: `.env.local`에 추가**

`/Users/songseung-gon/Desktop/arch-reference/.env.local`에 `GPT_API_KEY=<생성된 값>` 한 줄 추가 (기존 변수들과 같은 형식).

- [ ] **Step 3: Vercel 프로덕션 환경변수 등록**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
echo -n "<생성된 값>" | npx vercel env add GPT_API_KEY production
```

등록 후 `npx vercel env ls`로 `GPT_API_KEY`가 production에 있는지 확인.

- [ ] **Step 4: 값을 어딘가 기록**

이 키는 나중에 Custom GPT Action 설정 화면에 붙여넣어야 하므로, 사용자에게 값을 전달하거나(채팅에 값 노출은 이 경우 목적상 필요 — 사용자 본인이 자기 GPT 설정에 입력해야 함) 안전하게 접근 가능한 곳에 기록해둔다.

---

### Task 1: `GET /api/gpt/refs` 라우트

**Files:**
- Create: `app/api/gpt/refs/route.ts`

**Interfaces:**
- Consumes: Supabase `refs` 테이블(기존 스키마, `lib/store.ts`의 `toRef` 매퍼가 쓰는 것과 동일한 컬럼: `title`, `image_url`, `source_url`, `ref_type`, `architect`, `year`, `description`, `tags`, `created_at`)
- Produces: 없음 (외부 HTTP 엔드포인트, 코드 레벨 소비자 없음)

- [ ] **Step 1: 라우트 파일 작성**

`app/api/gpt/refs/route.ts` 새로 작성:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TAG_ARRAY_CATEGORIES = ['program', 'material', 'mass', 'designItem', 'site'] as const;
const TAG_STRING_CATEGORIES = ['scale', 'region'] as const;

type TagValue = string | string[];

interface RefRow {
  title: string;
  image_url: string | null;
  source_url: string | null;
  ref_type: string | null;
  architect: string | null;
  year: number | null;
  description: string | null;
  tags: Record<string, TagValue> | null;
  created_at: string;
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.GPT_API_KEY || auth !== `Bearer ${process.env.GPT_API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().toLowerCase() ?? '';
  const refType = searchParams.get('refType');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 50);

  const tagFilters: Record<string, string[]> = {};
  for (const cat of [...TAG_ARRAY_CATEGORIES, ...TAG_STRING_CATEGORIES]) {
    const v = searchParams.get(cat);
    if (v) tagFilters[cat] = v.split(',').map(s => s.trim()).filter(Boolean);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let query = supabase
    .from('refs')
    .select('title, image_url, source_url, ref_type, architect, year, description, tags, created_at')
    .order('created_at', { ascending: false });

  if (refType) query = query.eq('ref_type', refType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as RefRow[];

  if (q) {
    rows = rows.filter(r =>
      (r.title ?? '').toLowerCase().includes(q) ||
      (r.architect ?? '').toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    );
  }

  for (const [cat, values] of Object.entries(tagFilters)) {
    rows = rows.filter(r => {
      const tagValue = r.tags?.[cat];
      if ((TAG_STRING_CATEGORIES as readonly string[]).includes(cat)) {
        return typeof tagValue === 'string' && values.includes(tagValue);
      }
      const arr = Array.isArray(tagValue) ? tagValue : [];
      return values.some(v => arr.includes(v));
    });
  }

  rows = rows.slice(0, limit);

  const refs = rows.map(r => ({
    title: r.title,
    imageUrl: r.image_url,
    sourceUrl: r.source_url,
    refType: r.ref_type,
    architect: r.architect,
    year: r.year,
    description: r.description,
    tags: r.tags,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ count: refs.length, refs });
}
```

- [ ] **Step 2: 타입체크**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 로컬 서버로 curl 수동 확인**

```bash
cd /Users/songseung-gon/Desktop/arch-reference && npm run dev
```

다른 터미널에서 (포트는 콘솔에 뜨는 것 사용, 보통 3001):

```bash
# 키 없이 → 401 확인
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/gpt/refs

# 올바른 키로 → 200 + 결과 확인 (Task 0에서 만든 키 사용)
curl -s -H "Authorization: Bearer <GPT_API_KEY 값>" "http://localhost:3001/api/gpt/refs?limit=3" | head -c 2000

# 키워드 검색
curl -s -H "Authorization: Bearer <GPT_API_KEY 값>" "http://localhost:3001/api/gpt/refs?q=미술관&limit=5"

# 태그 필터
curl -s -H "Authorization: Bearer <GPT_API_KEY 값>" "http://localhost:3001/api/gpt/refs?program=주거&limit=5"
```

각 응답이 기대한 대로 나오는지(401/200, 필터가 실제로 좁혀지는지) 확인.

- [ ] **Step 4: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add app/api/gpt/refs/route.ts
git commit -m "$(cat <<'EOF'
Add GET /api/gpt/refs — API-key-authenticated reference search

Read-only endpoint for a Custom GPT Action: keyword search across
title/architect/description plus tag-category filtering, matching
the existing refs-by-tag route's direct-Supabase-query pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `GET /api/gpt/openapi.json` 라우트

**Files:**
- Create: `app/api/gpt/openapi.json/route.ts`

**Interfaces:**
- Consumes: 없음 (정적 스펙 반환)
- Produces: 없음 (외부 HTTP 엔드포인트 — ChatGPT의 Custom GPT Action 설정 화면이 이 URL을 "Import from URL"로 가져감)

- [ ] **Step 1: 라우트 파일 작성**

`app/api/gpt/openapi.json/route.ts` 새로 작성:

```ts
import { NextResponse } from 'next/server';

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Arch Reference Search API',
    description: '건축사사무소 레퍼런스 라이브러리 검색 API (읽기 전용)',
    version: '1.0.0',
  },
  servers: [{ url: 'https://arch-reference.vercel.app' }],
  paths: {
    '/api/gpt/refs': {
      get: {
        operationId: 'searchReferences',
        summary: '저장된 건축 레퍼런스를 태그·키워드로 검색',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: '제목/건축가/설명 키워드 검색' },
          { name: 'program', in: 'query', schema: { type: 'string' }, description: '용도 태그, 콤마로 여러 값 (OR)' },
          { name: 'material', in: 'query', schema: { type: 'string' }, description: '재료 태그, 콤마로 여러 값 (OR)' },
          { name: 'mass', in: 'query', schema: { type: 'string' }, description: '매스/형태 태그, 콤마로 여러 값 (OR)' },
          { name: 'scale', in: 'query', schema: { type: 'string' }, description: '규모 태그 (단일 값)' },
          { name: 'designItem', in: 'query', schema: { type: 'string' }, description: '설계아이템 태그, 콤마로 여러 값 (OR)' },
          { name: 'site', in: 'query', schema: { type: 'string' }, description: '대지조건 태그, 콤마로 여러 값 (OR)' },
          { name: 'region', in: 'query', schema: { type: 'string' }, description: '지역 태그 (단일 값)' },
          { name: 'refType', in: 'query', schema: { type: 'string', enum: ['built', 'winner', 'entry', 'idea'] }, description: '실현작/당선작/공모참가/아이디어' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
        ],
        responses: {
          '200': {
            description: '검색 결과',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer' },
                    refs: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          imageUrl: { type: 'string', nullable: true },
                          sourceUrl: { type: 'string', nullable: true },
                          refType: { type: 'string', nullable: true },
                          architect: { type: 'string', nullable: true },
                          year: { type: 'integer', nullable: true },
                          description: { type: 'string', nullable: true },
                          tags: { type: 'object' },
                          createdAt: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'API 키 누락 또는 불일치' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec);
}
```

- [ ] **Step 2: 타입체크 + 빌드**

Run: `cd /Users/songseung-gon/Desktop/arch-reference && npx tsc --noEmit && npm run build`
Expected: 에러 없이 통과

- [ ] **Step 3: 수동 확인**

```bash
curl -s http://localhost:3001/api/gpt/openapi.json | python3 -m json.tool | head -30
```

유효한 JSON으로 파싱되는지, `paths`/`servers`/`components.securitySchemes`가 다 들어있는지 확인.

- [ ] **Step 4: 커밋**

```bash
cd /Users/songseung-gon/Desktop/arch-reference
git add app/api/gpt/openapi.json/route.ts
git commit -m "$(cat <<'EOF'
Add GET /api/gpt/openapi.json — spec for Custom GPT Action import

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan Self-Review Notes

- **Spec coverage:** 검색 API(Task 1), 인증(Task 1 Step 1의 401 체크), OpenAPI 스펙(Task 2), 키 발급/등록(Task 0) 모두 대응. "범위 밖" 항목(쓰기 기능, 페이지네이션, 이미지 바이너리 전달)은 어떤 태스크에도 포함하지 않음.
- **tags 필드 타입 불일치 방지:** `TAG_STRING_CATEGORIES`(`scale`/`region`)와 `TAG_ARRAY_CATEGORIES`(나머지)를 명시적으로 분리해서, 배열 태그에 단일값 비교 로직을 잘못 적용하는(혹은 반대) 실수를 코드 구조로 방지했다.
- **Task 0은 컨트롤러가 직접 수행:** 이전 세션(Supabase 테이블 생성)과 동일한 판단 — 시크릿 발급/등록은 서브에이전트에게 위임하기보다 컨트롤러가 직접 처리하는 게 안전하고, Task 1의 curl 검증이 Task 0에서 만든 실제 키를 필요로 하므로 순서상으로도 먼저 끝나 있어야 한다.
