# Custom GPT Action용 레퍼런스 조회 API — 설계

## 배경

사용자가 저장 중인 건축 레퍼런스 목록을 ChatGPT(Custom GPT)가 실시간으로 검색·참고할 수 있게 하고 싶다. arch-reference는 이미 공개 URL로 배포돼 있지만, ChatGPT가 안정적으로 데이터를 읽으려면 구조화된 API + OpenAPI 스펙이 필요하다 (Custom GPT의 "Actions" 기능은 OpenAPI 스펙을 기반으로 동작한다).

## 목표

1. GPT가 태그·키워드로 레퍼런스를 검색할 수 있는 읽기 전용 API를 제공한다.
2. GPT Action 설정 화면에서 바로 가져다 쓸 수 있는 OpenAPI 스펙을 함께 제공한다.
3. API 키 하나로 접근을 제한한다 (완전 공개 아님).

## API 엔드포인트

### `GET /api/gpt/refs`

**인증**: `Authorization: Bearer <GPT_API_KEY>` 헤더 필수. 키가 없거나 틀리면 401.

**쿼리 파라미터** (전부 선택):
| 파라미터 | 설명 |
|---|---|
| `q` | `title`/`architect`/`description`에 대한 대소문자 무시 부분일치 검색 |
| `program`, `material`, `mass`, `scale`, `designItem`, `site`, `region` | 기존 태그 체계(`lib/tags.ts`) 그대로. 콤마로 여러 값 전달 시 해당 카테고리 내에서는 OR, 서로 다른 카테고리 파라미터끼리는 AND |
| `refType` | `built`/`winner`/`entry`/`idea` 중 하나 |
| `limit` | 기본 20, 최대 50으로 clamp |

**응답** (`200 OK`):
```json
{
  "count": 3,
  "refs": [
    {
      "title": "...",
      "imageUrl": "...",
      "sourceUrl": "...",
      "refType": "built",
      "architect": "...",
      "year": 2024,
      "description": "...",
      "tags": { "program": [...], "material": [...], "mass": [...], "scale": "...", "designItem": [...], "site": [...], "region": "..." },
      "createdAt": "..."
    }
  ]
}
```

`id`/`collectionIds`/`competitionData` 등 내부 상태 필드는 응답에서 제외한다 — GPT가 참고할 필요 없는 내부 데이터를 노출하지 않는다.

**정렬**: `created_at` 내림차순 (최신순).

**구현**: `app/api/refs-by-tag/route.ts`와 동일하게 Supabase에 직접 `createClient`로 접근하는 패턴을 따른다 (별도 `lib/store.ts` 경유 없이, 서버 사이드 라우트에서 바로 조회).

### `GET /api/gpt/openapi.json`

Custom GPT의 "Actions" 설정 화면에서 "Import from URL"에 넣을 수 있는 정적 OpenAPI 3.1 스펙을 반환한다. `servers`에 프로덕션 URL(`https://arch-reference.vercel.app`)을 명시하고, `securitySchemes`에 `Authorization: Bearer` 방식을 기술한다. 이 엔드포인트 자체는 인증 없이 공개(스펙 문서 자체는 민감정보 아님 — 실제 데이터 접근에는 여전히 API 키가 필요함).

## 인증 키 관리

- 새 환경변수 `GPT_API_KEY` (Vercel 프로덕션 환경변수로 등록, 랜덤 문자열 하나 생성).
- `.env.local`에도 로컬 개발용으로 추가.
- API 라우트에서 `request.headers.get('authorization')`이 `Bearer ${process.env.GPT_API_KEY}`와 정확히 일치하는지 확인.

## 범위 밖

- 쓰기(레퍼런스 추가/수정/삭제) 기능 없음 — 완전 읽기 전용.
- 입찰정보·공모전 데이터는 이번 범위에 포함하지 않는다 (레퍼런스만).
- 이미지 바이너리를 직접 전달하지 않는다 — `imageUrl` 링크만 제공.
- 페이지네이션(다음 페이지 조회)은 만들지 않는다 — `limit` 상한(50) 안에서만 동작.

## 테스트 / 검증 방침

자동화 테스트 없음. 검증은:
1. `npx tsc --noEmit` / `npm run build`
2. `curl`로 API 키 없이 호출 → 401 확인, 올바른 키로 호출 → 결과 확인
3. 태그/키워드 필터 조합이 실제 데이터에서 기대한 대로 좁혀지는지 확인
4. `/api/gpt/openapi.json` 응답이 유효한 JSON이고 OpenAPI 3.1 스펙 형식인지 확인 (스펙 검증 도구 또는 수동 확인)
5. 가능하면 실제로 ChatGPT에서 Custom GPT를 만들어 이 스펙을 Import하고 질문 몇 개를 던져 실제로 동작하는지 확인 (이 마지막 단계는 사용자가 직접 ChatGPT 계정에서 수행)
