import { NextRequest, NextResponse } from 'next/server';
import { autoTag } from '@/lib/auto-tag';
import { RefType, JudgeMember, CompetitionFile } from '@/lib/types';

function parseFilesFromHtml(html: string): CompetitionFile[] {
  const files: CompetitionFile[] = [];
  const sectionM = html.match(/class="inner-section-content file-list">([\s\S]*?)<\/div>/);
  if (!sectionM) return files;
  const re = /<a\s+href="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(sectionM[1])) !== null) {
    const url = m[1];
    if (!url.startsWith('http')) continue;
    const namePart = url.split('/').pop() ?? '';
    const name = decodeURIComponent(namePart);
    if (name) files.push({ name, url });
  }
  return files;
}

function parseJuriesFromHtml(html: string): JudgeMember[] {
  const judges: JudgeMember[] = [];
  const re = /<a class="go_to_jury"[\s\S]*?<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[0];
    const nameM = block.match(/<div class="name">\s*<span>([^<]+)<\/span>/);
    const profM  = block.match(/<div class="profile">\s*<span>([^<]+)<\/span>/);
    if (nameM) {
      const name = nameM[1].trim();
      if (name && name.length < 40) {
        judges.push({ name, affiliation: profM ? profM[1].trim() : undefined });
      }
    }
  }
  return judges;
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
  files: CompetitionFile[];
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

// "2026-11-26 ~ 2026-11-27 (18:00)" 또는 "~ 2026-10-14 (18:00)"처럼 범위/단일이
// 섞여 있어, 문자열에 등장하는 마지막 YYYY-MM-DD(= 마감일)를 뽑는다.
function lastDate(s: string): string {
  const all = s.match(/\d{4}-\d{2}-\d{2}/g);
  return all && all.length ? all[all.length - 1] : '';
}

// scorer.co.kr이 2026-10월 개편 때 OG description의 (상태) 표기를 없앴다.
// 상태 정보가 페이지 어디에도 배지로 남아있지 않아, 날짜로 계산한다.
// 기준(사용자 결정): 작품접수 마감일.
//   오늘 < 공고일            → 예정
//   오늘 <= 작품접수 마감일  → 진행 (아직 접수 가능)
//   오늘 >  작품접수 마감일  → 완료
// 작품접수일이 없으면 심사일 → 공고일 순으로 폴백한다.
function computeStatus(announcementDate: string, submissionDate: string, judgeDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const deadline = lastDate(submissionDate) || lastDate(judgeDate);
  if (announcementDate && today < announcementDate) return '예정';
  if (!deadline) return announcementDate && today >= announcementDate ? '진행' : '예정';
  return today <= deadline ? '진행' : '완료';
}

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

    // 발주처: OG desc에서 (2026-10 개편으로 "발주처 : " → "발주처 " 콜론이 빠짐)
    const clientM = ogDesc.match(/발주처\s*:?\s*([^,]+)/);
    const architect = clientM ? clientM[1].trim() : '';

    // 연도: 공고일에서
    const announcementDate = fields.get('공고일') || '';
    const year = announcementDate.slice(0, 4) || entry.lastmod.slice(0, 4);

    // 상태: OG desc의 (상태) 표기가 개편으로 사라져 날짜로 계산 (작품접수 마감일 기준)
    const status = computeStatus(announcementDate, fields.get('작품접수일') || '', fields.get('심사일') || '');

    // 카테고리: 개편으로 OG desc 토큰 구조가 바뀌어(2번째가 이제 발주처) dt/dd 필드를 신뢰
    const rawCat = fields.get('카테고리')?.split('/')[0].trim() || '';
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
      judges: parseJuriesFromHtml(html),
      files: parseFilesFromHtml(html),
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
