import { NextRequest, NextResponse } from 'next/server';
import { database, deviceKey, isUuid, json, readPersonalPost, unavailable, unpaired } from '../_personal';

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

export async function GET(request: NextRequest) {
  const key = deviceKey(request);
  if (!key) return unpaired();
  const day = request.nextUrl.searchParams.get('day');
  const targets = request.nextUrl.searchParams.get('targets');
  const sources = request.nextUrl.searchParams.get('sources');
  if (targets !== null ? targets !== '1' || day !== null || sources !== null
    : !isDay(day) || (sources !== null && sources !== '1')) {
    return json({ error: '조회할 날짜 또는 업무 목록을 확인해 주세요.' }, 400);
  }
  try {
    const db = database();
    const { data, error } = targets === '1'
      ? await db.rpc('lv_personal_work_targets', { p_device_key: key })
      : await db.rpc(sources === '1' ? 'lv_personal_work_sources' : 'lv_personal_work_journal', { p_device_key: key, p_day: day });
    if (error?.code === '42501') return unpaired();
    if (error) return unavailable();
    if (targets === '1') return Array.isArray(data) ? json({ targets: data }, 200, key) : unavailable();
    if (sources === '1') return Array.isArray(data) ? json({ sources: data }, 200, key) : unavailable();
    if (!data || !Array.isArray(data.entries) || !Array.isArray(data.totals) ||
        !Number.isSafeInteger(data.attendance_seconds) || data.attendance_seconds < 0 || typeof data.open !== 'boolean') {
      return unavailable();
    }
    const { entries, totals, attendance_seconds, open } = data;
    return json({ entries, totals, attendance_seconds, open }, 200, key);
  } catch {
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  const body = await readPersonalPost(request);
  if (body instanceof NextResponse) return body;
  const key = deviceKey(request);
  if (!key) return unpaired();

  const { action, id, version } = body;
  try {
    const db = database();
    let result;
    if (action === 'claim') {
      const { projectId, logId, revision } = body;
      if (typeof projectId !== 'string' || !projectId || projectId.length > 300 ||
          typeof logId !== 'string' || !logId || logId.length > 300 ||
          typeof revision !== 'string' || !/^[a-f0-9]{32}$/.test(revision)) {
        return json({ error: '연결할 원본 일지를 선택해 주세요.' }, 400);
      }
      result = await db.rpc('lv_personal_claim_work', { p_device_key: key, p_project_id: projectId, p_log_id: logId, p_revision: revision });
    } else if (!isUuid(id)) {
      return json({ error: '업무 기록을 확인해 주세요.' }, 400);
    } else if (action === 'unclaim') {
      result = await db.rpc('lv_personal_unclaim_work', { p_device_key: key, p_id: id });
    } else if (action === 'delete') {
      if (!isVersion(version)) return json({ error: '삭제할 기록을 다시 확인해 주세요.' }, 400);
      result = await db.rpc('lv_personal_delete_work', { p_device_key: key, p_id: id, p_version: version });
    } else if (action === 'save') {
      const { day, projectId = null, taskId = null, taskName, minutes, note = '' } = body;
      const manual = projectId === null && taskId === null;
      const linked = typeof projectId === 'string' && projectId.trim() !== '' && typeof taskId === 'string' && taskId.trim() !== '';
      const name = typeof taskName === 'string' ? taskName.trim().replace(/\s+/g, ' ') : null;
      if (!isDay(day) || (!manual && !linked) || (version !== null && !isVersion(version)) ||
          typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440 ||
          name === null || (manual && (!name || [...name].length > 300)) ||
          typeof note !== 'string' || [...note.trim()].length > 4000) {
        return json({ error: '날짜, 업무명, 투입시간과 메모를 확인해 주세요.' }, 400);
      }
      const publishChange = Object.hasOwn(body, 'projectNote');
      if (publishChange && body.projectNote !== null &&
          (!linked || typeof body.projectNote !== 'string' || [...body.projectNote.trim()].length > 4000)) {
        return json({ error: '프로젝트에 공유할 작업 내용을 확인해 주세요.' }, 400);
      }
      result = await db.rpc(publishChange ? 'lv_personal_save_shared_work' : 'lv_personal_save_work', {
        p_device_key: key, p_id: id, p_day: day, p_project_id: projectId, p_task_id: taskId,
        p_task_name: name, p_minutes: minutes, p_note: note.trim(), p_version: version,
        ...(publishChange ? { p_project_note: typeof body.projectNote === 'string' ? body.projectNote.trim() : null } : {}),
      });
    } else {
      return json({ error: '업무 기록 요청을 확인해 주세요.' }, 400);
    }
    const { error } = result;
    if (error?.code === '42501') return unpaired();
    if (error?.code === '40001' || error?.code === '23505') {
      return json({ error: '다른 기기에서 기록이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.' }, 409);
    }
    if (error?.code === '22023') return json({ error: '입력한 내용과 선택한 업무를 다시 확인해 주세요.' }, 400);
    if (error) return unavailable();
    return json({ ok: true }, 200, key);
  } catch {
    return unavailable();
  }
}
