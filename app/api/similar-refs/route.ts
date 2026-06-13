import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export interface SimilarRef {
  title: string;
  imageUrl: string;
  url: string;
  architect: string;
}

export interface SimilarRefsResult {
  query: string;
  queryKo: string;
  keywords: string[];
  archdailyUrl: string;
  refs: SimilarRef[];
}

async function analyzeImage(
  base64: string,
  mediaType: string,
  title: string,
): Promise<{ queryEn: string; queryKo: string; keywords: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다 (.env.local 확인)');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Korean architectural competition entry: "${title}"\nAnalyze this building image. Return ONLY JSON (no markdown):\n{"queryEn":"2-4 word English Archdaily search query","queryKo":"2-4단어 한글 설명","keywords":["en1","en2","en3"]}\nFocus on building type, spatial organization, materials.\nExample: {"queryEn":"community center courtyard concrete","queryKo":"지역사회 중정형 콘크리트","keywords":["community center","courtyard","concrete"]}`,
          },
        ],
      }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text || '{}';

  try {
    const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      queryEn: (parsed.queryEn as string) || title,
      queryKo: (parsed.queryKo as string) || '',
      keywords: (parsed.keywords as string[]) || [],
    };
  } catch {
    return { queryEn: title, queryKo: '', keywords: [] };
  }
}

async function searchArchdaily(query: string): Promise<SimilarRef[]> {
  try {
    const searchUrl = `https://www.archdaily.com/search/projects?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SimilarRef[] = [];

    // Try __NEXT_DATA__ (Next.js initial state)
    const nextDataEl = $('#__NEXT_DATA__').html();
    if (nextDataEl) {
      try {
        const nextData = JSON.parse(nextDataEl);
        const projects: Record<string, unknown>[] =
          nextData?.props?.pageProps?.initialSearchResults?.results ||
          nextData?.props?.pageProps?.results ||
          [];
        for (const p of projects.slice(0, 6)) {
          const pUrl = String(p.url || p.link || '');
          const pTitle = String(p.title || p.name || '');
          if (!pTitle || !pUrl) continue;
          const imgObj = p.image as Record<string, string> | null;
          results.push({
            title: pTitle,
            imageUrl: imgObj?.url || imgObj?.thumb || String(p.thumbnail || ''),
            url: pUrl.startsWith('http') ? pUrl : `https://www.archdaily.com${pUrl}`,
            architect: String((p as Record<string, unknown>).office_title || (p as Record<string, unknown>).architect || ''),
          });
        }
      } catch { /* continue */ }
    }

    // Fallback: HTML element parsing
    if (results.length === 0) {
      $('article, [class*="search-result"] li').each((_, el) => {
        if (results.length >= 6) return false;
        const $el = $(el);
        const link = $el.find('a[href]').first();
        const href = link.attr('href') || '';
        const title = ($el.find('h2, h3, [class*="title"]').first().text() || link.attr('title') || '').trim();
        const img = $el.find('img').first();
        const imgSrc = img.attr('src') || img.attr('data-src') || img.attr('data-lazy') || '';
        const architect = $el.find('[class*="office"], [class*="architect"]').first().text().trim();

        const fullUrl = href.startsWith('http') ? href : `https://www.archdaily.com${href}`;
        if (title && fullUrl.includes('archdaily.com/')) {
          results.push({ title, imageUrl: imgSrc, url: fullUrl, architect });
        }
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const imageUrl = req.nextUrl.searchParams.get('imageUrl') || '';
  const title    = req.nextUrl.searchParams.get('title')    || '';

  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  try {
    // 1. 서울시 이미지 프록시 가져오기
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Referer': 'https://project.seoul.go.kr/',
        'Origin':  'https://project.seoul.go.kr',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!imgRes.ok) throw new Error(`이미지 로드 실패 (${imgRes.status})`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const mediaType = contentType.includes('png')  ? 'image/png'  :
                     contentType.includes('gif')  ? 'image/gif'  :
                     contentType.includes('webp') ? 'image/webp' : 'image/jpeg';

    const imgBuffer = await imgRes.arrayBuffer();
    if (imgBuffer.byteLength > 4_000_000) throw new Error('이미지가 너무 큽니다 (4MB 초과)');

    const base64 = Buffer.from(imgBuffer).toString('base64');

    // 2. Claude Vision 분석
    const vision = await analyzeImage(base64, mediaType as Parameters<typeof analyzeImage>[1], title);

    // 3. Archdaily 검색
    const query = vision.queryEn;
    const refs  = await searchArchdaily(query);

    return NextResponse.json({
      query,
      queryKo:      vision.queryKo,
      keywords:     vision.keywords,
      archdailyUrl: `https://www.archdaily.com/search/projects?q=${encodeURIComponent(query)}`,
      refs,
    } satisfies SimilarRefsResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '분석 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
