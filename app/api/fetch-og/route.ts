import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { autoTag, SuggestedTags } from '@/lib/auto-tag';

export interface OGData {
  title: string;
  imageUrl: string;
  description: string;
  architect: string;
  year: string;
  location: string;
  bodyKeywords: string[];
  suggestedTags: SuggestedTags;
  sourceUrl: string;
}

function extractYear(text: string): string {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : '';
}

interface SiteData {
  title?: string;
  imageUrl?: string;
  description?: string;
  architect?: string;
  year?: string;
  location?: string;
  keywords?: string[];
}

function parseArchDaily($: ReturnType<typeof cheerio.load>, url: string): SiteData {
  const result: SiteData = {};

  // JSON-LD (가장 풍부한 구조화 데이터)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (data['@type'] === 'NewsArticle' || data['@type'] === 'Article' || data.name) {
        if (data.name && !result.title) result.title = data.name;
        if (data.description && !result.description) result.description = data.description;
        if (data.image?.url && !result.imageUrl) result.imageUrl = data.image.url;
        if (data.author?.name && !result.architect) result.architect = data.author.name;
        if (data.datePublished && !result.year) result.year = data.datePublished.slice(0, 4);
        if (data.keywords) {
          result.keywords = Array.isArray(data.keywords)
            ? data.keywords
            : data.keywords.split(',').map((k: string) => k.trim());
        }
        if (data.contentLocation?.name) result.location = data.contentLocation.name;
      }
    } catch { /* skip invalid JSON-LD */ }
  });

  // ArchDaily: 건축가/사무소명 추출
  if (!result.architect) {
    result.architect =
      $('[class*="office-title"]').first().text().trim() ||
      $('[class*="architect"]').first().text().trim() ||
      $('span[itemprop="name"]').first().text().trim() || '';
  }

  // 위치 정보 추출
  if (!result.location) {
    result.location =
      $('[class*="location"]').first().text().trim() ||
      $('[itemprop="addressLocality"]').first().text().trim() || '';
  }

  // URL에서 연도 보조 추출
  if (!result.year) result.year = extractYear(url);

  // 본문에서 키워드 보강 (상위 500자)
  const articleText = $('article, [class*="article-body"], [class*="content"]').first().text().trim().slice(0, 500);
  if (articleText && !result.keywords?.length) {
    result.keywords = [articleText];
  }

  return result;
}

function parseArchello($: ReturnType<typeof cheerio.load>): SiteData {
  return {
    architect: $('[class*="firm-name"]').first().text().trim() ||
      $('[class*="architect"]').first().text().trim() || '',
    year: extractYear($('[class*="year"]').first().text()),
    location: $('[class*="location"]').first().text().trim() || '',
  };
}

// scorer.co.kr OG description 구조:
// "(예정) 일반 설계공모, 문화, 공고일 : 2026-06-15, 발주처 : 서울특별시 동대문구,
//  심사위원 : 총 10명, 위치 : 서울 동대문구 장안동 356, 연면적 : 11,730㎡, ..."
function parseScorer(ogDesc: string, ogTitle: string): SiteData & { floorArea: number } {
  const result: SiteData & { floorArea: number } = { floorArea: 0 };

  // "제목 - 스코어러" 접미어 제거
  const SCORER_SUFFIX = ' - 스코어러';
  if (ogTitle.endsWith(SCORER_SUFFIX)) {
    result.title = ogTitle.slice(0, -SCORER_SUFFIX.length).trim();
  }

  // 키: 값 패턴 추출 헬퍼 — 다음 키 레이블(한글:) 직전까지 캡처
  const extract = (key: string): string => {
    const m = ogDesc.match(new RegExp(key + '\\s*:\\s*([^,]+(?:,[^,]+)*?)(?=,\\s*[가-힣]+\\s*:|$)'));
    return m ? m[1].trim() : '';
  };

  // 연도 — 공고일 YYYY-MM-DD
  const dateIssue = ogDesc.match(/공고일\s*:\s*(\d{4})/);
  if (dateIssue) result.year = dateIssue[1];

  // 발주처 → architect 필드 (의뢰처/클라이언트)
  const clientM = ogDesc.match(/발주처\s*:\s*([^,]+)/);
  if (clientM) result.architect = clientM[1].trim();

  // 위치 → location → region 자동분류에 사용
  const locM = ogDesc.match(/위치\s*:\s*([^,]+(?:,\s*[^,]+)*?)(?=,\s*연면적|,\s*대지면적|$)/);
  const locStr = locM ? locM[1].trim() : '';
  if (locStr) result.location = locStr;

  // 연면적 — "11,730㎡" 형태에서 숫자 추출 (쉼표 포함 숫자 처리)
  const areaM = ogDesc.match(/연면적\s*:\s*([\d,]+)㎡/);
  if (areaM) {
    result.floorArea = parseFloat(areaM[1].replace(/,/g, '')) || 0;
  }

  // 카테고리 — "(예정) 일반 설계공모, 문화," 에서 2번째 토큰
  // 스코어러 카테고리 → 우리 program 태그 직접 매핑
  const SCORER_CATEGORY: Record<string, string> = {
    '문화': '문화', '교육': '교육', '의료': '의료', '복지': '의료',
    '의료・복지': '의료', '주거': '주거', '업무': '업무', '공공': '공공',
    '복합': '복합', '상업': '상업', '종교': '종교', '산업': '산업',
    '근린생활': '상업',
  };
  const headerPart = ogDesc.replace(/^\([^)]*\)\s*/, ''); // "(예정)" 제거
  const tokens = headerPart.split(',').map(s => s.trim());
  // tokens[0] = 공모 유형, tokens[1] = 카테고리
  const rawCategory = tokens[1] || '';
  const mappedCategory = SCORER_CATEGORY[rawCategory] || rawCategory;

  // autoTag에 category를 extraKeyword로 전달
  result.keywords = [mappedCategory, rawCategory, locStr, ogDesc].filter(Boolean);

  return result;
}

function parseGeneric($: ReturnType<typeof cheerio.load>, url: string): SiteData {
  const bodyText = $('article, main, [role="main"]').first().text().trim().slice(0, 1000) ||
    $('body').text().slice(0, 1000);
  return {
    year: extractYear(url) || extractYear(bodyText),
    architect: $('[class*="author"]').first().text().trim().slice(0, 80) ||
      $('[class*="architect"]').first().text().trim().slice(0, 80) || '',
    location: $('[class*="location"]').first().text().trim().slice(0, 80) || '',
    keywords: [bodyText],
  };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: '유효하지 않은 URL' }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // 공통 OG 메타 추출
    const ogTitle =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').first().text().trim() || '';

    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') || '';

    const ogDesc =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') || '';

    // 사이트별 심층 파싱
    const host = targetUrl.hostname;
    let siteData: SiteData = {};
    let floorArea = 0;

    if (host.includes('archdaily.com')) {
      siteData = parseArchDaily($, url);
    } else if (host.includes('archello.com')) {
      siteData = parseArchello($);
    } else if (host.includes('scorer.co.kr')) {
      const scorerData = parseScorer(ogDesc, ogTitle);
      floorArea = scorerData.floorArea;
      siteData = scorerData;
    } else {
      siteData = parseGeneric($, url);
    }

    const title = siteData.title || ogTitle;
    const description = siteData.description || ogDesc;
    const location = siteData.location || '';
    const bodyKeywords = siteData.keywords || [];

    // 자동 태그 분류
    const suggestedTags = autoTag(title, description, bodyKeywords, location);

    // scorer: 연면적으로 scale 정밀 결정 (키워드 추론보다 정확)
    if (floorArea > 0) {
      if (floorArea < 500) suggestedTags.scale = '소규모 (<500㎡)';
      else if (floorArea < 3000) suggestedTags.scale = '중규모 (500~3,000㎡)';
      else suggestedTags.scale = '대규모 (3,000㎡+)';
    }

    const result: OGData = {
      title,
      imageUrl: siteData.imageUrl || ogImage,
      description,
      architect: siteData.architect || '',
      year: siteData.year || extractYear(url),
      location,
      bodyKeywords,
      suggestedTags,
      sourceUrl: url,
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
