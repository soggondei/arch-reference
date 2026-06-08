import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export interface SuggestedRef {
  title: string;
  imageUrl: string;
  architect: string;
  year: string;
  categories: string[];
  sourceUrl: string;
  source: 'archdaily';
}

// 우리 태그 → ArchDaily RSS 태그 슬러그 매핑
const TAG_TO_RSS: Record<string, string[]> = {
  // 용도
  '주거': ['residential-architecture', 'houses'],
  '상업': ['commercial-architecture', 'retail'],
  '업무': ['office-buildings'],
  '문화': ['cultural-architecture', 'museums'],
  '교육': ['educational-architecture', 'schools'],
  '의료': ['healthcare-architecture'],
  '공공': ['civic-architecture', 'public-architecture'],
  '복합': ['mixed-use-architecture'],
  '종교': ['religious-architecture'],
  // 재료
  '콘크리트': ['concrete-architecture'],
  '목재': ['wood-architecture'],
  '강재': ['steel-architecture'],
  '유리': ['glass-architecture'],
  '벽돌': ['brick-architecture'],
  '석재': ['stone-architecture'],
  '테라코타': ['terracotta'],
  // 매스/형태
  '코트야드형': ['courtyard'],
  '선형': ['linear-architecture'],
};

function extractImageFromContent(html: string): string {
  const $ = cheerio.load(html);
  const img = $('img').first();
  return img.attr('src') || img.attr('data-src') || '';
}

async function fetchRSSFeed(tagSlug: string): Promise<SuggestedRef[]> {
  const url = `https://www.archdaily.com/tag/${tagSlug}/feed/`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const results: SuggestedRef[] = [];

  $('item').each((_, el) => {
    if (results.length >= 6) return false;
    const $el = $(el);

    const title = $el.find('title').first().text().trim();
    const link = $el.find('link').text().trim() || $el.find('guid').text().trim();
    const pubDate = $el.find('pubDate').text().trim();
    const year = pubDate ? new Date(pubDate).getFullYear().toString() : '';
    const creator = $el.find('dc\\:creator, creator').text().trim();

    const categories: string[] = [];
    $el.find('category').each((_, cat) => {
      const text = $(cat).text().trim();
      if (text) categories.push(text);
    });

    // 이미지: content:encoded 에서 추출
    const encoded = $el.find('content\\:encoded, encoded').text();
    const imageUrl = encoded ? extractImageFromContent(encoded) : '';

    // description에서 이미지 fallback
    const desc = $el.find('description').text();
    const finalImage = imageUrl || (desc ? extractImageFromContent(desc) : '');

    if (title && link) {
      results.push({
        title,
        imageUrl: finalImage,
        architect: creator,
        year,
        categories,
        sourceUrl: link,
        source: 'archdaily',
      });
    }
  });

  return results;
}

export async function GET(req: NextRequest) {
  const tagsParam = req.nextUrl.searchParams.get('tags') || '';
  const query = req.nextUrl.searchParams.get('q') || '';

  // 태그에서 RSS 슬러그 선택
  const inputTags = tagsParam ? tagsParam.split(',').map(t => t.trim()) : [];
  const rssSlugSet = new Set<string>();

  for (const tag of inputTags) {
    const slugs = TAG_TO_RSS[tag];
    if (slugs) slugs.forEach(s => rssSlugSet.add(s));
  }

  // 태그 없으면 쿼리로 슬러그 유추
  if (rssSlugSet.size === 0 && query) {
    const q = query.toLowerCase();
    if (q.includes('residential') || q.includes('housing')) rssSlugSet.add('residential-architecture');
    if (q.includes('concrete')) rssSlugSet.add('concrete-architecture');
    if (q.includes('wood') || q.includes('timber')) rssSlugSet.add('wood-architecture');
    if (q.includes('courtyard')) rssSlugSet.add('courtyard');
    if (!rssSlugSet.size) rssSlugSet.add('architecture');
  }

  if (rssSlugSet.size === 0) {
    return NextResponse.json({ results: [], usedFeeds: [] });
  }

  // 최대 3개 피드 병렬 요청 (중복 최소화)
  const slugs = Array.from(rssSlugSet).slice(0, 3);
  const feedResults = await Promise.allSettled(slugs.map(fetchRSSFeed));

  // 결과 합치기 + URL 중복 제거
  const seenUrls = new Set<string>();
  const results: SuggestedRef[] = [];

  for (const r of feedResults) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      if (!seenUrls.has(item.sourceUrl) && results.length < 9) {
        seenUrls.add(item.sourceUrl);
        results.push(item);
      }
    }
  }

  return NextResponse.json({ results, usedFeeds: slugs });
}
