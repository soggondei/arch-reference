import { NextRequest, NextResponse } from 'next/server';
import { autoTag } from '@/lib/auto-tag';
import { RefType } from '@/lib/types';

interface RegistMstVO {
  companyNmKr?: string;
}

interface CpttMstVO {
  titleKr?: string;
  cpttYear?: number;
}

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
  floorArea: number;    // 연면적 (㎡), 0이면 데이터 없음
  scaleText: string;    // 원문 규모 텍스트
  designFee: string;    // 표시용 설계비 (e.g. "38.0억원")
  designFeeAmt: number; // 설계비 (억원 단위, 필터용)
  suggestedTags: ReturnType<typeof autoTag>;
}

const SEOUL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Content-Type': 'application/json; charset=UTF-8',
  'Accept': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://project.seoul.go.kr/view/viewListArch.do',
  'Origin': 'https://project.seoul.go.kr',
};

// 전체 공모요강 스펙 캐시 (1시간)
let specCache: { map: Map<number, CpttDetail>; fetchedAt: number } | null = null;

/**
 * viewMoreListCptt.json은 cpttMstSeq 필터를 무시하고 전체 목록을 반환한다.
 * pageUnit을 크게 설정해 한 번에 가져온 뒤 Map으로 캐싱해 아카이빙 항목과 매핑.
 */
async function getAllCpttSpecs(): Promise<Map<number, CpttDetail>> {
  const now = Date.now();
  if (specCache && now - specCache.fetchedAt < 3_600_000) return specCache.map;

  const map = new Map<number, CpttDetail>();
  try {
    const res = await fetch('https://project.seoul.go.kr/view/viewMoreListCptt.json', {
      method: 'POST',
      headers: SEOUL_HEADERS,
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
  } catch { /* 실패 시 빈 Map 반환 */ }

  specCache = { map, fetchedAt: now };
  return map;
}

// scaleKr에서 연면적 숫자 추출
function parseFloorArea(scaleKr: string): number {
  const m = scaleKr.match(/연면적[^\d]*([\d,]+(?:\.\d+)?)\s*(?:㎡|m²|m2)/i);
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
}

// 설계비 문자열 → 억원 수치 (백만원 단위 → ÷100)
function dsgnAmountToEok(amtStr: string): number {
  const num = parseFloat(amtStr.replace(/,/g, ''));
  if (!num || isNaN(num)) return 0;
  return num / 100;
}

// 설계비 → 표시 문자열
function formatDsgnAmount(amtStr: string): string {
  const eok = dsgnAmountToEok(amtStr);
  if (!eok) return '';
  if (eok >= 1) return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억원`;
  return `${Math.round(eok * 100).toLocaleString()}백만원`;
}

export async function GET(req: NextRequest) {
  const page      = parseInt(req.nextUrl.searchParams.get('page')     || '1');
  const pageUnit  = parseInt(req.nextUrl.searchParams.get('pageUnit') || '20');
  const searchWrd = req.nextUrl.searchParams.get('q') || '';

  try {
    // 아카이빙 목록 + 공모요강 스펙 맵을 병렬 조회
    const [archRes, specMap] = await Promise.all([
      fetch('https://project.seoul.go.kr/view/viewMoreListArch.json', {
        method: 'POST',
        headers: SEOUL_HEADERS,
        body: JSON.stringify({ pageIndex: page, pageUnit, searchWrd, searchCnd: '', sortType: '' }),
        signal: AbortSignal.timeout(15000),
      }),
      getAllCpttSpecs(),
    ]);

    if (!archRes.ok) throw new Error(`HTTP ${archRes.status}`);
    const data = await archRes.json();

    const entries: ArchEntry[] = data?.awardListVO?.awardVOs || [];
    const totalRecord: number  =
      data?.paginationInfo?.totalRecordCount ??
      data?.awardListVO?.totalCount ??
      entries.length;

    const items: SeoulImportItem[] = entries.map(entry => {
      const m = entry.cpttMstVO   || {};
      const r = entry.registMstVO || {};

      const title     = m.titleKr      || '';
      const architect = r.companyNmKr  || '';
      const year      = m.cpttYear
        ? m.cpttYear
        : entry.schStartDt
          ? new Date(entry.schStartDt).getFullYear()
          : null;

      // cpttMstSeq로 스펙 맵에서 조회
      const detail    = specMap.get(entry.cpttMstSeq);
      const address   = detail?.trgetAdresKr || '';
      const scaleText = detail?.scaleKr      || '';
      const purposeText = detail?.prposKr    || '';
      const designRange = detail?.dsgnRangeKr || '';

      const textForTag = [title, purposeText, designRange, scaleText, address].filter(Boolean).join(' ');
      const suggested  = autoTag(title, textForTag, [], address);

      const floorArea = parseFloorArea(scaleText);
      if (floorArea > 0) {
        if (floorArea < 500)       suggested.scale = '소규모 (<500㎡)';
        else if (floorArea < 3000) suggested.scale = '중규모 (500~3,000㎡)';
        else                       suggested.scale = '대규모 (3,000㎡+)';
      }
      if (!suggested.region && address.includes('서울')) suggested.region = '서울';

      const dsgnAmt      = detail?.dsgnAmount || '';
      const designFee    = formatDsgnAmount(dsgnAmt);
      const designFeeAmt = dsgnAmountToEok(dsgnAmt);

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
        designFee, designFeeAmt,
        suggestedTags: suggested,
      };
    });

    return NextResponse.json({ items, total: totalRecord, page, pageUnit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
