import { NextRequest, NextResponse } from 'next/server';
import type { ScheduleCategory, ScheduleStatus } from '@/lib/types';
import { notionClosingDate, notionDate } from '@/lib/competition-dates';

const SCHEDULE_DB_ID = '3929ff7b-382c-8158-bd6d-f88c86625ac3';
const NOTION_VERSION = '2022-06-28';

const CATEGORY_MAP: Record<ScheduleCategory, string> = {
  external: '외부일정',
  design: '설계작업',
  admin: '행정',
};

const STATUS_MAP: Record<ScheduleStatus, string> = {
  planned: '예정',
  'in-progress': '진행중',
  done: '완료',
  cancelled: '취소',
};

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

function buildProperties(
  taskName: string,
  projectName: string,
  category: ScheduleCategory,
  status: ScheduleStatus,
  endDate: string,
  startDate?: string,
  endTime?: string,
) {
  return {
    '태스크명': { title: [{ text: { content: taskName } }] },
    '프로젝트명': { rich_text: [{ text: { content: projectName } }] },
    '날짜': {
      date: startDate
        ? { start: notionDate(startDate, endTime ? '00:00' : undefined), end: notionDate(endDate, endTime) }
        : { start: notionDate(endDate, endTime) },
    },
    '상태': { select: { name: STATUS_MAP[status] } },
    '카테고리': { select: { name: CATEGORY_MAP[category] } },
    '색상분류': { select: { name: CATEGORY_MAP[category] } },
  };
}

// POST: 새 스케줄 항목 생성
export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const { taskName, projectName, category, status, endDate, startDate, endTime } = await req.json() as {
    taskName: string;
    projectName: string;
    category: ScheduleCategory;
    status: ScheduleStatus;
    endDate: string;
    startDate?: string;
    endTime?: string;
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { database_id: SCHEDULE_DB_ID },
      properties: buildProperties(taskName, projectName, category, status, endDate, startDate, endTime),
    }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.message || '생성 실패' }, { status: 500 });

  return NextResponse.json({ pageId: data.id });
}

// PATCH: 기존 항목 업데이트
export async function PATCH(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const { notionPageId, taskName, projectName, category, status, endDate, startDate, endTime, registrationDate } = await req.json() as {
    notionPageId: string;
    registrationDate?: string;
    taskName: string;
    projectName: string;
    category: ScheduleCategory;
    status: ScheduleStatus;
    endDate: string;
    startDate?: string;
    endTime?: string;
  };

  const closing = notionClosingDate(registrationDate);
  if (registrationDate !== undefined && !closing) {
    return NextResponse.json({ error: '등록 마감일을 확인해 주세요.' }, { status: 400 });
  }
  const res = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({
      properties: closing ? { '날짜': closing } : buildProperties(taskName, projectName, category, status, endDate, startDate, endTime),
    }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({
    error: data.message || '업데이트 실패',
    notFound: res.status === 404 || (res.status === 400 && /archived|in the trash/i.test(data.message ?? '')),
  }, { status: res.status });
  if (data.in_trash || data.archived) return NextResponse.json({ error: 'page_trashed', notFound: true }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// DELETE: 항목 아카이브
export async function DELETE(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN 미설정' }, { status: 500 });

  const { notionPageId } = await req.json() as { notionPageId: string };

  const res = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({ archived: true }),
  });

  if (!res.ok) return NextResponse.json({ error: '삭제 실패' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
