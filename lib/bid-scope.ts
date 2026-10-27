type ScopeBid = { 공고명: string; 지역: string; 면허조건?: string; 참가가능지역?: string; 업무분류?: string; 공고업종?: string; 필터근거?: string };
const local = /^(경상남도|경남)(?:$|[가-힣]+[시군]$)|^(창원(?:특례)?시|마산시|진해시|김해시|진주시|양산시|거제시|통영시|사천시|밀양시|거창군|함양군|산청군|합천군|의령군|함안군|창녕군|남해군|하동군)$/;
export function isArchitectureDesign(bid: ScopeBid): boolean {
  // 업종 건축설계는 감리·기획 등을 포함한다. 공고 업종·면허 근거가 제목 추정보다 우선한다.
  if ((bid.공고업종 || '').split(/[,/]/).some(x => x.trim() === '건축설계') || /건축사사무소|4817/.test(bid.면허조건 || '')) return true;
  if (bid.업무분류) return bid.업무분류 === '건축설계';
  const title = bid.공고명.replace(/\s/g, '');
  if (/감리|건설사업관리|안전진단|설계의경제성|설계검토|설계VE/.test(title) || !/설계/.test(title)) return false;
  const architect = /건축사|4817/.test(bid.면허조건 || '');
  const building = /건축|학교|청사|도서관|경로당|복지관|리모델링|급식소|내진보강|외벽|화장실|창호|천장|옥상방수/.test(title);
  if (!architect && !building) return false;
  if (!/건축/.test(title) && /(전기|기계|소방|통신|토목|조경)(공사|설비|설계|감리|시설)/.test(title)) return false;
  return true;
}
export function gyeongnamScope(bid: ScopeBid): '해당' | '확인 필요' | '제외' {
  // 비교 사이트의 필터 결과 소속이며, 사무소의 참가자격 확정을 뜻하지 않는다.
  if (bid.필터근거 === '창원상공회의소 건축설계·경상남도 목록') return '해당';
  if (!isArchitectureDesign(bid)) return '제외';
  const regions = (bid.참가가능지역 || '').replace(/\s/g, '');
  const names = regions.split(/\s*[/,|]\s*|또는/);
  if (names.some(name => ['전국', '지역제한없음'].includes(name) || local.test(name))) return '해당';
  if (regions === '고성군') return '확인 필요'; // 강원 고성과 경남 고성을 구분할 자료가 필요하다.
  if (regions) return '제외';
  // 발주지역만으로 전국 허용 후보를 제거하지 않는다. 기존 자료는 별도 검토 상태로 보존한다.
  return '확인 필요';
}
