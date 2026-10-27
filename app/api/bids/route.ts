import { NextResponse } from 'next/server';
import { loadBidcpSnapshot, BidcpSnapshotError } from '@/lib/bidcp-snapshot';
import { reconcileBidcpFeed } from '@/lib/bidcp-feed';
import { BidFeedError, loadBidFeed } from '@/lib/bid-feed';

export const maxDuration = 60;

export async function GET() {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: '입찰 저장소 연결 설정을 확인해야 합니다.' }, { status: 503 });
  try {
    const bids = await loadBidFeed(token, process.env.BID_DB_ID || '3819ff7b-382c-81c1-85d9-d638e49e9a94');
    return NextResponse.json(reconcileBidcpFeed(bids, Date.now(), await loadBidcpSnapshot(bids, token)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof BidFeedError || error instanceof BidcpSnapshotError ? error : new BidFeedError('입찰 목록을 불러오지 못했습니다.');
    return NextResponse.json({ error: failure.message }, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
