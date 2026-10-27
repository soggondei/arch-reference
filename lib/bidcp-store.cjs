// 완성된 스냅샷을 먼저 쓰고 해시 검증 후 포인터 한 개만 교체한다. 부분 목록은 공개하지 않는다.
const crypto=require('crypto');
const MARKER='__BIDCP_FEED_V1__';
const rich=s=>({rich_text:[{text:{content:String(s)}}]});
const text=p=>(p?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function validateSnapshot(s) {
  if(s?.version!==1 || s.source!=='https://changwon.bidcp.net/bids/bid/ser' || s.filter?.구분!=='용역' || s.filter?.업종!=='건축설계' || s.filter?.지역!=='경상남도' || !Number.isFinite(Date.parse(s.capturedAt)) || !Array.isArray(s.entries) || s.total!==s.entries.length || s.total<1 || s.total>5000) throw new Error('상공회의소 스냅샷 검증 실패');
  const ids=new Set();
  for(const e of s.entries){
    if(!/^\d{15}-\d{2}-\d{2}-\d{2}$/.test(e.sourceId) || ids.has(e.sourceId) || e.출처URL!==`https://changwon.bidcp.net/bids/bid/detail/${e.sourceId}` || !e.공고번호 || !e.공고명 || !e.목록입력일) throw new Error('상공회의소 항목 검증 실패');
    ids.add(e.sourceId);
  }
  return s;
}
function encodeBlocks(payload){
  const chunks=payload.match(/[\s\S]{1,1800}/gu)||[];
  const blocks=[];
  for(let i=0;i<chunks.length;i+=40) blocks.push({object:'block',type:'code',code:{language:'json',rich_text:chunks.slice(i,i+40).map(content=>({type:'text',text:{content}}))}});
  if(blocks.length>100) throw new Error('상공회의소 스냅샷 저장 한도 초과');
  return blocks;
}
function decodeBlocks(blocks){return blocks.map(b=>{if(b.type!=='code')throw new Error('상공회의소 저장 구조 불일치');return text({rich_text:b.code.rich_text});}).join('');}
async function findManifest(db,request){
  const q=await request(`/databases/${db}/query`,'POST',{page_size:2,filter:{property:'공고번호',rich_text:{equals:MARKER}}});
  if(!Array.isArray(q.results)||q.results.length>1||q.has_more) throw new Error('상공회의소 동기화 상태 중복/조회 오류');
  const row=q.results[0];
  let manifest=null;
  if(row){const value=text(row.properties?.공고기관);if(value)manifest=JSON.parse(value);}
  return {row,manifest};
}
async function saveSnapshot(snapshot,{db,request}){
  validateSnapshot(snapshot);
  if(Date.now()-Date.parse(snapshot.capturedAt)>2*3600000 || Date.parse(snapshot.capturedAt)>Date.now()+60000) throw new Error('상공회의소 검증 자료가 오래됨: 다시 수집 필요');
  let {row,manifest}=await findManifest(db,request);
  if(!row){row=await request('/pages','POST',{parent:{database_id:db},properties:{공고명:{title:[{text:{content:'상공회의소 동기화 상태 (시스템)'}}]},공고번호:rich(MARKER)}});if(!row.id)throw new Error('동기화 상태 생성 실패');}
  const entriesSha=digest(JSON.stringify(snapshot.entries));
  let next;
  if(manifest?.version===1 && manifest.entriesSha===entriesSha && manifest.pageId && manifest.sha256){
    const read=await request(`/blocks/${manifest.pageId}/children?page_size=100`);
    if(read.has_more || !Array.isArray(read.results) || digest(decodeBlocks(read.results))!==manifest.sha256) throw new Error('상공회의소 기존 스냅샷 검증 실패');
    // 변동이 없더라도 이번 실조회 시각을 기록한다. 과거 캡처를 읽은 것과 구분한다.
    next={...manifest,checkedAt:snapshot.capturedAt,total:snapshot.total,lastError:null};
  } else {
    const payload=JSON.stringify(snapshot),sha256=digest(payload);
    const generation=await request('/pages','POST',{parent:{page_id:row.id},properties:{title:{title:[{text:{content:`목록 ${snapshot.capturedAt}`}}]}},children:encodeBlocks(payload)});
    if(!generation.id)throw new Error('상공회의소 스냅샷 생성 실패');
    const read=await request(`/blocks/${generation.id}/children?page_size=100`);
    if(read.has_more || !Array.isArray(read.results) || digest(decodeBlocks(read.results))!==sha256) throw new Error('상공회의소 스냅샷 저장 검증 실패');
    next={version:1,pageId:generation.id,sha256,entriesSha,capturedAt:snapshot.capturedAt,checkedAt:snapshot.capturedAt,total:snapshot.total,lastError:null};
  }
  const result=await request(`/pages/${row.id}`,'PATCH',{properties:{공고기관:rich(JSON.stringify(next))}});
  if(result.id!==row.id || text(result.properties?.공고기관)!==JSON.stringify(next)) throw new Error('상공회의소 공개 포인터 저장 확인 실패');
  return next;
}
async function markFailure(message,{db,request}) {
  const {row,manifest}=await findManifest(db,request);
  if(!row || !manifest)return;
  await request(`/pages/${row.id}`,'PATCH',{properties:{공고기관:rich(JSON.stringify({...manifest,lastError:{at:new Date().toISOString(),message:String(message).slice(0,250)}}))}});
}
module.exports={MARKER,digest,validateSnapshot,encodeBlocks,decodeBlocks,findManifest,saveSnapshot,markFailure};
