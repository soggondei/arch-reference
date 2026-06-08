import { Reference } from './types';

type MultiTagField = 'program' | 'material' | 'mass' | 'designItem' | 'site';
type SingleTagField = 'scale' | 'region';

interface SuggestedTags {
  program: string[];
  material: string[];
  mass: string[];
  designItem: string[];
  site: string[];
  scale: string;
  region: string;
}

// 각 태그 값에 매핑되는 키워드 (영어/한국어 혼용)
const KEYWORD_MAP: Record<MultiTagField, Record<string, string[]>> = {
  program: {
    '주거': ['residential', 'housing', 'house', 'apartment', 'villa', 'condominium', 'dwelling',
             '주거', '주택', '아파트', '단독주택', '공동주택', '빌라', '집', 'home', 'homes',
             'multi-family', 'single-family', 'townhouse', 'cottage'],
    '상업': ['commercial', 'retail', 'shop', 'store', 'restaurant', 'café', 'cafe', 'hotel',
             '상업', '상가', '음식점', '카페', '호텔', '쇼핑', 'shopping', 'market', 'mall',
             'boutique', 'showroom'],
    '업무': ['office', 'workplace', 'corporate', 'headquarters', 'coworking',
             '사무', '업무', '오피스', '사무소', '사옥'],
    '문화': ['museum', 'gallery', 'cultural', 'theater', 'theatre', 'concert', 'arts',
             '박물관', '미술관', '갤러리', '문화', '극장', '공연', 'pavilion', 'exhibition',
             'cultural center', 'performing arts'],
    '교육': ['school', 'university', 'education', 'library', 'campus', 'kindergarten',
             '학교', '대학', '교육', '도서관', '유치원', '초등', '중학', '고등', '어린이집',
             'college', 'academy', 'institute'],
    '의료': ['hospital', 'clinic', 'medical', 'healthcare', 'health', 'wellness',
             '병원', '의료', '클리닉', '보건', '요양'],
    '종교': ['church', 'temple', 'mosque', 'chapel', 'religious', 'cathedral', 'shrine',
             '교회', '성당', '사원', '종교', '절', '법당', '신사', '성원'],
    '공공': ['civic', 'public', 'government', 'community', 'city hall', 'town hall',
             '공공', '시청', '관공서', '주민', '커뮤니티', '공원', 'park', 'plaza', 'square'],
    '복합': ['mixed-use', 'mixed use', 'multi-use', 'multipurpose',
             '복합', '복합용도', '복합시설'],
    '산업': ['industrial', 'factory', 'warehouse', 'manufacturing', 'logistics', 'production',
             '공장', '산업', '창고', '물류', '제조'],
  },

  material: {
    '콘크리트': ['concrete', 'cement', 'in-situ', 'precast', '콘크리트', '시멘트', '노출콘크리트',
                'exposed concrete', 'fair-faced'],
    '목재': ['wood', 'timber', 'lumber', 'wooden', 'cross-laminated', 'clt', 'glulam',
             '목재', '나무', '원목', '합판', '목구조'],
    '강재': ['steel', 'structural steel', 'iron', 'corten', 'cor-ten', 'weathering steel',
             '강재', '철골', '스틸', '내후성강'],
    '유리': ['glass', 'glazing', 'transparent', 'curtain wall', 'facade glass',
             '유리', '글라스', '커튼월'],
    '벽돌': ['brick', 'masonry', 'clinker', '벽돌', '클링커', '조적'],
    '석재': ['stone', 'marble', 'granite', 'limestone', 'travertine', 'slate',
             '석재', '대리석', '화강암', '돌'],
    '복합패널': ['panel', 'cladding', 'composite', 'aluminium panel', 'aluminum panel', 'acm',
                '패널', '복합패널', '클래딩', '알루미늄패널'],
    '테라코타': ['terracotta', 'terra cotta', 'ceramic', 'porcelain', 'fired clay',
                '테라코타', '세라믹', '도자'],
    '금속': ['metal', 'aluminum', 'aluminium', 'copper', 'zinc', 'titanium', 'brass',
             '금속', '알루미늄', '구리', '아연', '티타늄'],
    '타일': ['tile', 'mosaic', 'tiling', '타일', '모자이크'],
  },

  mass: {
    '단순박스': ['simple volume', 'box', 'rectangular', 'simple form', 'pure form',
                '단순', '박스형', '직육면체'],
    '복합매스': ['complex volume', 'multiple volumes', 'stacked', 'interlocking',
                '복합매스', '복합볼륨', '적층'],
    'L형': ['l-shaped', 'l shape', 'l-form', 'wing', 'l-plan', 'l plan'],
    'U형': ['u-shaped', 'u-shape', 'u-form', 'horseshoe', 'u-plan'],
    '코트야드형': ['courtyard', 'court yard', 'atrium', 'inner court', 'patio',
                 '코트야드', '중정', '아트리움'],
    '분절형': ['fragmented', 'segmented', 'pavilions', 'scattered', 'cluster',
              '분절', '분산', '클러스터'],
    '선형': ['linear', 'elongated', 'ribbon', 'bar', 'strip', '선형'],
    '원형': ['circular', 'round', 'cylinder', 'cylindrical', 'rotunda', 'dome',
             '원형', '원통', '돔'],
    '비정형': ['irregular', 'organic', 'curved', 'flowing', 'parametric', 'blob',
              '비정형', '유기적', '곡선'],
  },

  designItem: {
    '파사드': ['facade', 'façade', 'elevation', 'skin', 'envelope', 'cladding',
              '파사드', '외피', '입면'],
    '입면패턴': ['pattern', 'perforation', 'perforated', 'screen', 'lattice', 'brise soleil',
               '패턴', '루버', '격자'],
    '코어': ['core', 'circulation core', 'service core', '코어', '계단코어'],
    '평면': ['floor plan', 'plan', 'layout', 'floorplan', '평면', '플랜'],
    '단면': ['section', 'cross section', 'vertical circulation', '단면', '섹션'],
    '구조': ['structure', 'structural', 'column', 'beam', 'truss', 'arch',
             '구조', '기둥', '보', '트러스'],
    '조경': ['landscape', 'garden', 'outdoor', 'planting', 'greenery',
             '조경', '정원', '녹지', '외부공간'],
    '디테일': ['detail', 'junction', 'connection', 'joint', 'node',
              '디테일', '접합', '이음'],
    '계단': ['staircase', 'stair', 'steps', 'ramp', '계단', '경사로'],
    '브리지': ['bridge', 'walkway', 'passage', 'sky bridge', 'connector',
              '브리지', '통로', '연결'],
  },

  site: {
    '도심': ['urban', 'city center', 'downtown', 'metropolitan', 'dense',
             '도심', '도시', '시내', '중심'],
    '코너': ['corner', 'corner lot', 'intersection', '코너', '모퉁이', '교차'],
    '경사지': ['hillside', 'slope', 'sloped', 'topography', 'terrain', 'hill',
              '경사', '언덕', '비탈'],
    '수변': ['waterfront', 'riverside', 'lakeside', 'seaside', 'waterside', 'harbour',
             '수변', '강변', '해변', '수변', '호수'],
    '교외': ['suburban', 'suburb', 'rural-urban', 'outskirts', '교외', '외곽'],
    '자연': ['rural', 'nature', 'forest', 'landscape', 'countryside', 'mountain',
             '자연', '숲', '산', '전원'],
  },
};

const REGION_MAP: Record<string, string[]> = {
  '서울': ['seoul', '서울'],
  '수도권': ['gyeonggi', 'incheon', 'suwon', 'seongnam', 'yongin', 'bucheon',
             '경기', '인천', '수원', '성남', '용인', '부천', '안성', '화성',
             '평택', '시흥', '고양', '파주', '김포', '의정부', '수도권'],
  '충청': ['daejeon', 'cheongju', 'chungnam', 'chungbuk', 'sejong',
           '대전', '청주', '충청', '충남', '충북', '세종', '충주', '천안',
           '아산', '공주', '논산', '서산', '당진', '보령', '제천', '음성'],
  '호남': ['gwangju', 'jeonju', 'jeonnam', 'jeonbuk',
           '광주', '전주', '전라', '전남', '전북', '목포', '순천', '여수',
           '나주', '익산', '군산', '완주'],
  '영남': ['busan', 'daegu', 'ulsan', 'gyeongnam', 'gyeongbuk', 'pohang',
           '부산', '대구', '울산', '경상', '경남', '경북', '포항', '구미',
           '경주', '창원', '진주', '김해', '양산', '거제', '통영', '영도'],
  '강원': ['gangwon', 'gangneung', '춘천', '강릉', '강원', '원주', '속초',
           '삼척', '동해', '태백', '횡성'],
  '제주': ['jeju', '제주'],
};

const SCALE_MAP: Record<string, string[]> = {
  '소규모 (<500㎡)': ['small', 'tiny', 'micro', 'compact', 'small-scale',
                    '소규모', '소형', '작은'],
  '중규모 (500~3,000㎡)': ['medium', 'mid-size', '중규모', '중형'],
  '대규모 (3,000㎡+)': ['large', 'large-scale', 'major', 'massive', 'extensive',
                       '대규모', '대형', '초대형'],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[-_]/g, ' ');
}

function matchKeywords(text: string, keywords: string[]): boolean {
  const t = normalize(text);
  return keywords.some(kw => t.includes(normalize(kw)));
}

export function autoTag(
  title: string,
  description: string,
  extraKeywords: string[] = [],
  location: string = '',
): SuggestedTags {
  const fullText = [title, description, ...extraKeywords, location].join(' ');

  const result: SuggestedTags = {
    program: [],
    material: [],
    mass: [],
    designItem: [],
    site: [],
    scale: '',
    region: '',
  };

  // 다중 선택 태그
  const multiFields: MultiTagField[] = ['program', 'material', 'mass', 'designItem', 'site'];
  for (const field of multiFields) {
    for (const [tag, keywords] of Object.entries(KEYWORD_MAP[field])) {
      if (matchKeywords(fullText, keywords)) {
        result[field].push(tag);
      }
    }
  }

  // 지역 (단일)
  for (const [region, keywords] of Object.entries(REGION_MAP)) {
    if (matchKeywords(fullText, keywords)) {
      result.region = region;
      break;
    }
  }
  if (!result.region && fullText) {
    // 위치 문자열에 한글이 없을 때만 해외로 분류 (한글 주소 = 국내)
    const locationHasKorean = /[가-힣]/.test(location);
    if (!locationHasKorean) {
      result.region = '해외';
    }
  }

  // 규모 (단일)
  for (const [scale, keywords] of Object.entries(SCALE_MAP)) {
    if (matchKeywords(fullText, keywords)) {
      result.scale = scale;
      break;
    }
  }

  return result;
}

export type { SuggestedTags };
