import { NextRequest, NextResponse } from 'next/server';
import type { WorkLog } from '@/lib/types';
import { database } from '../_personal';

function projectLog(row: Partial<WorkLog>): WorkLog {
  const { id, taskId, taskName, date, minutes, author, body } = row;
  if (typeof id !== 'string' || !id.startsWith('personal:') || typeof taskId !== 'string' ||
      typeof taskName !== 'string' || typeof date !== 'string' || typeof minutes !== 'number' ||
      !Number.isInteger(minutes) || minutes < 1 || minutes > 1440 ||
      typeof author !== 'string' || typeof body !== 'string') throw new Error('Invalid project log');
  return { id, taskId, taskName, date, minutes, author, body };
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const headers = { 'Cache-Control': 'no-store' };
  if (!projectId?.trim() || projectId.length > 300) {
    return NextResponse.json({ error: '프로젝트를 확인해 주세요.' }, { status: 400, headers });
  }
  try {
    const { data, error } = await database().rpc('lv_project_shared_logs', { p_project_id: projectId });
    if (!error && Array.isArray(data)) return NextResponse.json({ logs: data.map(projectLog) }, { headers });
  } catch { /* Return the same failure for unavailable database or configuration. */ }
  return NextResponse.json({ error: '프로젝트에 공유한 시간을 불러오지 못했습니다.' }, { status: 503, headers });
}
