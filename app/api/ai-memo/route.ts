import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUPABASE_HOST = 'bjhvftpxhcotezgxyxzm.supabase.co';

const PROMPT = `이 건축물 이미지를 보고 건축가·건축사사무소 실무자가 레퍼런스로 참고할 수 있는 핵심 특징을 2~3문장으로 간결하게 설명하세요.

포함할 내용: 공간 구성 방식, 재료·마감 특징, 형태 전략, 주목할 설계 요소
언어: 한국어, 전문용어 허용
분량: 50~100자 이내
형식: 문장만 (별도 제목·리스트 없이)`;

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

async function fetchAsBase64(url: string): Promise<{ media_type: MediaType; data: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
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
      const match = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return NextResponse.json({ error: '잘못된 이미지 형식' }, { status: 400 });
      imageSource = { type: 'base64', media_type: match[1] as MediaType, data: match[2] };
    } else if (imageUrl.includes(SUPABASE_HOST)) {
      const fetched = await fetchAsBase64(imageUrl);
      if (!fetched) return NextResponse.json({ error: '이미지 다운로드 실패' }, { status: 400 });
      imageSource = { type: 'base64', ...fetched };
    } else {
      imageSource = { type: 'url', url: imageUrl };
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: imageSource },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const memo = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    if (!memo) return NextResponse.json({ error: 'AI 응답 없음' }, { status: 500 });

    return NextResponse.json({ memo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('credit balance') || msg.includes('billing')) {
      return NextResponse.json({ error: 'AI 크레딧 부족' }, { status: 402 });
    }
    return NextResponse.json({ error: 'AI 메모 생성 실패' }, { status: 500 });
  }
}
