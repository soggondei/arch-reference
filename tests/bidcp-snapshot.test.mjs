import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../lib/bidcp-baseline.json' with {type:'json'};
import {loadBidcpSnapshot} from '../lib/bidcp-snapshot.ts';
import {reconcileBidcpFeed} from '../lib/bidcp-feed.ts';
import store from '../lib/bidcp-store.cjs';
const snapshot={...baseline,version:1,total:baseline.entries.length};
const payload=JSON.stringify(snapshot);
const manifest={version:1,pageId:'12345678-1234-1234-1234-123456789abc',sha256:store.digest(payload),total:253,checkedAt:'2026-10-28T01:00:00.000Z'};
const rows=[{id:'marker',공고번호:store.MARKER,공고기관:JSON.stringify(manifest)}];
test('검증한 스냅샷을 읽고 확인일·자동 동기화 상태를 표시한다',async()=>{
 const source=await loadBidcpSnapshot(rows,'test',async()=>Response.json({results:store.encodeBlocks(payload),has_more:false}));
 const bids=reconcileBidcpFeed(rows,Date.parse('2026-10-28T02:00:00Z'),source);
 assert.equal(bids.length,253);assert.equal(bids[0].상공회의소수집방식,'자동 동기화');assert.equal(bids[0].자료확인일,manifest.checkedAt);assert.ok(!bids.some(x=>x.공고번호===store.MARKER));
});
test('해시 불일치·누락 블록은 조용한 부분 결과로 표시하지 않는다',async()=>{
 await assert.rejects(()=>loadBidcpSnapshot(rows,'test',async()=>Response.json({results:[],has_more:false})),/검증/);
 await assert.rejects(()=>loadBidcpSnapshot(rows,'test',async()=>Response.json({results:store.encodeBlocks(payload),has_more:true})),/검증/);
});
test('신규·취소·삭제된 원본 목록을 고정 253건으로 덮어쓰지 않는다',()=>{
 const extra={...snapshot.entries[0],sourceId:'261028000000001-00-00-01',공고번호:'NEW',출처URL:'https://changwon.bidcp.net/bids/bid/detail/261028000000001-00-00-01'};
 const live={...snapshot,total:2,entries:[{...snapshot.entries[0],상태표시:'취소'},extra]};
 const bids=reconcileBidcpFeed([],Date.parse('2026-10-28T02:00:00Z'),live);assert.equal(bids.length,2);assert.equal(bids.find(x=>x.공고번호===snapshot.entries[0].공고번호).추천입찰가,null);assert.ok(bids.some(x=>x.공고번호==='NEW'));
});
test('최근 G2B 저장이 있어도 상공회의소의 취소 이력은 취소로 유지한다',()=>{
 const s=snapshot.entries[0],old={id:'a',공고번호:s.공고번호,공고차수:s.공고차수,상태:'공고중',저장갱신일:'2026-10-29T01:00:00Z',기초금액:s.기초금액};
 const bids=reconcileBidcpFeed([old],Date.parse('2026-10-28T02:00:00Z'),{...snapshot,total:1,entries:[{...s,상태표시:'취소'}]});
 assert.equal(bids[0].상태,'취소');assert.equal(bids[0].추천입찰가,null);
});
