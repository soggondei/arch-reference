import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { database, deviceKey, deviceKeyFormat, isUuid, json, readPersonalPost, unavailable, unpaired } from '../_personal';

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month');
  if (month !== null && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
    return json({ error: '조회할 월을 확인해 주세요.' }, 400);
  }
  const key = deviceKey(request);
  if (!key) return json({ connected: false });

  try {
    const { data, error } = await database().rpc('lv_personal_attendance', {
      p_device_key: key, p_month: month ? month + '-01' : null,
    });
    if (error?.code === '42501') return json({ connected: false });
    if (error || !data || !Array.isArray(data.shifts)) return unavailable();
    return json({ connected: true, open_shift: data.open_shift, shifts: data.shifts }, 200, key);
  } catch {
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  const body = await readPersonalPost(request);
  if (body instanceof NextResponse) return body;
  const key = deviceKey(request);
  if (body.action === 'device') {
    const browserKey = key ?? randomBytes(32).toString('hex');
    // Only the digest is shared for manual pairing. Generating a cookie grants no access.
    const fingerprint = createHash('sha256').update(browserKey, 'utf8').digest('hex');
    return json({ fingerprint }, 200, browserKey);
  }

  const { action, requestId, shiftId = null, fingerprint } = body;
  if (action === 'link') {
    if (typeof fingerprint !== 'string' || !deviceKeyFormat.test(fingerprint)) {
      return json({ error: '연결할 기기의 코드를 확인해 주세요.' }, 400);
    }
  } else if ((action !== 'in' && action !== 'out') || !isUuid(requestId) ||
      (action === 'in' && shiftId !== null) || (action === 'out' && !isUuid(shiftId))) {
    return json({ error: '출퇴근 요청을 확인해 주세요.' }, 400);
  }
  if (!key) return unpaired();
  try {
    const db = database();
    const { error } = action === 'link'
      ? await db.rpc('lv_personal_link_device', { p_device_key: key, p_fingerprint: fingerprint })
      : await db.rpc('lv_personal_punch', {
          p_device_key: key, p_action: action, p_request_id: requestId, p_shift_id: shiftId,
        });
    if (error?.code === '42501') return unpaired();
    if (error?.code === '22023' || error?.code === '23505') {
      const message = action === 'link' ? '기기 연결 코드를 다시 확인해 주세요.'
        : '현재 근무 상태가 바뀌었습니다. 기록을 확인한 뒤 다시 시도해 주세요.';
      return json({ error: message }, 409);
    }
    if (error) return unavailable();
    return json({ ok: true }, 200, key);
  } catch {
    return unavailable();
  }
}
