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
  trgetArea: string;
  trgetAdresKr: string;
  scaleKr: string;
  prposKr: string;
  dsgnRangeKr: string;
  dsgnAmount: string; // 설계비 (백만원 단위 문자열, e.g. "3,797")
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
  scaleText: string;    // 원문 규모 텍스트 (표시용)
  designFee: string;    // 설계비 표시용 (e.g. "38.0억원"), 빈 문자열이면 데이터 없음
  designFeeAmt: number; // 설계비 (억원 단위), 0이면 데이터 없음
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

// scaleKr에서 연면적(㎡) 숫자 추출 — 중간에 약·:·공백 등이 있어도 허용
function parseFloorArea(scaleKr: string): number {
  // "연면적: 11,730㎡" / "연면적 약 3,000㎡" / "연면적(연) 5,000㎡" 모두 처리
  const m = scaleKr.match(/연면적[^\d]*([\d,]+(?:\.\d+)?)\s*(?:㎡|m²|m2)/i);
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
}

// 설계비 백만원 → "X.X억원" 표시 문자열
function formatDsgnAmount(amtStr: string): string {
  const num = parseFloat(String(amtStr).replace(/,/g, ''));
  if (!num || isNaN(num)) return '';
  const eok = num / 100; // 백만원 ÷ 100 = 억원
  if (eok >= 1) return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억원`;
  return `${Math.round(eok * 1000).toLocaleString()}만원`;
}

function dsgnAmountToEok(amtStr: string): number {
  const num = parseFloat(String(amtStr).replace(/,/g, ''));
  if (!num || isNaN(num)) return 0;
  return num / 100;
}

/**
 * viewMoreListCptt.json은 현재 활성 공모만 반환한다.
 * 반환된 cpttMstSeq가 요청한 값과 일치할 때만 사용하고, 불일치하면 null 반환.
 */
async function fetchCpttDetail(cpttMstSeq: number): Promise<CpttDetail | null> {
  try {
    const res = await fetch('https://project.seoul.go.kr/view/viewMoreListCptt.json', {
      method: 'POST',
      headers: SEOUL_HEADERS,
      body: JSON.stringify({ pageIndex: 1, pageUnit: 1, searchWrd: '', searchCnd: '', cpttMstSeq }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vo = data?.cpttMstListVO?.cpttMstVOs?.[0];
    if (!vo) return null;
    // 반환된 데이터가 요청한 공모와 실제로 매핑되는지 검증
    if (vo.cpttMstSeq !== cpttMstSeq) return null;
    return {
      trgetArea:    vo.trgetArea    || '',
      trgetAdresKr: vo.trgetAdresKr || '',
      scaleKr:      vo.scaleKr      || '',
      prposKr:      vo.prposKr      || '',
      dsgnRangeKr:  vo.dsgnRangeKr  || '',
      dsgnAmount:   String(vo.dsgnAmount || ''),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const page     = parseInt(req.nextUrl.searchParams.get('page')     || '1');
  const pageUnit = parseInt(req.nextUrl.searchParams.get('pageUnit') || '20');
  const searchWrd = req.nextUrl.searchParams.get('q') || '';

  try {
    const res = await fetch('https://project.seoul.go.kr/view/viewMoreListArch.json', {
      method: 'POST',
      headers: SEOUL_HEADERS,
      body: JSON.stringify({ pageIndex: page, pageUnit, searchWrd, searchCnd: '', sortType: '' }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const entries: ArchEntry[] = data?.awardListVO?.awardVOs || [];
    const totalRecord: number =
      data?.paginationInfo?.totalRecordCount ??
      data?.awardListVO?.totalCount ??
      entries.length;

    // 공모요강 상세 정보 병렬 조회 (현재 활성 공모만 반환되므로 cpttMstSeq 검증 포함)
    const details = await Promise.all(entries.map(e => fetchCpttDetail(e.cpttMstSeq)));

    const items: SeoulImportItem[] = entries.map((entry, idx) => {
      const m      = entry.cpttMstVO   || {};
      const r      = entry.registMstVO || {};
      const detail = details[idx];

      const title    = m.titleKr       || '';
      const architect = r.companyNmKr  || '';

      const year = m.cpttYear
        ? m.cpttYear
        : entry.schStartDt
          ? new Date(entry.schStartDt).getFullYear()
          : null;

      const address     = detail?.trgetAdresKr || '';
      const scaleText   = detail?.scaleKr      || '';
      const purposeText = detail?.prposKr      || '';
      const designRange = detail?.dsgnRangeKr  || '';

      // autoTag: 제목 + 목적 + 설계범위 + 규모 설명
      const textForTag = [title, purposeText, designRange, scaleText, address].filter(Boolean).join(' ');
      const suggested  = autoTag(title, textForTag, [], address);

      // 연면적으로 규모 정밀 분류
      const floorArea = parseFloorArea(scaleText);
      if (floorArea > 0) {
        if (floorArea < 500)       suggested.scale = '소규모 (<500㎡)';
        else if (floorArea < 3000) suggested.scale = '중규모 (500~3,000㎡)';
        else                       suggested.scale = '대규모 (3,000㎡+)';
      }

      // 서울 주소면 지역 보정
      if (!suggested.region && address.includes('서울')) suggested.region = '서울';

      // 설계비
      const dsgnAmt  = detail?.dsgnAmount || '';
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
        title,
        architect,
        year,
        refType:       'winner' as RefType,
        imageUrl,
        sourceUrl,
        floorArea,
        scaleText,
        designFee,
        designFeeAmt,
        suggestedTags: suggested,
      };
    });

    return NextResponse.json({ items, total: totalRecord, page, pageUnit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
