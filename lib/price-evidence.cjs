/**
 * 2026-10-18: 낙찰률의 분모는 예정가격이다(조달청 15129397).
 * 예산×낙찰률 및 중복 스냅샷 오차 보정을 폐기하고, 최종낙찰금액/공식기초금액을 비교한다.
 * 개찰 1순위는 최종 낙찰로 간주하지 않는다. 2026-10-27 사용자 요청: 사례 부족으로 추천을 차단하지 않고 가정을 공개한다.
 */
const MODEL_VERSION = 'bid-guidance-v3';
const MIN_CASES = 10;
const TIERS = [2e7, 5e7, 1e8, 5e8, 2e9, Infinity];
const LABELS = ['2천만미만', '2천만~5천만', '5천만~1억', '1억~5억', '5억~20억', '20억이상'];
const positive = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
const floorRate = v => { const n = positive(v); return n === null ? null : n > 1 ? n / 100 : n; };
const key = b => [b.공고번호, b.공고차수 || '000', b.입찰분류번호 || '1', b.재입찰번호 || '000'].join(':');
function getBudgetTier(n) { return LABELS[TIERS.findIndex(t => n < t)] || LABELS.at(-1); }
function serviceKind(b) {
  const title = (b.공고명 || '').replace(/\s/g, '');
  if (/주택건설공사.*감리|감리자.*모집/.test(title)) return '주택법감리';
  if (/건설사업관리|감독권한대행|CM용역/.test(title)) return 'CM';
  if (/감리/.test(title)) return '감리';
  if (/설계의경제성|VE|설계검증/.test(title)) return '설계검토';
  if (/정밀안전|안전진단|내진성능/.test(title)) return '진단';
  if (/기획/.test(title)) return '기획';
  if (/설계/.test(title) || b.공공조달분류 === '건축설계용역') return '설계';
  return '기타';
}
function unsupportedReason(b) {
  const text = [b.공고명, b.낙찰방법, b.계약방법, b.입찰방법].join('');
  if (/공모|협상|종합심사|기술제안|규격가격|2단계/.test(text) || b.예가방법 === '비예가') return '공모·협상·종합평가 등 가격 외 평가 방식은 별도 검토';
  if (serviceKind(b) === '주택법감리') return '주택법 감리자 선정은 별도 심사 산식 검토 필요';
  if (!['단일예가', '복수예가'].includes(b.예가방법)) return '예정가격 결정방식 미확인';
  if (!positive(b.기초금액) || !b.기초금액출처) return '공식 기초금액 미확인';
  const f = floorRate(b.낙찰하한율);
  if (!f || f < .5 || f >= 1) return '공고별 낙찰하한율 미확인';
  if (b.가격자료오류) return b.가격자료오류;
  if (b.가격산식확인 !== '단순하한율') return '단순 하한율 방식인지 확인 필요';
  return null;
}
function quantile(arr, p) {
  const s = [...arr].sort((a,b) => a-b); if (!s.length) return null;
  const i = (s.length-1)*p, lo = Math.floor(i); return s[lo]+(s[Math.ceil(i)]-s[lo])*(i-lo);
}
function selectCases(bid, history, asOf) {
  const map = new Map();
  const targetFloor = floorRate(bid.낙찰하한율);
  for (const h of history) {
    // 같은 공고의 정정·재입찰도 평가 대상의 학습 자료로 사용하지 않는다.
    if (!h.공고번호 || h.공고번호 === bid.공고번호 || unsupportedReason(h)) continue;
    if (h.결과구분 !== '최종낙찰' || !positive(h.낙찰가격) || !(Number(h.참가업체수) >= 2)) continue;
    if (!h.결과공개일 || h.결과공개일.slice(0,10) >= asOf.slice(0,10) || !h.개찰일 || h.개찰일.slice(0,10) >= asOf.slice(0,10)) continue;
    if (Math.abs(floorRate(h.낙찰하한율)-targetFloor) > .000001 || h.예가방법 !== bid.예가방법 ||
        h.계약방법 !== bid.계약방법 || serviceKind(h) !== serviceKind(bid)) continue;
    const ratio = h.낙찰가격 / h.기초금액;
    if (!Number.isFinite(ratio) || ratio < .4 || ratio > 1.2) continue;
    // 한 공고를 여러 회차/파일로 부풀리지 않으며 최신 확정 회차만 남긴다.
    const prev = map.get(h.공고번호);
    if (!prev || h.결과공개일 > prev.결과공개일) map.set(h.공고번호, h);
  }
  const sameTier = [...map.values()].filter(h => getBudgetTier(h.기초금액) === getBudgetTier(bid.기초금액));
  const agency = sameTier.filter(h => h.공고기관 && h.공고기관 === bid.공고기관);
  const region = sameTier.filter(h => h.지역 && h.지역 === bid.지역);
  if (agency.length >= MIN_CASES) return { rows: agency, scope: '동일 발주기관·금액대' };
  if (region.length >= MIN_CASES) return { rows: region, scope: '동일 발주지역·금액대' };
  return { rows: sameTier, scope: '전국 동일 금액대' };
}
function analyzeBidPrice(bid, history = [], options = {}) {
  const asOf = options.asOf || new Date().toISOString();
  const basisAvailable = !bid.가격자료오류 && (!bid.기초금액공개일 || bid.기초금액공개일.slice(0,10) <= asOf.slice(0,10));
  const basis = basisAvailable ? positive(bid.기초금액) : null;
  const base = basis || positive(bid.배정예산);
  const baseName = basis ? '기초금액' : '배정예산';
  const common = { 모델버전: MODEL_VERSION, 산출시각: asOf, 기준가격: base, 기준가격종류: baseName,
    추천입찰가: null, 낙찰하한가: null, 적용낙찰률: '', 바이어스보정: null, 사례수: 0,
    주의: '개찰 전 예정가격은 미정입니다. 추천가는 낙찰 또는 하한 충족을 보장하지 않습니다. 공고 금액의 부가세 기준을 따르며 10%를 중복 가산하지 않습니다.' };
  if (!base) return { ...common, 추천상태: '금액 정보 필요', 분석: '공개된 기초금액·배정예산이 없어 계산할 금액이 없습니다.' };
  // 설계공모에는 가격 투찰이 없으므로 공고의 용역비와 추천가를 구분한다.
  if (/공모/.test([bid.공고명,bid.낙찰방법].join(''))) return { ...common, 추천상태: '공고 설계비', 공고설계비: positive(bid.배정예산) || base, 분석: '설계공모: 공개된 용역비입니다. 가격 투찰 추천가가 아닙니다.' };
  const complex = /협상|종합심사|기술제안|규격가격|2단계|전자시담/.test([bid.낙찰방법,bid.입찰방법].join('')) || serviceKind(bid) === '주택법감리';
  const f = floorRate(bid.낙찰하한율);
  const validFloor = f && f >= .5 && f < 1;
  let selected = { rows: [], scope: '' };
  const strict = !unsupportedReason(bid);
  if (strict) selected = selectCases(bid, history, asOf);
  else if (!complex) {
    // 조건이 누락된 기존 공고도 같은 업무·금액대의 사전 공개 사례로 계산하되 조건 미확인을 명시한다.
    const seen = new Map();
    for (const h of history) {
      if (!h.공고번호 || h.공고번호 === bid.공고번호 || unsupportedReason(h) || h.결과구분 !== '최종낙찰' || !(h.참가업체수 >= 2)) continue;
      if (!h.결과공개일 || !h.개찰일 || h.결과공개일.slice(0,10) >= asOf.slice(0,10) || h.개찰일.slice(0,10) >= asOf.slice(0,10)) continue;
      if (serviceKind(h) !== serviceKind(bid) || (bid.예가방법 && h.예가방법 !== bid.예가방법) || (bid.계약방법 && h.계약방법 !== bid.계약방법)) continue;
      if (validFloor && Math.abs(floorRate(h.낙찰하한율)-f) > .000001) continue;
      const denominator = positive(h[baseName]);
      if (!denominator || getBudgetTier(denominator) !== getBudgetTier(base)) continue;
      const ratio = h.낙찰가격/denominator;
      if (!(ratio >= .4 && ratio <= 1.2)) continue;
      const prior = seen.get(h.공고번호);
      if (!prior || h.결과공개일 > prior.결과공개일) seen.set(h.공고번호,h);
    }
    selected = { rows: [...seen.values()], scope: '전국 동일 업무·금액대 (공고 조건 일부 미확인)' };
  }
  let rate, status, rationale;
  if (selected.rows.length) {
    rate = quantile(selected.rows.map(h => h.낙찰가격 / h[baseName]), .5);
    status = strict && selected.rows.length >= MIN_CASES ? '사례 기반 추천' : '가정 포함 추천';
    rationale = `${selected.scope} 최종낙찰 ${selected.rows.length}건의 낙찰금액/${baseName} 중앙값`;
    if (selected.rows.length < MIN_CASES) rationale += ' · 소수 사례로 변동성 큼';
    if (!strict) rationale += ' · 계약·하한율·산식 확인 필요';
  } else if (validFloor && !complex && !bid.가격자료오류) {
    rate = f; status = '기준 가정 추천';
    rationale = `예정가격을 ${baseName}의 100%로 가정 × 공고 하한율 ${(f*100).toFixed(3)}% · 비교 사례 없음`;
  } else {
    rate = 1; status = '공개금액 기준 추천';
    rationale = `${baseName}의 100%를 초기 제안액으로 사용 · 비교 사례와 적용 산식 미확인 · 낙찰 예상액이 아니며 가격 조정 필요`;
  }
  const amount = Math.ceil(base*rate);
  return { ...common, 추천입찰가: amount, 추천상태: status, 사례수: selected.rows.length, 비교범위: selected.scope,
    적용낙찰률: `${(rate*100).toFixed(4)}% (${baseName} 대비)`,
    사례참고가: selected.rows.length ? amount : null,
    분석: `${baseName} ${base.toLocaleString('ko-KR')}원 기준 · ${rationale}${!basis ? ' · 기초금액 미확인, 예산 기준 임시 계산 (부가세 포함 여부 원문 확인)' : ' · 공고 금액 기준, 부가세 중복 가산 없음'}`,
    비교사례: selected.rows.map(h => ({ 공고번호: h.공고번호, 공고차수: h.공고차수, 공고명: h.공고명, 기초금액: h.기초금액, 낙찰가격: h.낙찰가격, 결과공개일: h.결과공개일 })),
  };
}

module.exports = { MODEL_VERSION, MIN_CASES, floorRate, key, getBudgetTier, serviceKind, unsupportedReason, quantile, selectCases, analyzeBidPrice };
