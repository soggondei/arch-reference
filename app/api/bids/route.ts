import { NextResponse } from 'next/server';

const BID_DB_ID = '3819ff7b-382c-81c1-85d9-d638e49e9a94';
const NOTION_VERSION = '2022-06-28';

function str(prop: Record<string, unknown> | undefined, key: string): string {
  if (!prop) return '';
  const arr = prop[key] as Array<{ text?: { content?: string } }> | undefined;
  return arr?.[0]?.text?.content ?? '';
}

function num(prop: Record<string, unknown> | undefined, key: string): number | null {
  if (!prop) return null;
  return (prop[key] as number | null) ?? null;
}

function sel(prop: Record<string, unknown> | undefined, key: string): string {
  if (!prop) return '';
  return ((prop[key] as { name?: string } | null)?.name) ?? '';
}

function date(prop: Record<string, unknown> | undefined, key: string): string {
  if (!prop) return '';
  return ((prop[key] as { start?: string } | null)?.start) ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPage(p: any) {
  const props = p.properties as Record<string, Record<string, unknown>>;
  const titleArr = props['공고명']?.title as Array<{ text?: { content?: string } }> | undefined;
  return {
    id: p.id as string,
    공고명: titleArr?.[0]?.text?.content ?? '',
    공고기관: str(props['공고기관'], 'rich_text'),
    공고번호: str(props['공고번호'], 'rich_text'),
    지역: sel(props['지역'], 'select'),
    상태: sel(props['상태'], 'select'),
    입찰방법: sel(props['입찰방법'], 'select'),
    예가방법: sel(props['예가방법'], 'select'),
    배정예산: num(props['배정예산'], 'number'),
    추천입찰가: num(props['추천입찰가'], 'number'),
    낙찰하한가: num(props['낙찰하한가'], 'number'),
    적용낙찰률: str(props['적용낙찰률'], 'rich_text'),
    실제낙찰금액: num(props['실제낙찰금액'], 'number'),
    실제낙찰률: num(props['실제낙찰률'], 'number'),
    낙찰업체: str(props['낙찰업체'], 'rich_text'),
    공고일: date(props['공고일'], 'date'),
    마감일: date(props['마감일'], 'date'),
    개찰일: date(props['개찰일'], 'date'),
    공고URL: (props['공고URL']?.url as string) ?? '',
  };
}

export async function GET() {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const allPages = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ property: '공고일', direction: 'descending' }],
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${BID_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { results: unknown[]; has_more: boolean; next_cursor?: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allPages.push(...data.results.map((p: any) => mapPage(p)));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return NextResponse.json(allPages);
}
