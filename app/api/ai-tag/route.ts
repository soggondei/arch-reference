import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUPABASE_HOST = 'bjhvftpxhcotezgxyxzm.supabase.co';

const PROMPT = `당신은 건축 이미지를 분석하는 전문가입니다. 주어진 건축물 이미지를 보고 아래 태그 목록에서 해당하는 항목을 선택해 JSON으로 반환하세요.

태그 목록:
- program (건물 용도, 복수 선택 가능): 주거, 상업, 업무, 문화, 교육, 의료, 종교, 산업, 복합, 공공
- material (주요 재료, 복수 선택 가능): 콘크리트, 목재, 강재, 유리, 벽돌, 석재, 복합패널, 테라코타, 금속, 타일
- mass (매스/형태, 복수 선택 가능): 단순박스, 복합매스, L형, U형, 코트야드형, 분절형, 선형, 원형, 비정형
- scale (규모, 1개만): 소규모 (<500㎡), 중규모 (500~3,000㎡), 대규모 (3,000㎡+)
- designItem (주목할 설계 요소, 복수 선택 가능): 파사드, 입면패턴, 코어, 평면, 단면, 구조, 조경, 디테일, 계단, 브리지
- site (대지 조건, 복수 선택 가능): 도심, 코너, 경사지, 수변, 교외, 자연
- region (지역, 1개만): 서울, 수도권, 충청, 호남, 영남, 강원, 제주, 해외

규칙:
- 이미지에서 명확히 확인되는 것만 선택 (불확실하면 제외)
- scale과 region은 문자열(string), 나머지는 배열(array)
- 빈 배열 또는 빈 문자열로 두어도 됨
- 건축물 이미지가 아니면 모든 필드를 빈값으로 반환

반드시 아래 JSON 형식으로만 응답하세요 (추가 텍스트 없이):
{"program":[],"material":[],"mass":[],"scale":"","designItem":[],"site":[],"region":""}`;

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

async function fetchAsBase64(url: string): Promise<{ media_type: MediaType; data: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const media_type = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)
      ? contentType : 'image/jpeg') as MediaType;
    const buffer = await res.arrayBuffer();
    return { media_type, data: Buffer.from(buffer).toString('base64') };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = await req.json() as { imageUrl?: string };
    if (!imageUrl) return NextResponse.json({ error: '이미지 URL 필요' }, { status: 400 });

    type ImageSource =
      | { type: 'base64'; media_type: MediaType; data: string }
      | { type: 'url'; url: string };

    let imageSource: ImageSource;

    if (imageUrl.startsWith('data:image/')) {
      // 파일 업로드 (base64 data URL)
      const match = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return NextResponse.json({ error: '잘못된 이미지 형식' }, { status: 400 });
      imageSource = { type: 'base64', media_type: match[1] as MediaType, data: match[2] };

    } else if (imageUrl.includes(SUPABASE_HOST)) {
      // Supabase 저장소 이미지: 서버사이드 fetch (항상 접근 가능)
      const fetched = await fetchAsBase64(imageUrl);
      if (!fetched) return NextResponse.json({ error: '이미지 다운로드 실패' }, { status: 400 });
      imageSource = { type: 'base64', ...fetched };

    } else {
      // 외부 URL: Claude API에 URL을 직접 전달 (Anthropic 서버가 fetch)
      imageSource = { type: 'url', url: imageUrl };
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: imageSource },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });

    const tags = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestedTags: tags });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-tag]', msg);
    if (msg.includes('credit balance') || msg.includes('billing')) {
      return NextResponse.json({ error: 'AI API 크레딧이 부족합니다. console.anthropic.com에서 충전해 주세요.' }, { status: 402 });
    }
    if (msg.includes('Could not download') || msg.includes('Unable to download') || msg.includes('could not be loaded') || msg.includes('invalid image')) {
      return NextResponse.json({ error: '이미지에 접근할 수 없습니다. 파일을 직접 업로드해 주세요.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'AI 태깅 실패' }, { status: 500 });
  }
}
