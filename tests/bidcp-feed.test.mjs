import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBidcpFeed} from '../lib/bidcp-feed.ts';
import {gyeongnamScope} from '../lib/bid-scope.ts';
import data from '../lib/bidcp-baseline.json' with {type:'json'};
const now=Date.parse('2026-10-27T19:00:00+09:00');
test('기준 사이트 253개 항목과 취소·재입찰·타 조달번호를 모두 보존한다',()=>{
 const rows=reconcileBidcpFeed([],now);assert.equal(rows.length,253);assert.equal(new Set(rows.map(r=>r.id)).size,253);
 assert.ok(rows.every(r=>gyeongnamScope(r)==='해당'));
 assert.equal(rows.filter(r=>r.상태==='취소').length,38);
 assert.equal(rows.filter(r=>r.공고번호==='R26BK01742708').length,2);
 assert.ok(rows.some(r=>r.공고번호==='B5202603096'));
 const expected=data.entries.map(r=>r.sourceId).sort();assert.deepEqual(rows.map(r=>r.기준사이트ID).sort(),expected);
});
test('창원 신규 공고의 부가세 포함 기초금액과 하한율을 연결하고 추천한다',()=>{
 const b=reconcileBidcpFeed([],now).find(r=>r.공고번호==='R26BK01790350');
 assert.equal(b.기초금액,28036800);assert.equal(b.낙찰하한율,88);assert.equal(b.참가가능지역,'경상남도 창원시');assert.equal(b.상태,'공고중');assert.ok(b.추천입찰가>24000000&&b.추천입찰가<26000000);assert.match(b.참가검토,/공동도급 불가/);
 const rows=reconcileBidcpFeed([],now);const parking=rows.find(b=>b.공고번호==='R26BK01793227');assert.equal(parking.추천입찰가,85272000);assert.match(parking.참가검토,/구성원도 적용/);
 assert.equal(rows.find(b=>b.공고번호==='R26BK01792230').추천입찰가,58960000);
});
test('취소 이력은 공고중이나 유효 추천으로 표시하지 않는다',()=>{
 for(const b of reconcileBidcpFeed([],now).filter(b=>b.상태==='취소')){assert.equal(b.추천입찰가,null);assert.equal(b.추천상태,'취소 공고');}
});
test('기존 공고는 중복 추가하지 않으며 이후 정기 수집의 수정은 보존한다',()=>{
 const old={id:'p1',공고번호:'R26BK01790350',공고차수:'000',공고일:'2026-10-26',저장갱신일:'2026-10-28T10:00:00+09:00',상태:'취소',기초금액:27000000,가격모델:'bid-guidance-v3',추천입찰가:24500000};
 const rows=reconcileBidcpFeed([old],now);assert.equal(rows.length,253);const b=rows.find(b=>b.공고번호===old.공고번호);assert.equal(b.기초금액,27000000);assert.equal(b.상태,'취소');assert.equal(b.추천입찰가,null);assert.equal(b.정기수집최근일,'2026-10-26');
 const q={id:'new',공고번호:'NEW',공고일:'2026-10-28'};assert.equal(reconcileBidcpFeed([old,q],now).length,254);
});
