import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBidFeed, mapBidPage } from '../lib/bid-feed.ts';
const page = id => ({id,properties:{공고명:{title:[{plain_text:'건축 '},{text:{content:'설계'}}]}}});
test('긴 공고명을 모두 연결하고 선택 항목이 비어도 읽는다',()=>{
  const b=mapBidPage(page('A'));assert.equal(b.공고명,'건축 설계');assert.equal(b.실제낙찰금액,null);
});
test('모든 페이지를 읽으며 no-store 적용',async()=>{
  const calls=[];
  const rows=await loadBidFeed('test','db',async(_u,options)=>{
    calls.push(options);
    return Response.json(calls.length===1?{results:[page('A')],has_more:true,next_cursor:'next'}:{results:[page('B')],has_more:false});
  });
  assert.equal(rows.length,2);assert.equal(calls[0].cache,'no-store');assert.equal(JSON.parse(calls[1].body).start_cursor,'next');
});
test('오류·인증·한도 응답을 빈 배열로 반환하지 않는다',async()=>{
  for(const status of [401,403,404,429,500])await assert.rejects(loadBidFeed('test','db',async()=>new Response('{}',{status})));
});
test('잘못된 JSON·결과 형식·반복 커서를 실패로 처리',async()=>{
  await assert.rejects(loadBidFeed('test','db',async()=>new Response('not json')));
  await assert.rejects(loadBidFeed('test','db',async()=>Response.json({results:[],has_more:true})));
  await assert.rejects(loadBidFeed('test','db',async()=>Response.json({results:[page('A')],has_more:true,next_cursor:'same'})));
});
test('두 번째 페이지 실패 시 부분 목록을 성공으로 내보내지 않는다',async()=>{
  let n=0;
  await assert.rejects(loadBidFeed('test','db',async()=>++n===1?Response.json({results:[page('A')],has_more:true,next_cursor:'next'}):new Response('{}',{status:503})));
});
test('조회 타임아웃은 504로 전달',async()=>{
  await assert.rejects(loadBidFeed('test','db',async()=>{throw new DOMException('test','TimeoutError')}),error=>error.status===504);
});

test('저장된 공고중 상태는 한국시간 실제 마감으로 보정하고 낙찰·유찰은 유지',()=>{
  const p=page('A');p.properties.상태={select:{name:'공고중'}};p.properties.마감일={date:{start:'2026-10-18'}};
  assert.equal(mapBidPage(p,Date.parse('2026-10-18T20:00:00+09:00')).상태,'공고중');
  assert.equal(mapBidPage(p,Date.parse('2026-10-19T00:00:00+09:00')).상태,'마감');
  p.properties.마감일.date.start='2026-10-18T10:00:00+09:00';
  assert.equal(mapBidPage(p,Date.parse('2026-10-18T10:01:00+09:00')).상태,'마감');
  for(const state of ['낙찰','유찰']){p.properties.상태.select.name=state;assert.equal(mapBidPage(p).상태,'결과확인필요');}
  p.properties.상태.select.name='공고중';p.properties.마감일.date.start='';assert.equal(mapBidPage(p).상태,'공고중');
});

test('구 추천가나 보류 건의 남은 숫자를 웹에 추천으로 노출하지 않음',()=>{
 const p=page('A');p.properties.추천입찰가={number:40000000};p.properties.낙찰하한가={number:39000000};
 const b=mapBidPage(p);assert.equal(b.추천입찰가,null);assert.equal(b.추천상태,'금액 정보 필요');assert.ok(b.추천근거);
});
test('이전 보류 상태를 무시하고 공개 금액과 현재 근거로 재계산한다',()=>{
 const p=page('A');const rich=s=>({rich_text:[{plain_text:s}]});
 Object.assign(p.properties,{가격모델:rich('basis-final-v1'),추천상태:rich('추천 보류'),추천입찰가:{number:1},기초금액:{number:48000000},낙찰하한율:{number:88}});
 const b=mapBidPage(p);assert.ok(b.추천입찰가>40000000);assert.equal(b.가격모델,'bid-guidance-v3');assert.ok(!b.추천상태.includes('보류'));assert.equal(b.기초금액,48000000);
});
test('과거 마감에는 미래 사례를 사용하지 않고 예산과 기초금액을 구분한다',()=>{
 const p=page('A');Object.assign(p.properties,{배정예산:{number:48000000},마감일:{date:{start:'2020-01-01'}}});
 const b=mapBidPage(p);assert.equal(b.가격사례수,0);assert.equal(b.추천입찰가,48000000);assert.match(b.추천근거,/예산 기준 임시/);assert.equal(b.기초금액,null);
});
test('설계공모 용역비는 가격 투찰 추천과 구분한다',()=>{
 const p=page('A');p.properties.공고명={title:[{plain_text:'청사 설계공모'}]};p.properties.배정예산={number:30000000};
 const b=mapBidPage(p);assert.equal(b.공고설계비,30000000);assert.equal(b.추천입찰가,null);assert.equal(b.추천상태,'공고 설계비');
});
test('최종낙찰 출처가 검증된 경우에만 실제낙찰로 노출한다',()=>{
 const p=page('A');const rich=s=>({rich_text:[{plain_text:s}]});
 Object.assign(p.properties,{실제낙찰금액:{number:41674533},실제낙찰률:{number:.88308},낙찰업체:rich('업체'),상태:{select:{name:'낙찰'}}});
 assert.equal(mapBidPage(p).실제낙찰금액,null);assert.equal(mapBidPage(p).낙찰업체,'');assert.equal(mapBidPage(p).기존결과금액,41674533);
 Object.assign(p.properties,{결과확인:rich('최종낙찰 확인'),결과출처:rich('getScsbidListSttusServc')});
 assert.equal(mapBidPage(p).실제낙찰금액,41674533);assert.equal(mapBidPage(p).상태,'낙찰');
});
test('수집기가 새 사례로 계산한 v3 추천은 과거 웹 사례로 덮어쓰지 않는다',()=>{
 const p=page('A');const rich=s=>({rich_text:[{plain_text:s}]});Object.assign(p.properties,{가격모델:rich('bid-guidance-v3'),가격기준시점:rich('2026-10-27'),추천상태:rich('사례 기반 추천'),추천입찰가:{number:42001000},가격사례수:{number:20}});
 const b=mapBidPage(p,Date.parse('2026-10-27T12:00:00+09:00'));assert.equal(b.추천입찰가,42001000);assert.equal(b.가격사례수,20);assert.equal(b.사례자료기준,'수집기 갱신 자료');
});
