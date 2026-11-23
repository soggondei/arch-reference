import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { NextRequest } = require('next/server');
require.extensions['.ts'] = (mod, path) => {
  const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
  mod._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: options }).outputText, path);
};
const personal = require('../app/api/personal-work/route.ts');
const project = require('../app/api/project-work/route.ts');
const origin = 'https://office.example';
const device = randomBytes(32).toString('hex');
const headers = {
  origin,
  'content-type': 'application/json',
  cookie: (process.env.NODE_ENV === 'production' ? '__Host-lv-attendance-device' : 'lv-attendance-device') + '=' + device,
};
const post = body => personal.POST(new NextRequest(origin + '/api/personal-work', {
  method: 'POST', headers, body: JSON.stringify(body),
}));

test('project visibility is an explicit edit and reading shared logs sends no personal credential to the RPC', async () => {
  const previousFetch = globalThis.fetch;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
  const calls = [];
  const projected = {id:'personal:'+randomUUID(),taskId:'draw',taskName:'도면',date:'2026-11-23',minutes:90,author:'사무소 대표',body:'공개 결과'};
  globalThis.fetch = async (url, request) => {
    const name = String(url).split('/').pop();
    calls.push({ name, args: JSON.parse(request.body) });
    if (name === 'lv_project_shared_logs') return Response.json([{...projected, note:'private field',employee_id:'private id'}]);
    if (name === 'lv_personal_work_sources') return Response.json([]);
    return new Response(null, { status: 204 });
  };
  try {
    const input = {action:'save', id:randomUUID(), day:'2026-11-23', projectId:'suyu', taskId:'drawing',
      taskName:'도면', minutes:90, note:'나만 보는 메모', version:null};
    assert.equal((await post(input)).status,200);
    assert.equal(calls.at(-1).name,'lv_personal_save_work');
    assert.equal((await post({...input,projectNote:'공유한 결과'})).status,200);
    assert.equal(calls.at(-1).name,'lv_personal_save_shared_work');
    assert.equal(calls.at(-1).args.p_project_note,'공유한 결과');
    assert.equal(calls.at(-1).args.p_note,'나만 보는 메모');
    assert.equal((await post({...input,projectNote:null})).status,200);
    assert.equal(calls.at(-1).args.p_project_note,null);
    const before = calls.length;
    assert.equal((await post({...input,projectId:null,taskId:null,projectNote:'invalid'})).status,400);
    assert.equal((await post({action:'claim',logId:'log',projectId:'suyu',revision:'bad'})).status,400);
    assert.equal(calls.length,before);
    const sourceUrl = origin + '/api/personal-work?day=2026-11-23&sources=1';
    assert.equal((await personal.GET(new NextRequest(sourceUrl))).status,403);
    assert.deepEqual(await (await personal.GET(new NextRequest(sourceUrl,{headers}))).json(),{sources:[]});
    assert.equal((await post({action:'claim',logId:'notion/123',projectId:'suyu',revision:'a'.repeat(32)})).status,200);
    assert.equal(calls.at(-1).name,'lv_personal_claim_work');
    const publicResult = await project.GET(new NextRequest(origin+'/api/project-work?projectId=suyu',{headers}));
    assert.deepEqual(await publicResult.json(),{logs:[projected]});
    assert.equal(publicResult.headers.get('cache-control'),'no-store');
    assert.deepEqual(calls.at(-1),{name:'lv_project_shared_logs',args:{p_project_id:'suyu'}});
  } finally {
    globalThis.fetch = previousFetch;
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  }
});
