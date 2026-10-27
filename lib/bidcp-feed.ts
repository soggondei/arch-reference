import baseline from './bidcp-baseline.json' with { type: 'json' };
import pricing from './price-evidence.cjs';
import cases from './price-cases.json' with { type: 'json' };
import type { SourceSnapshot } from './bidcp-snapshot';
type Bid = Record<string, string | number | null>;
// 2026-10-27: 로그인 후 화면에서 확인한 목록의 보완 자료. 자동 수집 성공으로 표시하지 않는다.
// 취소·정정·재입찰의 개별 행과 타 전자조달 공고번호를 보존한다.
export function reconcileBidcpFeed(stored: Bid[], now = Date.now(), live?: SourceSnapshot): Bid[] {
  stored = stored.filter(b=>b.공고번호!=='__BIDCP_FEED_V1__');
  const source = live || baseline;
  const checkedAt = live?.checkedAt || source.capturedAt;
  const normalize = (v: unknown) => String(v || '').replace(/\s+/g,'');
  const entries = source.entries.map(entry => {
    if (!live) return entry;
    const prior = baseline.entries.find(p=>p.sourceId===entry.sourceId && normalize(p.공고명)===normalize(entry.공고명) && p.기초금액===entry.기초금액 && p.마감일===entry.마감일);
    // 정확한 동일 공고의 원문 검토값만 보완한다. 신규/변경 공고에 하한율을 추측해 복사하지 않는다.
    return prior ? {...prior,...entry} : entry;
  });
  const used = new Set<string>();
  const regularLatest = stored.map(b=>String(b.공고일 || '')).sort().at(-1) || '';
  const day = new Date(now+9*3600000).toISOString().slice(0,10);
  const restored: Bid[] = entries.map(entry => {
    const s = entry as unknown as Bid;
    const old = stored.find(b=>b.공고번호===s.공고번호 && String(b.공고차수||'000')===String(s.공고차수||'000') && String(b.재입찰번호||'000').padStart(3,'0')===String(s.재입찰번호||'000').padStart(3,'0'));
    if (old) used.add(String(old.id));
    const newer = old && String(old.저장갱신일 || '') > source.capturedAt;
    const b: Bid = {id:'bidcp-'+s.sourceId, 공고명:s.공고명,공고기관:s.공고기관,공고번호:s.공고번호,공고차수:s.공고차수,
      재입찰번호:s.재입찰번호,공고업종:s.공고업종,지역:'경남',참가가능지역:s.지역원문확인 || s.참가지역표기 || s.목록지역,
      면허조건:String(s.공고업종),공고일:s.공고일 || s.목록입력일,마감일:s.마감일,개찰일:s.개찰일,입찰방법:'',예가방법:s.예가방법||'',
      배정예산:null,기초금액:s.기초금액,가격자료출처:s.출처URL,기초금액출처:s.출처URL,실제낙찰금액:null,실제낙찰률:null,낙찰업체:'',
      낙찰하한율:s.낙찰하한율||null,계약방법:s.계약방법||'',가격산식확인:s.가격산식확인||'',
      공고URL:s.출처URL,기준사이트URL:s.출처URL,기준사이트ID:s.sourceId,자료확인일:checkedAt,상공회의소수집방식:live?'자동 동기화':'수동 대조',상공회의소오류:live?.lastError?.message || '',목록입력일:s.목록입력일,
      정기수집최근일:regularLatest,참가마감:s.참가마감,필터근거:'창원상공회의소 건축설계·경상남도 목록',
      참가검토:s.자격요약 || `업종: ${s.공고업종} · 목록 지역: ${s.목록지역}${s.참가지역표기 ? ' · 시군 제한 표기: '+s.참가지역표기 : ''} · 세부 면허·실적·공동수급 원문 확인`,
      상태:s.상태표시==='취소'?'취소': !Number.isFinite(Date.parse(String(s.마감일)))?'일정확인필요':Date.parse(String(s.마감일))<now?'마감':'공고중',
    };
    if (!String(s.공고업종).includes('건축설계')) b.참가검토='비교 목록에 포함되어 있으나 건축설계 업종 표기 없음 · 참가 가능 여부 별도 확인 · '+b.참가검토;
    // 이미 보유한 확정 결과와 사용자 입력용 식별 정보는 보존한다.
    if (old) for (const key of ['실제낙찰금액','실제낙찰률','낙찰업체','결과확인','결과출처','기존결과금액']) if (old[key]!=null) b[key]=old[key];
    if (old?.상태 && ['낙찰','유찰','결과확인필요'].includes(String(old.상태)) && b.상태!=='취소') b.상태=old.상태;
    if (newer) for (const key of ['공고명','공고기관','마감일','개찰일','기초금액','가격자료출처','낙찰하한율','계약방법','가격산식확인','예가방법','참가가능지역','면허조건']) if(old[key]!=null && old[key]!=='') b[key]=old[key];
    if (newer && old.상태 && b.상태 !== '취소') b.상태=old.상태;
    // 목록 갱신 시각과 가격 검증 시각은 다르다. 동일 기초금액의 공식 가격 조건은 유지한다.
    const sameBasis = old && Number(old.기초금액)>0 && old.기초금액===b.기초금액;
    if (sameBasis) for (const key of ['낙찰하한율','계약방법','가격산식확인','예가방법']) if(old[key]!=null && old[key]!=='') b[key]=old[key];
    const asOf=Date.parse(String(b.마감일))<now?String(b.마감일).slice(0,10):day;
    const a=pricing.analyzeBidPrice(b,cases,{asOf}) as Record<string,unknown>;
    for (const key of ['추천입찰가','추천상태','사례참고가','적용낙찰률','공고설계비']) b[key]=(a[key]??null) as string|number|null;
    b.가격사례수=Number(a.사례수||0);b.가격비교범위=String(a.비교범위||'');b.추천근거=String(a.분석);b.가격모델=String(a.모델버전);b.가격기준시점=asOf;b.추천갱신일=day;b.사례자료기준='2026-10-18 수집 자료';
    if((newer || sameBasis) && old.가격모델==='bid-guidance-v3') for(const key of ['추천입찰가','추천상태','사례참고가','적용낙찰률','공고설계비','가격사례수','가격비교범위','추천근거','가격모델','가격기준시점','추천갱신일','사례자료기준']) b[key]=old[key]??null;
    if(b.상태==='취소'){b.추천입찰가=null;b.추천상태='취소 공고';b.추천근거='취소 이력 · 유효한 재공고를 확인하세요.';}
    return b;
  });
  return [...restored,...stored.filter(b=>!used.has(String(b.id))).map((b): Bid=>({...b,정기수집최근일:regularLatest}))].sort((a,b)=>String(b.공고일).localeCompare(String(a.공고일)));
}
