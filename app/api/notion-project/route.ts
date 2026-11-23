import { NextRequest, NextResponse } from 'next/server';
import { competitionPeriod, getDeadlineDate, notionClosingDate } from '@/lib/competition-dates';

const NOTION_DB_ID = '36f9ff7b-382c-81cd-8c27-f1f6277252a3';
const NOTION_VERSION = '2022-06-28';

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const {
    title,
    architect,
    location,
    submissionDate,
    registrationDate,
    announcementDate,
    resultDate,
    designFee,
    floorArea,
    sourceUrl,
    submissions,
  } = await req.json() as {
    title: string;
    architect?: string;
    location?: string;
    submissionDate?: string;
    registrationDate?: string;
    announcementDate?: string;
    resultDate?: string;
    designFee?: string;
    floorArea?: number;
    sourceUrl?: string;
    submissions?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    '프로젝트 코드': { title: [{ text: { content: title } }] },
    '프로젝트명':    { rich_text: [{ text: { content: title } }] },
    '분류':          { select: { name: '현상설계' } },
    '진행상태':      { select: { name: '수주검토' } },
    '발주유형':      { select: { name: '공모' } },
  };

  if (architect)   properties['발주처 / 클라이언트'] = { rich_text: [{ text: { content: architect } }] };
  if (location)    properties['대지 위치']           = { rich_text: [{ text: { content: location } }] };
  if (floorArea)   properties['연면적 (㎡)']         = { number: floorArea };
  if (sourceUrl)    properties['비고']                 = { rich_text: [{ text: { content: sourceUrl } }] };
  if (submissions)  properties['제출물']               = { rich_text: [{ text: { content: submissions } }] };
  if (designFee)   properties['설계비']              = { rich_text: [{ text: { content: designFee } }] };

  const sub = notionClosingDate(submissionDate);
  if (sub) properties['최종 납기일'] = sub;

  const ann = competitionPeriod(announcementDate)?.firstDate;
  if (ann) properties['공고일'] = { date: { start: ann } };

  const reg = notionClosingDate(registrationDate);
  if (reg) properties['등록마감일'] = reg;

  const res2 = getDeadlineDate(resultDate);
  if (res2) properties['당선발표일'] = { date: { start: res2 } };

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

  return NextResponse.json({ url: data.url, pageId: data.id });
}

// Date-only repairs must not reset the project's Notion status.
export async function PATCH(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const { notionPageId, status, registrationDate } = await req.json() as {
    notionPageId: string; status?: string; registrationDate?: string;
  };

  const STATUS_MAP: Record<string, string> = {
    '등록예정': '수주검토',
    '등록완료': '수주검토',
  };

  const properties: Record<string, unknown> = {};
  if (status) properties['진행상태'] = { select: { name: STATUS_MAP[status] ?? '수주검토' } };
  const reg = notionClosingDate(registrationDate);
  if (reg) properties['등록마감일'] = reg;
  if (!Object.keys(properties).length) return NextResponse.json({ error: '변경할 속성이 없습니다.' }, { status: 400 });

  const res = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({ properties }),
  });

  const data = await res.json();
  // 404(삭제됨) 또는 400(아카이브됨) 모두 새 페이지 생성이 필요한 상태로 처리
  if (!res.ok) return NextResponse.json({
    error: data.message || '업데이트 실패',
    notFound: res.status === 404 || (res.status === 400 && /archived|in the trash/i.test(data.message ?? '')),
  }, { status: res.status });

  return NextResponse.json({ ok: true });
}
