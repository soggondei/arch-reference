import { NextRequest, NextResponse } from 'next/server';
import { autoTag } from '@/lib/auto-tag';
import { RefType, JudgeMember } from '@/lib/types';

function parseJudges(text: string): JudgeMember[] {
  if (!text.trim()) return [];
  const entries = text.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  return entries
    .map(entry => {
      const m = entry.match(/^(.+?)\s*[（(]([^)）]+)[)）]\s*$/);
      if (m) return { name: m[1].trim(), affiliation: m[2].trim() };
      return { name: entry.trim() };
    })
    .filter(j => j.name.length > 0 && j.name.length < 40);
}

export interface ScorerImportItem {
  id: number;
  title: string;
  architect: string;       // 발주처
  year: string;
  location: string;
  category: string;        // 카테고리
  status: string;          // 예정/진행/완료
  // 개요
  competitionType: string; // 공모방식
  projectScope: string;    // 사업범위
  usageType: string;       // 용도
  scaleText: string;       // 규모 (층수)
  // 규모/비용
  floorArea: number;
  floorAreaText: string;   // 연면적 (표시용)
  siteArea: string;        // 대지면적
  designFee: string;       // 설계비
  constructionCost: string; // 공사비
  // 일정
  announcementDate: string;  // 공고일
  registrationDate: string;  // 참가등록일
  registrationMethod: string; // 참가등록방식
  submissionDate: string;    // 작품접수일
  submissionMethod: string;  // 작품접수방식
  submissionFormat: string;  // 제출물 형식
  judgeDate: string;         // 심사일
  resultDate: string;        // 당선작 발표일
  // 공통
  judges: JudgeMember[];
  refType: RefType;
  sourceUrl: string;
  suggestedTags: ReturnType<typeof autoTag>;
  lastmod: string;
}

interface SitemapEntry {
  id: number;
  lastmod: string;
}

let sitemapCache: { items: SitemapEntry[]; fetchedAt: number } | null = null;

async function getSitemapItems(): Promise<SitemapEntry[]> {
  const now = Date.now();
  if (sitemapCache && now - sitemapCache.fetchedAt < 3_600_000) {
    return sitemapCache.items;
  }
  const res = await fetch('https://scorer.co.kr/sitemap.xml', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
  const xml = await res.text();

  const items: SitemapEntry[] = [];
  const re = /<loc>https:\/\/scorer\.co\.kr\/competition\/(\d+)<\/loc>[\s\S]*?(?:<lastmod>([^<]+)<\/lastmod>)?/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    items.push({ id: parseInt(m[1]), lastmod: m[2] || '' });
  }
  items.sort((a, b) => b.lastmod.localeCompare(a.lastmod) || b.id - a.id);
  sitemapCache = { items, fetchedAt: now };
  return items;
}

// <dt>키</dt><dd>값</dd> 쌍을 Map으로 추출
function parseDtDd(html: string): Map<string, string> {
  const result = new Map<string, string>();
  const re = /<dt>([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    const raw = m[2];
    // 내부 div(스피너·경고) 및 map-box, script 제거 후 텍스트만
    const value = raw
      .replace(/<div[^>]*>[\s\S]*?<\/div>/g, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<span[^>]*class="[^"]*(?:spinner|icon|map|label)[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (key && value && !result.has(key)) result.set(key, value);
  }
  return result;
}

const SCORER_CATEGORY: Record<string, string> = {
  '문화': '문화', '문화・예술': '문화', '문화・체육': '문화',
  '교육': '교육', '교육・연구': '교육', '연구・개발': '업무',
  '의료': '의료', '복지': '의료', '의료・복지': '의료',
  '주거': '주거', '업무': '업무', '행정・업무': '업무',
  '공공': '공공', '공공・커뮤니티': '공공', '안전': '공공', '체육': '공공',
  '복합': '복합', '상업': '상업', '근린생활': '상업',
  '종교': '종교', '산업': '산업',
};

async function fetchItem(entry: SitemapEntry): Promise<ScorerImportItem | null> {
  const url = `https://scorer.co.kr/competition/${entry.id}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // OG 메타
    const ogTitle =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
    const ogDesc =
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] || '';

    if (!ogTitle) return null;

    const SUFFIX = ' - 스코어러';
    const title = ogTitle.endsWith(SUFFIX) ? ogTitle.slice(0, -SUFFIX.length).trim() : ogTitle;

    // 공모요강 상세 필드 파싱
    const fields = parseDtDd(html);

    // 발주처: OG desc 또는 fields에서
    const clientM = ogDesc.match(/발주처\s*:\s*([^,]+)/);
    const architect = clientM ? clientM[1].trim() : '';

    // 연도: 공고일에서
    const announcementDate = fields.get('공고일') || '';
    const year = announcementDate.slice(0, 4) || entry.lastmod.slice(0, 4);

    // 상태: OG desc 앞부분
    const statusM = ogDesc.match(/^\(([^)]+)\)/);
    const status = statusM ? statusM[1] : '완료';

    // 카테고리: OG desc 두 번째 토큰
    const headerPart = ogDesc.replace(/^\([^)]*\)\s*/, '');
    const tokens = headerPart.split(',').map(s => s.trim());
    const rawCat = tokens[1] || fields.get('카테고리')?.split('/')[0].trim() || '';
    const category = SCORER_CATEGORY[rawCat] || rawCat;

    // 연면적 숫자 파싱 (autoTag scale 결정용)
    const floorAreaText = fields.get('연면적') || '';
    const floorAreaM = floorAreaText.match(/([\d,]+(?:\.\d+)?)\s*㎡/);
    const floorArea = floorAreaM ? parseFloat(floorAreaM[1].replace(/,/g, '')) : 0;

    const location = fields.get('위치') || (ogDesc.match(/위치\s*:\s*([^,]+)/)?.[1]?.trim() || '');

    const suggested = autoTag(title, [title, category, location].join(' '), [category], location);
    if (floorArea > 0) {
      if (floorArea < 500) suggested.scale = '소규모 (<500㎡)';
      else if (floorArea < 3000) suggested.scale = '중규모 (500~3,000㎡)';
      else suggested.scale = '대규모 (3,000㎡+)';
    }

    return {
      id: entry.id,
      title,
      architect,
      year,
      location,
      category,
      status,
      competitionType: fields.get('공모방식') || '',
      projectScope: fields.get('사업범위') || '',
      usageType: fields.get('용도') || '',
      scaleText: fields.get('규모') || '',
      floorArea,
      floorAreaText,
      siteArea: fields.get('대지면적') || '',
      designFee: fields.get('설계비') || '',
      constructionCost: fields.get('공사비') || '',
      announcementDate,
      registrationDate: fields.get('참가등록일') || '',
      registrationMethod: fields.get('참가등록방식') || '',
      submissionDate: fields.get('작품접수일') || '',
      submissionMethod: fields.get('작품접수방식') || '',
      submissionFormat: fields.get('제출물 형식') || '',
      judgeDate: fields.get('심사일') || '',
      resultDate: fields.get('당선작 발표일') || '',
      judges: parseJudges(fields.get('심사위원') || fields.get('심사위원단') || ''),
      refType: 'entry' as RefType,
      sourceUrl: url,
      suggestedTags: suggested,
      lastmod: entry.lastmod,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const pageUnit = parseInt(req.nextUrl.searchParams.get('pageUnit') || '20');

  try {
    const all = await getSitemapItems();
    const total = all.length;
    const slice = all.slice((page - 1) * pageUnit, page * pageUnit);

    const results = await Promise.all(slice.map(fetchItem));
    const items = results.filter(Boolean) as ScorerImportItem[];

    return NextResponse.json({ items, total, page, pageUnit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
