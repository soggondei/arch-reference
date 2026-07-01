import { NextRequest, NextResponse } from 'next/server';

const NOTION_DB_ID = '36f9ff7b-382c-81cd-8c27-f1f6277252a3';
const NOTION_VERSION = '2022-06-28';

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const { title, architect, location, submissionDate, floorArea, sourceUrl } = await req.json() as {
    title: string;
    architect?: string;
    location?: string;
    submissionDate?: string;
    floorArea?: number;
    sourceUrl?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    '프로젝트 코드': { title: [{ text: { content: '' } }] },
    '프로젝트명':    { rich_text: [{ text: { content: title } }] },
    '진행상태':      { select: { name: '수주검토' } },
    '발주유형':      { select: { name: '공모' } },
  };

  if (architect)       properties['발주처 / 클라이언트'] = { rich_text: [{ text: { content: architect } }] };
  if (location)        properties['대지 위치']           = { rich_text: [{ text: { content: location } }] };
  if (floorArea)       properties['연면적 (㎡)']         = { number: floorArea };
  if (sourceUrl)       properties['비고']                = { rich_text: [{ text: { content: sourceUrl } }] };
  if (submissionDate) {
    const m = submissionDate.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) properties['최종 납기일'] = { date: { start: m[1] } };
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DB_ID },
      properties,
    }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.message || '노션 생성 실패' }, { status: 500 });

  return NextResponse.json({ url: data.url });
}
