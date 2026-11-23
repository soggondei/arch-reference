import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-lv-attendance-device' : 'lv-attendance-device';
const maxBodyBytes = 32 * 1024;
export const deviceKeyFormat = /^[a-f0-9]{64}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

export function database() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function deviceKey(request: NextRequest) {
  const value = request.cookies.get(cookieName)?.value;
  return value && deviceKeyFormat.test(value) ? value : null;
}

export function json(body: object, status = 200, key?: string) {
  const response = NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
  });
  if (key) {
    response.cookies.set(cookieName, key, {
      httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: 365 * 24 * 60 * 60,
    });
  }
  return response;
}

export function unpaired() {
  return json({ error: '개인 근태에 연결된 기기에서 이용해 주세요.' }, 403);
}

export function unavailable() {
  return json({ error: '저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
}

export async function readPersonalPost(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return json({ error: 'LV LAB 화면에서 다시 시도해 주세요.' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: '요청 형식을 확인해 주세요.' }, 415);
  }
  if (Number(request.headers.get('content-length')) > maxBodyBytes) {
    return json({ error: '입력한 내용이 너무 깁니다.' }, 413);
  }
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > maxBodyBytes) return json({ error: '입력한 내용이 너무 깁니다.' }, 413);
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* Invalid JSON or incomplete body. */ }
  return json({ error: '요청 내용을 확인해 주세요.' }, 400);
}
