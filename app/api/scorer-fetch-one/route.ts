import { NextRequest, NextResponse } from 'next/server';
import { CompetitionData } from '@/lib/types';

function parseDtDd(html: string): Map<string, string> {
  const result = new Map<string, string>();
  const re = /<dt>([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    const raw = m[2];
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

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  const scorerMatch = url.match(/scorer\.co\.kr\/competition\/(\d+)/);
  if (!scorerMatch) return NextResponse.json({ error: 'Not a scorer URL' }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });

    const html = await res.text();
    const fields = parseDtDd(html);

    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] || '';
    const clientM = ogDesc.match(/발주처\s*:\s*([^,]+)/);
    const architect = clientM ? clientM[1].trim() : '';

    const floorAreaText = fields.get('연면적') || '';
    const floorAreaM = floorAreaText.match(/([\d,]+(?:\.\d+)?)\s*㎡/);
    const floorArea = floorAreaM ? parseFloat(floorAreaM[1].replace(/,/g, '')) : 0;

    const designFee = fields.get('설계비') || '';
    const designFeeM = designFee.match(/([\d,.]+)억/);
    const designFeeAmount = designFeeM ? parseFloat(designFeeM[1].replace(/,/g, '')) : undefined;

    const competitionData: Partial<CompetitionData> = {
      announcementDate: fields.get('공고일') || undefined,
      registrationDate: fields.get('참가등록일') || undefined,
      submissionDate: fields.get('작품접수일') || undefined,
      resultDate: fields.get('당선작 발표일') || undefined,
      floorAreaText: floorAreaText || undefined,
      floorArea: floorArea || undefined,
      designFee: designFee || undefined,
      designFeeAmount,
      constructionCost: fields.get('공사비') || undefined,
      location: fields.get('위치') || (ogDesc.match(/위치\s*:\s*([^,]+)/)?.[1]?.trim() || undefined),
    };

    return NextResponse.json({ competitionData, architect });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '실패' }, { status: 500 });
  }
}
