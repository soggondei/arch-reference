import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fileAttributes, MAX_PROJECT_FILE_BYTES, validFileLink, validFileName } from '@/lib/project-files';
import { database, deviceKey, isUuid, json, readPersonalPost, unavailable, unpaired } from '../_personal';

const bucket = 'lv-project-files';

function failed(code: string) {
  if (code === '42501') return unpaired();
  if (code === 'P0002') return json({ error: '프로젝트 또는 파일을 찾을 수 없습니다.' }, 404);
  if (code === '40001' || code === '23505') return json({ error: '파일 상태가 변경되었습니다. 목록을 새로 고쳐 주세요.' }, 409);
  if (code === '22023') return json({ error: '파일 정보와 선택한 업무를 다시 확인해 주세요.' }, 400);
  if (code === '55000') return json({ error: '파일 전송이 완료되지 않았습니다. 다시 시도해 주세요.' }, 409);
  return unavailable();
}

export async function GET(request: NextRequest) {
  const key = deviceKey(request);
  if (!key) return unpaired();
  const project = request.nextUrl.searchParams.get('projectId');
  if (!validFileLink(project)) return json({ error: '프로젝트를 선택해 주세요.' }, 400);
  try {
    const { data, error } = await database().rpc('lv_project_files', {
      p_device_key: key, p_action: 'list', p_project: project,
    });
    if (error) return failed(error.code);
    return Array.isArray(data) ? json({ files: data, maxBytes: MAX_PROJECT_FILE_BYTES }, 200, key) : unavailable();
  } catch { return unavailable(); }
}

export async function POST(request: NextRequest) {
  const body = await readPersonalPost(request);
  if (body instanceof NextResponse) return body;
  const key = deviceKey(request);
  if (!key) return unpaired();
  const { action, projectId, id, name, size, version } = body;
  if (!validFileLink(projectId) || !isUuid(id) || typeof action !== 'string' ||
      !['prepare', 'finish', 'download', 'edit', 'archive', 'restore'].includes(action)) {
    return json({ error: '프로젝트와 파일을 확인해 주세요.' }, 400);
  }
  let values: Record<string, unknown> = {};
  if (action === 'prepare' || action === 'edit') {
    const attrs = fileAttributes(body);
    if (!attrs) return json({ error: '파일 구분과 연결할 업무를 확인해 주세요.' }, 400);
    values = { ...attrs };
  }
  if (action === 'prepare') {
    if (!validFileName(name) || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > MAX_PROJECT_FILE_BYTES) {
      return json({ error: '파일 이름과 용량을 확인해 주세요. 파일당 최대 50 MiB까지 올릴 수 있습니다.' }, 400);
    }
    Object.assign(values, { name, size });
  }
  if (action === 'edit' || action === 'archive' || action === 'restore') {
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > 2147483647) {
      return json({ error: '파일 목록을 새로 고쳐 주세요.' }, 400);
    }
    values.version = version;
  }
  try {
    const signing = action === 'prepare' || action === 'download';
    const ticket = signing ? randomBytes(32).toString('hex') : '';
    const { data, error } = await database().rpc('lv_project_files', {
      p_device_key: key, p_action: action, p_project: projectId, p_id: id, p_values: values,
      p_ticket_hash: signing ? createHash('sha256').update(ticket).digest('hex') : null,
    });
    if (error) return failed(error.code);
    if (!signing || data?.ready === true) return json(data ?? { ok: true }, 200, key);
    if (typeof data?.path !== 'string') return unavailable();
    const signer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-lv-file-ticket': ticket, 'X-Client-Info': 'lv-file-ticket/' + ticket } },
    }).storage.from(bucket);
    if (action === 'prepare') {
      const signed = await signer.createSignedUploadUrl(data.path, { upsert: false });
      return signed.error ? unavailable() : json({ uploadUrl: signed.data.signedUrl }, 200, key);
    }
    if (!validFileName(data.name)) return unavailable();
    const signed = await signer.createSignedUrl(data.path, 60);
    if (signed.error) return unavailable();
    const url = new URL(signed.data.signedUrl);
    url.searchParams.set('download', data.name);
    return json({ url: url.toString() }, 200, key);
  } catch { return unavailable(); }
}
