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
  if (targets !== null ? targets !== '1' || day !== null : !isDay(day)) {
    return json({ error: '조회할 날짜 또는 업무 목록을 확인해 주세요.' }, 400);
  }
  try {
    const db = database();
    const { data, error } = targets === '1'
      ? await db.rpc('lv_personal_work_targets', { p_device_key: key })
      : await db.rpc('lv_personal_work', { p_device_key: key, p_day: day });
    if (error?.code === '42501') return unpaired();
    if (error) return unavailable();
    if (targets === '1') return Array.isArray(data) ? json({ targets: data }, 200, key) : unavailable();
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
  if (!isUuid(id) || (action !== 'save' && action !== 'delete')) {
    return json({ error: '업무 기록 요청을 확인해 주세요.' }, 400);
  }
  try {
    const db = database();
    let result;
    if (action === 'delete') {
      if (!isVersion(version)) return json({ error: '삭제할 기록을 다시 확인해 주세요.' }, 400);
      result = await db.rpc('lv_personal_delete_work', { p_device_key: key, p_id: id, p_version: version });
    } else {
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
      result = await db.rpc('lv_personal_save_work', {
        p_device_key: key, p_id: id, p_day: day, p_project_id: projectId, p_task_id: taskId,
        p_task_name: name, p_minutes: minutes, p_note: note.trim(), p_version: version,
      });
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
