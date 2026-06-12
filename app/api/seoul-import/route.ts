import { NextRequest, NextResponse } from 'next/server';
import { autoTag } from '@/lib/auto-tag';
import { RefType } from '@/lib/types';

interface RegistMstVO { companyNmKr?: string; }
interface CpttMstVO  { titleKr?: string; cpttYear?: number; }
interface ArchEntry {
  rowNo: number;
  cpttMstSeq: number;
  registMstSeq: number;
  fileSeq: number | null;
  regFileSeq: number | null;
  schStartDt: number | null;
  cpttMstVO: CpttMstVO | null;
  registMstVO: RegistMstVO | null;
}
interface CpttDetail {
  trgetAdresKr: string;
  scaleKr: string;
  prposKr: string;
  dsgnRangeKr: string;
  dsgnAmount: string;
}

export interface SeoulImportItem {
  cpttMstSeq: number;
  rowNo: number;
  title: string;
  architect: string;
  year: number | null;
  refType: RefType;
  imageUrl: string;
  sourceUrl: string;
  floorArea: number;     // 연면적 (㎡)
  scaleText: string;
  designFee: string;     // "38.0억원"
  designFeeAmt: number;  // 억원 (필터용)
  specSource: 'seoul' | 'scorer' | '';
  suggestedTags: ReturnType<typeof autoTag>;
}

// ── 공통 헤더 ────────────────────────────────────────────────────────────────
const SEOUL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Content-Type': 'application/json; charset=UTF-8',
  'Accept': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://project.seoul.go.kr/view/viewListArch.do',
  'Origin': 'https://project.seoul.go.kr',
};

// ── 서울시 공모요강 스펙 (활성 공모전) ──────────────────────────────────────
let seoulSpecCache: { map: Map<number, CpttDetail>; at: number } | null = null;

async function getAllCpttSpecs(): Promise<Map<number, CpttDetail>> {
  const now = Date.now();
  if (seoulSpecCache && now - seoulSpecCache.at < 3_600_000) return seoulSpecCache.map;
  const map = new Map<number, CpttDetail>();
  try {
    const res = await fetch('https://project.seoul.go.kr/view/viewMoreListCptt.json', {
      method: 'POST', headers: SEOUL_HEADERS,
      body: JSON.stringify({ pageIndex: 1, pageUnit: 100, searchWrd: '', searchCnd: '' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return map;
    const data = await res.json();
    const vos: Record<string, unknown>[] = data?.cpttMstListVO?.cpttMstVOs || [];
    for (const vo of vos) {
      const seq = vo.cpttMstSeq as number;
      if (!seq) continue;
      map.set(seq, {
        trgetAdresKr: String(vo.trgetAdresKr || ''),
        scaleKr:      String(vo.scaleKr      || ''),
        prposKr:      String(vo.prposKr      || ''),
        dsgnRangeKr:  String(vo.dsgnRangeKr  || ''),
        dsgnAmount:   String(vo.dsgnAmount    || ''),
      });
    }
  } catch { /* 실패 시 빈 Map */ }
  seoulSpecCache = { map, at: Date.now() };
  return map;
}

// ── Scorer 교차 참조 인덱스 ──────────────────────────────────────────────────
interface ScorerSpec { floorArea: number; designFeeAmt: number; designFee: string; }

let scorerCache: { map: Map<string, ScorerSpec>; at: number } | null = null;
let scorerBuilding = false;

/** "설계공모", "현상공모" 등 제거 후 소문자·공백 제거 */
function normTitle(t: string): string {
  return t
    .replace(/설계\s*공모|현상\s*공모|지명\s*설계|일반\s*설계|건립\s*설계/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function parseScorerFeeToEok(raw: string): number {
  const m = raw.match(/([\d,]+(?:\.\d+)?)/); // 숫자만 추출 ("약 38억 원" 등 대응)
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!n || isNaN(n)) return 0;
  return raw.includes('억') ? n : n / 100; // 기본 단위: 백만원 → 억원
}

function eokToStr(eok: number): string {
  if (!eok) return '';
  if (eok >= 1) return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억원`;
  return `${Math.round(eok * 100).toLocaleString()}백만원`;
}

async function warmScorerIndex(): Promise<void> {
  if (scorerBuilding || (scorerCache && Date.now() - scorerCache.at < 86_400_000)) return;
  scorerBuilding = true;
  const map = new Map<string, ScorerSpec>();
  try {
    const sitemapRes = await fetch('https://scorer.co.kr/sitemap.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!sitemapRes.ok) { scorerBuilding = false; return; }
    const xml = await sitemapRes.text();

    const ids: number[] = [];
    const re = /<loc>https:\/\/scorer\.co\.kr\/competition\/(\d+)<\/loc>/g;
    let m;
    while ((m = re.exec(xml)) !== null) ids.push(parseInt(m[1]));

    // 최신 500개 처리 (20개씩 병렬) — 2025년 초 이후 공모전 커버
    const LIMIT = 500, BATCH = 20;
    for (let i = 0; i < Math.min(ids.length, LIMIT); i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const rows = await Promise.all(batch.map(async id => {
        try {
          const r = await fetch(`https://scorer.co.kr/competition/${id}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) return null;
          const html = await r.text();
          const titleM = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
          const descM  = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
          if (!titleM) return null;
          const SUFFIX = ' - 스코어러';
          const title = titleM[1].endsWith(SUFFIX) ? titleM[1].slice(0, -SUFFIX.length) : titleM[1];
          const desc  = descM?.[1] || '';
          const areaM = desc.match(/연면적\s*:\s*([\d,]+(?:\.\d+)?)\s*㎡/);
          const feeM  = desc.match(/설계비\s*:\s*([^,]+)/);
          const floorArea    = areaM ? parseFloat(areaM[1].replace(/,/g, '')) : 0;
          const designFeeAmt = parseScorerFeeToEok(feeM?.[1]?.trim() || '');
          const designFee    = eokToStr(designFeeAmt);
          return { key: normTitle(title), spec: { floorArea, designFeeAmt, designFee } };
        } catch { return null; }
      }));
      for (const row of rows) {
        if (row && (row.spec.floorArea > 0 || row.spec.designFeeAmt > 0)) {
          map.set(row.key, row.spec);
        }
      }
    }
  } catch { /* 실패해도 빈 Map으로 캐싱 */ }
  scorerCache = { map, at: Date.now() };
  scorerBuilding = false;
}

/** 제목으로 Scorer 인덱스에서 스펙 검색 (포함 관계 매칭) */
function matchScorer(title: string, scorerMap: Map<string, ScorerSpec>): ScorerSpec | undefined {
  const norm = normTitle(title);
  if (norm.length < 6) return undefined;
  if (scorerMap.has(norm)) return scorerMap.get(norm);
  // 짧은 쪽이 긴 쪽에 포함되는지 확인 (최소 6자 보장)
  for (const [key, spec] of scorerMap.entries()) {
    const minLen = Math.min(key.length, norm.length);
    if (minLen >= 6 && (key.includes(norm) || norm.includes(key))) {
      return spec;
    }
  }
  return undefined;
}

// ── 파싱 헬퍼 ────────────────────────────────────────────────────────────────
function parseFloorArea(scaleKr: string): number {
  const m = scaleKr.match(/연면적[^\d]*([\d,]+(?:\.\d+)?)\s*(?:㎡|m²|m2)/i);
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
}
function dsgnAmountToEok(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return !n || isNaN(n) ? 0 : n / 100;
}
function formatDsgnAmount(s: string): string { return eokToStr(dsgnAmountToEok(s)); }

// ── GET 핸들러 ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const page      = parseInt(req.nextUrl.searchParams.get('page')     || '1');
  const pageUnit  = parseInt(req.nextUrl.searchParams.get('pageUnit') || '20');
  const searchWrd = req.nextUrl.searchParams.get('q') || '';

  // Scorer 인덱스 백그라운드 웜업 (논블로킹)
  void warmScorerIndex();

  try {
    const [archRes, specMap] = await Promise.all([
      fetch('https://project.seoul.go.kr/view/viewMoreListArch.json', {
        method: 'POST', headers: SEOUL_HEADERS,
        body: JSON.stringify({ pageIndex: page, pageUnit, searchWrd, searchCnd: '', sortType: '' }),
        signal: AbortSignal.timeout(15000),
      }),
      getAllCpttSpecs(),
    ]);

    if (!archRes.ok) throw new Error(`HTTP ${archRes.status}`);
    const data = await archRes.json();

    const entries: ArchEntry[] = data?.awardListVO?.awardVOs || [];
    const total: number =
      data?.paginationInfo?.totalRecordCount ??
      data?.awardListVO?.totalCount ??
      entries.length;

    // Scorer 캐시가 이미 준비됐으면 바로 사용
    const scorerMap = scorerCache?.map ?? new Map<string, ScorerSpec>();

    const items: SeoulImportItem[] = entries.map(entry => {
      const mv = entry.cpttMstVO   || {};
      const rv = entry.registMstVO || {};

      const title     = mv.titleKr     || '';
      const architect = rv.companyNmKr || '';
      const year      = mv.cpttYear
        ? mv.cpttYear
        : entry.schStartDt ? new Date(entry.schStartDt).getFullYear() : null;

      // ① 서울시 활성 풀에서 스펙 조회
      const seoulDetail   = specMap.get(entry.cpttMstSeq);
      const address       = seoulDetail?.trgetAdresKr || '';
      const scaleText     = seoulDetail?.scaleKr      || '';
      const purposeText   = seoulDetail?.prposKr      || '';
      const designRange   = seoulDetail?.dsgnRangeKr  || '';

      let floorArea    = parseFloorArea(scaleText);
      let designFeeAmt = dsgnAmountToEok(seoulDetail?.dsgnAmount || '');
      let designFee    = formatDsgnAmount(seoulDetail?.dsgnAmount || '');
      let specSource: SeoulImportItem['specSource'] = seoulDetail ? 'seoul' : '';

      // ② 서울시 데이터 없으면 Scorer 인덱스로 보완
      if (!designFeeAmt || !floorArea) {
        const scorer = matchScorer(title, scorerMap);
        if (scorer) {
          if (!floorArea    && scorer.floorArea    > 0) floorArea    = scorer.floorArea;
          if (!designFeeAmt && scorer.designFeeAmt > 0) {
            designFeeAmt = scorer.designFeeAmt;
            designFee    = scorer.designFee;
          }
          if (scorer.floorArea > 0 || scorer.designFeeAmt > 0) specSource = 'scorer';
        }
      }

      const textForTag = [title, purposeText, designRange, scaleText, address].filter(Boolean).join(' ');
      const suggested  = autoTag(title, textForTag, [], address);

      if (floorArea > 0) {
        if (floorArea < 500)       suggested.scale = '소규모 (<500㎡)';
        else if (floorArea < 3000) suggested.scale = '중규모 (500~3,000㎡)';
        else                       suggested.scale = '대규모 (3,000㎡+)';
      }
      if (!suggested.region && address.includes('서울')) suggested.region = '서울';

      const imgSeq   = entry.regFileSeq || entry.fileSeq;
      const imageUrl = imgSeq
        ? `https://project.seoul.go.kr/downloadFile.do?fileSeq=${imgSeq}`
        : '';
      const sourceUrl = `https://project.seoul.go.kr/view/viewDetailArch.do?cpttMstSeq=${entry.cpttMstSeq}&rowNo=${entry.rowNo}`;

      return {
        cpttMstSeq: entry.cpttMstSeq,
        rowNo:      entry.rowNo,
        title, architect, year,
        refType: 'winner' as RefType,
        imageUrl, sourceUrl,
        floorArea, scaleText,
        designFee, designFeeAmt, specSource,
        suggestedTags: suggested,
      };
    });

    return NextResponse.json({ items, total, page, pageUnit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
