import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { Reference } from '@/lib/types';

const ALERT_EMAIL = 'soggon@naver.com';
const ALERT_DAYS = [1, 3, 7]; // D-day 이 일수 남았을 때 알림

function getDDay(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const deadline = new Date(m[1]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function formatDate(str?: string) {
  if (!str) return '';
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}년 ${parseInt(m[2])}월 ${parseInt(m[3])}일` : str;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRef(row: any): Reference {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url ?? '',
    sourceUrl: row.source_url ?? undefined,
    refType: row.ref_type ?? undefined,
    architect: row.architect ?? undefined,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags ?? { program: [], material: [], mass: [], scale: '', designItem: [], site: [], region: '' },
    collectionIds: row.collection_ids ?? [],
    createdAt: row.created_at,
    competitionData: row.competition_data ?? undefined,
  };
}

export async function GET(req: Request) {
  // Vercel Cron 보안: Authorization 헤더 확인
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from('refs')
    .select('*')
    .not('competition_data', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const refs = (data ?? []).map(toRef);
  const activeStatuses = ['관심', '등록예정', '등록완료', '작업중'];

  const alerts = refs.filter(r => {
    if (!r.competitionData) return false;
    if (!activeStatuses.includes(r.competitionData.status)) return false;
    const dday = getDDay(r.competitionData.submissionDate);
    return dday !== null && ALERT_DAYS.includes(dday);
  });

  if (alerts.length === 0) {
    return NextResponse.json({ sent: 0, message: '알림 대상 없음' });
  }

  const rows = alerts.map(r => {
    const cd = r.competitionData!;
    const dday = getDDay(cd.submissionDate)!;
    return `
      <tr style="border-bottom: 1px solid #f4f4f5;">
        <td style="padding: 10px 8px;">
          <a href="${r.sourceUrl || '#'}" style="color:#18181b;font-weight:600;text-decoration:none;">${r.title}</a>
          ${r.architect ? `<br><span style="color:#a1a1aa;font-size:12px;">${r.architect}</span>` : ''}
        </td>
        <td style="padding: 10px 8px; white-space:nowrap;">
          <span style="background:${dday <= 1 ? '#ef4444' : dday <= 3 ? '#f97316' : '#3b82f6'};color:#fff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">
            D-${dday}
          </span>
        </td>
        <td style="padding: 10px 8px; color:#71717a; font-size:13px; white-space:nowrap;">${formatDate(cd.submissionDate)}</td>
        <td style="padding: 10px 8px; color:#71717a; font-size:13px; white-space:nowrap;">${cd.designFee || '-'}</td>
        <td style="padding: 10px 8px;">
          <span style="background:#f4f4f5;color:#52525b;padding:2px 8px;border-radius:6px;font-size:12px;">${cd.status}</span>
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <div style="background:#18181b;padding:20px 24px;">
        <h1 style="color:#fff;font-size:18px;margin:0;">🏆 공모전 마감 알림</h1>
        <p style="color:#a1a1aa;margin:4px 0 0;font-size:13px;">마감이 임박한 공모전 ${alerts.length}건</p>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid #f4f4f5;">
              <th style="text-align:left;padding:8px;font-size:12px;color:#71717a;font-weight:600;">공모전</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:#71717a;font-weight:600;">D-day</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:#71717a;font-weight:600;">마감일</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:#71717a;font-weight:600;">설계비</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:#71717a;font-weight:600;">상태</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:20px;text-align:center;">
          <a href="https://arch-reference.vercel.app/competitions"
            style="background:#18181b;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
            공모전 트래커 열기
          </a>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f4f4f5;text-align:center;">
        <p style="color:#a1a1aa;font-size:12px;margin:0;">Arch Reference · arch-reference.vercel.app</p>
      </div>
    </div>`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailError } = await resend.emails.send({
    from: 'Arch Reference <onboarding@resend.dev>',
    to: ALERT_EMAIL,
    subject: `[공모전 알림] 마감 임박 ${alerts.length}건`,
    html,
  });

  if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 });

  return NextResponse.json({ sent: alerts.length, competitions: alerts.map(r => r.title) });
}
