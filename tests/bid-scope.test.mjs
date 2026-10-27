import test from 'node:test';
import assert from 'node:assert/strict';
import { gyeongnamScope } from '../lib/bid-scope.ts';
const bid={공고명:'율티 생활돌봄스테이션 실시설계 용역',면허조건:'건축사사무소/4817',지역:'경남',참가가능지역:'경상남도 창원시'};
test('경남 참가 지역과 전국 허용을 발주지와 무관하게 포함',()=>{
 for(const r of ['경상남도','경남','경상남도 김해시','창원시','전국','서울특별시 / 경상남도'])assert.equal(gyeongnamScope({...bid,지역:'서울',참가가능지역:r}),'해당',r);
 for(const r of ['부산광역시','서울특별시','강원특별자치도 고성군'])assert.equal(gyeongnamScope({...bid,참가가능지역:r}),'제외',r);
});
test('감리·CM·전기 단독·시공 공사를 건축설계 목록에서 제외',()=>{
 for(const title of ['청사 건축감리용역','청사 건설사업관리용역','전기설비 설계용역','청사 신축공사'])assert.equal(gyeongnamScope({...bid,공고명:title}),'제외',title);
});
test('빈 지역조건은 참가 가능 확정이 아닌 확인 필요',()=>{
 assert.equal(gyeongnamScope({...bid,참가가능지역:''}),'확인 필요');
 assert.equal(gyeongnamScope({...bid,지역:'서울',참가가능지역:''}),'확인 필요');
});
