import { NextRequest,NextResponse } from 'next/server';
import { createHash,randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { database,deviceKey,json,readPersonalPost,isUuid } from '../_personal';
import { applies,applyChange,caseFields,templateFields,isValues,resources, type Catalog,type WorkCase } from '@/lib/work-register';
export const dynamic='force-dynamic';
async function run(req:NextRequest,input:Record<string,unknown>){
 const key=deviceKey(req);if(!key)return json({error:'내 근태에서 대표자 기기를 연결한 후 이용하세요.'},403);
 const action=String(input.action), id=input.id===undefined?null:String(input.id), args=isValues(input.args)?input.args:{};
 if(id!==null&&!isUuid(id))return json({error:'의뢰 번호를 확인하세요.'},400);
 async function rpc(a:string,params:Record<string,unknown>={},cid=id){
 const {data,error}=await database().rpc('lv_work_register',{p_key:key,p_action:a,p_case:cid,p_args:params});
 if(error)throw Object.assign(new Error('storage'),{code:error.code});return data;}
 try{
 if(action==='asset'){const f=resources.find(x=>x.key===args.asset);if(!f)return json({error:'자료 없음'},404);const encoded=await rpc('asset',{asset:f.key});return new Response(Buffer.from(encoded,'base64'),{headers:{'Cache-Control':'private, no-store','Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name+'.'+f.ext)}});}
 if(action==='catalog'||action==='get'||action==='list')return json(await rpc(action,{after:Number(args.after||0)}));
 if(action==='template')return json(await rpc('template',{templateId:args.templateId,version:args.version,template:templateFields(args)}));
 if(action==='create'){const catalog:Catalog=await rpc('catalog');const t=catalog.templates.find(x=>x.id===args.templateId);if(!t)return json({error:'업무 유형을 선택하세요.'},400);return json(await rpc('create',{templateId:t.id,data:caseFields(args,t.body)}));}
 if(['prepare','download','finish','fileArchive','fileRestore'].includes(action)){
 if(action==='prepare'){
   const c:WorkCase=await rpc('get');
   if(!c.blueprint.docs.some(d=>d.id===args.doc&&applies(d,c.blueprint,c.data.details)))return json({error:'현재 경로의 서류에 첨부하세요.'},400);
 }
 const ticket=randomBytes(32).toString('hex');const result=await rpc(action,{...args,ticketHash:createHash('sha256').update(ticket).digest('hex')});
 if(!result.path)return json(result);
 const storage=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{'x-lv-register-ticket':ticket,'X-Client-Info':'lv-register-ticket/'+ticket}},auth:{persistSession:false,autoRefreshToken:false}}).storage.from('lv-work-register');
 const signed=action==='prepare'?await storage.createSignedUploadUrl(result.path,{upsert:false}):await storage.createSignedUrl(result.path,60,{download:result.name});
 if(signed.error) return json({error:'파일 전송 주소를 발급하지 못했습니다.'},503);
 return json({url:signed.data.signedUrl});}
 const current:WorkCase=await rpc('get');const changes=applyChange(current,action,args);
 return json(await rpc('update',{revision:input.revision,...changes}));
 }catch(e){const error=e as Error & {code?:string};const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='40001'?409:error.code==='22023'||!error.code?400:503;
 return json({error:status===403?'대표자에게 연결된 기기에서 이용하세요.':status===409?'다른 변경이 저장되었습니다. 새로고침 후 다시 입력하세요.':status===404?'기록을 찾을 수 없습니다.':!error.code&&error.message!=='storage'?error.message:'요청을 처리하지 못했습니다.'},status);}
}
export async function GET(req:NextRequest){const s=req.nextUrl.searchParams;const action=s.get('action')||'catalog';if(!['catalog','list','get','asset'].includes(action))return json({error:'허용되지 않은 조회입니다.'},405);return run(req,{action,...(s.get('id')?{id:s.get('id')}:{}),args:{after:s.get('after'),asset:s.get('asset')}});}
export async function POST(req:NextRequest){const b=await readPersonalPost(req);return b instanceof NextResponse?b:run(req,b);}

