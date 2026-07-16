import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const program = searchParams.get('program')?.split(',').filter(Boolean) ?? [];
  const material = searchParams.get('material')?.split(',').filter(Boolean) ?? [];
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '6'), 12);

  if (program.length === 0 && material.length === 0) {
    return NextResponse.json({ refs: [] });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from('refs')
    .select('id, title, image_url, source_url, architect, year, tags, ref_type')
    .is('competition_data', null)
    .neq('ref_type', 'link')
    .not('image_url', 'is', null)
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = { id: string; title: string; image_url: string; source_url: string | null; architect: string | null; year: number | null; tags: Record<string, string[]>; ref_type: string | null };

  function score(row: Row): number {
    let s = 0;
    const tags = row.tags ?? {};
    const prog: string[] = Array.isArray(tags.program) ? tags.program : [];
    const mat: string[] = Array.isArray(tags.material) ? tags.material : [];
    for (const p of program) if (prog.includes(p)) s += 4;
    for (const m of material) if (mat.includes(m)) s += 3;
    return s;
  }

  const scored = (data ?? [] as Row[])
    .map(r => ({ ...r, _score: score(r) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  const refs = scored.map(r => ({
    id: r.id,
    title: r.title,
    imageUrl: r.image_url,
    sourceUrl: r.source_url,
    architect: r.architect,
    year: r.year,
    tags: r.tags,
    url: `https://arch-reference.vercel.app/reference/${r.id}`,
  }));

  return NextResponse.json({ refs }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
