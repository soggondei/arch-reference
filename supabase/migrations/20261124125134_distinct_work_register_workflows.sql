-- Built-in case workflows. Owner templates and the special-building legal references are independent.
with definitions as (
  select key as id, value as body from jsonb_each($workflows$
{
  "office1": {
    "name": "건축허가",
    "order": "21",
    "description": "대지·법규 검토부터 건축허가서 수령과 조건 인계까지 관리합니다.",
    "special": false,
    "stages": ["상담","허가 대상·대지 검토","허가 도서 작성","건축허가 접수","관계부서 협의","보완 대응","허가서·조건 확인","허가 결과 인계","착공신고","공사 중 변경 검토","사용승인 신청","사용승인 확인","준공 자료 인계"],
    "terminal": ["허가 결과 인계","준공 자료 인계"],
    "events": ["상담","대지·법규 검토","도서 검토","건축허가 접수","관계부서 회신","보완 요청·회신","허가 통지","결과 인계","착공신고","공사 중 변경","사용승인 접수·회신","준공 인계"],
    "checks": [
      {"id":"permit-check-site","name":"대지 범위와 권원","source":"실무 자료"},
      {"id":"permit-check-zone","name":"지역·지구 및 행위 제한","source":"실무 자료"},
      {"id":"permit-check-layout","name":"건축 규모·배치와 접도","source":"실무 자료"},
      {"id":"permit-check-consult","name":"관계부서 협의 대상","source":"실무 자료","hint":"심의·의제 협의 적용 여부와 필요한 선행 절차를 확인합니다."},
      {"id":"permit-check-legal","name":"허가 대상 행위와 규모 산정","source":"실무 자료","hint":"건축행위, 대지와 기존 건축물 현황에 따라 허가 대상을 확인합니다."},
      {"id":"permit-check-safe","name":"주차·피난·방화·구조 등 적용 기준","source":"실무 자료"},
      {"id":"permit-check-decision","name":"허가 조건과 후속 이행사항","source":"실무 자료"},
      {"id":"permit-check-occupancy","name":"착공·사용승인 준비와 설계변경 이력","source":"실무 자료","hint":"계약 범위에서 담당하는 후속 업무를 확인합니다.","routes":["착공·사용승인 업무 포함"]}
    ],
    "docs": [
      {"id":"permit-doc-owner","name":"위임·권원 자료","source":"실무 자료"},
      {"id":"permit-doc-site","name":"토지·건축물대장 및 현황 자료","source":"실무 자료"},
      {"id":"permit-doc-filing","name":"건축허가신청서·설계도서","source":"실무 자료","hint":"허가신청서와 해당 설계도서를 연결합니다."},
      {"id":"permit-doc-review","name":"관계부서 회신·보완 도서","source":"실무 자료"},
      {"id":"permit-doc-result","name":"건축허가서·허가 조건","source":"실무 자료"},
      {"id":"permit-doc-begin","name":"착공신고 자료","source":"실무 자료","routes":["착공·사용승인 업무 포함"]},
      {"id":"permit-doc-finish","name":"사용승인서·준공 도서","source":"실무 자료","routes":["착공·사용승인 업무 포함"]}
    ],
    "workflow": {
      "version": 1,
      "kind": "permit",
      "fields": [
        {"key":"act","label":"건축 행위","type":"select","options":["신축","증축","개축","재축","이전","대수선","복합 행위"]},
        {"key":"zone","label":"용도지역·지구","type":"text"},
        {"key":"use","label":"계획 용도","type":"text"},
        {"key":"siteArea","label":"대지면적 (㎡)","type":"area"},
        {"key":"workArea","label":"행위 부분 바닥면적 (㎡)","type":"area"},
        {"key":"floors","label":"기존·계획 층수","type":"text"},
        {"key":"basis","label":"허가 검토 근거","type":"note"},
        {"key":"scope","label":"계약상 후속 업무","type":"select","options":["인허가 결과까지","착공·사용승인 업무 포함"]}
      ],
      "labels": {
        "checks": "법규·대지 검토",
        "docs": "접수 도서·결과",
        "history": "접수·보완·처분 이력",
        "party": "협의 기관·담당자",
        "authority": "허가권자·담당 부서",
        "reference": "접수·문서 번호",
        "body": "검토 내용·회신·후속 조치"
      },
      "states": ["미검토","검토 중","확인 완료","추가 협의","해당 없음"],
      "base": {
        "stages": ["상담","허가 대상·대지 검토","허가 도서 작성","건축허가 접수","관계부서 협의","보완 대응","허가서·조건 확인","허가 결과 인계"],
        "events": ["상담","대지·법규 검토","도서 검토","건축허가 접수","관계부서 회신","보완 요청·회신","허가 통지","결과 인계"],
        "finish": "허가서와 허가 조건, 건축주가 이어서 처리할 사항을 인계합니다."
      },
      "route": {
        "key": "scope",
        "paths": {
          "인허가 결과까지": {
            "stages": ["상담","허가 대상·대지 검토","허가 도서 작성","건축허가 접수","관계부서 협의","보완 대응","허가서·조건 확인","허가 결과 인계"],
            "events": ["상담","대지·법규 검토","도서 검토","건축허가 접수","관계부서 회신","보완 요청·회신","허가 통지","결과 인계"],
            "finish": "허가서와 허가 조건, 건축주가 이어서 처리할 사항을 인계합니다."
          },
          "착공·사용승인 업무 포함": {
            "stages": ["상담","허가 대상·대지 검토","허가 도서 작성","건축허가 접수","관계부서 협의","보완 대응","허가서·조건 확인","착공신고","공사 중 변경 검토","사용승인 신청","사용승인 확인","준공 자료 인계"],
            "events": ["상담","대지·법규 검토","도서 검토","건축허가 접수","관계부서 회신","보완 요청·회신","허가 통지","결과 인계","착공신고","공사 중 변경","사용승인 접수·회신","준공 인계"],
            "finish": "계약 범위에 따른 착공·사용승인 결과와 준공 도서를 인계합니다."
          }
        }
      },
      "links": [
        {"name":"건축법 제11조 · 건축허가","url":"https://www.law.go.kr/법령/건축법/제11조"},
        {"name":"건축법 제21조 · 착공신고","url":"https://www.law.go.kr/법령/건축법/제21조"},
        {"name":"건축법 제22조 · 사용승인","url":"https://www.law.go.kr/법령/건축법/제22조"}
      ]
    }
  },
  "office-report": {
    "name": "건축신고",
    "order": "22",
    "description": "신고 대상 근거와 도서를 확인하고 신고 수리·필증을 관리합니다.",
    "special": false,
    "stages": ["상담","신고 대상·근거 확인","신고 도서 작성","건축신고 접수","보완 대응","신고 수리 확인","신고 결과 인계","착공신고","공사 중 변경 검토","사용승인 신청","사용승인 확인","준공 자료 인계"],
    "terminal": ["신고 결과 인계","준공 자료 인계"],
    "events": ["상담","신고 근거 검토","도서 검토","건축신고 접수","관계부서 회신","보완 요청·회신","신고 수리","결과 인계","착공신고","공사 중 변경","사용승인 접수·회신","준공 인계"],
    "checks": [
      {"id":"report-check-site","name":"대지 범위와 권원","source":"실무 자료"},
      {"id":"report-check-zone","name":"지역·지구 및 행위 제한","source":"실무 자료"},
      {"id":"report-check-layout","name":"건축 규모·배치와 접도","source":"실무 자료"},
      {"id":"report-check-consult","name":"관계부서 협의 대상","source":"실무 자료","hint":"심의·의제 협의 적용 여부와 필요한 선행 절차를 확인합니다."},
      {"id":"report-check-legal","name":"건축신고 해당 조항·면적 산정","source":"실무 자료","hint":"신고 유형별 규모·지역 등 해당 요건과 판단 근거를 남깁니다."},
      {"id":"report-check-safe","name":"주차·피난·방화·구조 등 적용 기준","source":"실무 자료"},
      {"id":"report-check-decision","name":"신고 수리 결과와 조건","source":"실무 자료"},
      {"id":"report-check-occupancy","name":"착공·사용승인 준비와 설계변경 이력","source":"실무 자료","hint":"계약 범위에서 담당하는 후속 업무를 확인합니다.","routes":["착공·사용승인 업무 포함"]}
    ],
    "docs": [
      {"id":"report-doc-owner","name":"위임·권원 자료","source":"실무 자료"},
      {"id":"report-doc-site","name":"토지·건축물대장 및 현황 자료","source":"실무 자료"},
      {"id":"report-doc-filing","name":"건축신고서·설계도서","source":"실무 자료","hint":"행위별 신고서와 해당 설계도서를 연결합니다."},
      {"id":"report-doc-review","name":"관계부서 회신·보완 도서","source":"실무 자료"},
      {"id":"report-doc-result","name":"신고필증·수리 통지","source":"실무 자료"},
      {"id":"report-doc-begin","name":"착공신고 자료","source":"실무 자료","routes":["착공·사용승인 업무 포함"]},
      {"id":"report-doc-finish","name":"사용승인서·준공 도서","source":"실무 자료","routes":["착공·사용승인 업무 포함"]}
    ],
    "workflow": {
      "version": 1,
      "kind": "report",
      "fields": [
        {"key":"act","label":"건축 행위","type":"select","options":["신축","증축","개축","재축","이전","대수선","복합 행위"]},
        {"key":"zone","label":"용도지역·지구","type":"text"},
        {"key":"use","label":"계획 용도","type":"text"},
        {"key":"siteArea","label":"대지면적 (㎡)","type":"area"},
        {"key":"workArea","label":"행위 부분 바닥면적 (㎡)","type":"area"},
        {"key":"floors","label":"기존·계획 층수","type":"text"},
        {"key":"basis","label":"신고 해당 조항·산정 근거","type":"note"},
        {"key":"scope","label":"계약상 후속 업무","type":"select","options":["인허가 결과까지","착공·사용승인 업무 포함"]}
      ],
      "labels": {
        "checks": "법규·대지 검토",
        "docs": "접수 도서·결과",
        "history": "접수·보완·처분 이력",
        "party": "협의 기관·담당자",
        "authority": "허가권자·담당 부서",
        "reference": "접수·문서 번호",
        "body": "검토 내용·회신·후속 조치"
      },
      "states": ["미검토","검토 중","확인 완료","추가 협의","해당 없음"],
      "base": {
        "stages": ["상담","신고 대상·근거 확인","신고 도서 작성","건축신고 접수","보완 대응","신고 수리 확인","신고 결과 인계"],
        "events": ["상담","신고 근거 검토","도서 검토","건축신고 접수","관계부서 회신","보완 요청·회신","신고 수리","결과 인계"],
        "finish": "신고 수리 결과와 후속 착공 절차를 건축주에게 인계합니다."
      },
      "route": {
        "key": "scope",
        "paths": {
          "인허가 결과까지": {
            "stages": ["상담","신고 대상·근거 확인","신고 도서 작성","건축신고 접수","보완 대응","신고 수리 확인","신고 결과 인계"],
            "events": ["상담","신고 근거 검토","도서 검토","건축신고 접수","관계부서 회신","보완 요청·회신","신고 수리","결과 인계"],
            "finish": "신고 수리 결과와 후속 착공 절차를 건축주에게 인계합니다."
          },
          "착공·사용승인 업무 포함": {
            "stages": ["상담","신고 대상·근거 확인","신고 도서 작성","건축신고 접수","보완 대응","신고 수리 확인","착공신고","공사 중 변경 검토","사용승인 신청","사용승인 확인","준공 자료 인계"],
            "events": ["상담","신고 근거 검토","도서 검토","건축신고 접수","관계부서 회신","보완 요청·회신","신고 수리","결과 인계","착공신고","공사 중 변경","사용승인 접수·회신","준공 인계"],
            "finish": "계약 범위에 따른 착공·사용승인 결과와 준공 도서를 인계합니다."
          }
        }
      },
      "links": [
        {"name":"건축법 제14조 · 건축신고","url":"https://www.law.go.kr/법령/건축법/제14조"},
        {"name":"건축법 제21조 · 착공신고","url":"https://www.law.go.kr/법령/건축법/제21조"},
        {"name":"건축법 제22조 · 사용승인","url":"https://www.law.go.kr/법령/건축법/제22조"}
      ]
    }
  },
  "office2": {
    "name": "용도변경",
    "order": "30",
    "description": "기존 승인 용도와 변경할 세부 용도를 비교하고, 처리 절차에 따라 검토·도서·인계를 진행합니다.",
    "special": false,
    "stages": [
      "상담",
      "변경 전후 용도 확인",
      "시설군·처리 절차 검토",
      "변경 도서 작성",
      "용도변경 허가 접수",
      "관계부서 협의·보완",
      "허가서 확인",
      "사용승인 신청",
      "사용승인 확인",
      "대장·후속 업무 확인",
      "결과 인계",
      "용도변경 신고 접수",
      "신고 수리 확인",
      "기재변경 자료 작성",
      "기재내용 변경 신청",
      "대장 반영 확인",
      "예외 근거 검토",
      "관련 기준·후속 인허가 확인",
      "검토 결과 인계"
    ],
    "terminal": ["결과 인계","검토 결과 인계"],
    "events": [
      "상담",
      "현황 확인",
      "절차·법규 검토",
      "관할청 사전협의",
      "도서 검토",
      "용도변경 허가 접수",
      "관계부서 회신·보완",
      "허가 통지",
      "사용승인 접수·회신",
      "대장 확인",
      "결과 인계",
      "용도변경 신고 접수",
      "신고 수리",
      "기재내용 변경 신청",
      "보완 회신",
      "예외 근거 기록",
      "별도 인허가 협의",
      "검토 결과 인계"
    ],
    "checks": [
      {"id":"use-check-item0","name":"기존 승인 용도·현황","source":"실무 자료","hint":"대장·사용승인 도면과 현황을 대조하고 기존 위반 내역을 확인합니다."},
      {"id":"use-check-item1","name":"변경 전후 용도 및 절차","source":"실무 자료","hint":"시행령 별표 1의 세부 용도와 시설군을 대조해 절차를 판단합니다."},
      {"id":"use-check-zone","name":"용도지역·지구단위계획의 용도 허용","source":"실무 자료"},
      {"id":"use-check-item2","name":"주차·피난·소방 검토","source":"실무 자료","hint":"용도에 따른 부설주차장, 출구·직통계단, 방화구획과 소방시설을 검토합니다."},
      {"id":"use-check-comfort","name":"장애인 편의시설·위생·설비 적용 검토","source":"실무 자료"},
      {"id":"use-check-structure","name":"구조·대수선 등 수반 공사 검토","source":"실무 자료"},
      {"id":"use-check-item3","name":"관할청 협의 사항","source":"실무 자료","hint":"필요에 따라 건축·소방·주차·영업 담당 부서의 회신을 기록합니다."},
      {"id":"use-check-use-approval","name":"사용승인 준용 여부와 후속 업무","source":"실무 자료","hint":"건축법 제19조제5항의 면적·대수선 조건을 확인합니다.","routes":["용도변경 허가","용도변경 신고"]},
      {"id":"use-check-ledger","name":"대장 반영 내용 대조","source":"실무 자료","hint":"기재된 세부 용도와 변경 면적을 도면에 대조합니다.","routes":["건축물대장 기재내용 변경"]},
      {"id":"use-check-exception","name":"기재변경 신청 예외 및 제외 용도 검토","source":"실무 자료","hint":"시행령 제14조제4항 각 호와 단서를 함께 확인합니다.","routes":["기재내용 변경신청 예외"]}
    ],
    "docs": [
      {"id":"use-doc-item0","name":"건축물대장·기존 도면","source":"실무 자료"},
      {"id":"use-doc-item1","name":"변경 전후 도면","source":"실무 자료","hint":"변경 부분과 용도·면적을 표시합니다."},
      {"id":"use-doc-item2","name":"현장사진","source":"실무 자료"},
      {"id":"use-doc-use-table","name":"전후 용도·시설군·면적 검토표","source":"실무 자료"},
      {"id":"use-doc-item3","name":"관계기관 회신","source":"실무 자료","hint":"협의한 경우 회신과 보완 자료를 연결합니다."},
      {"id":"use-doc-item4","name":"처리 결과 자료","source":"실무 자료","hint":"선택한 업무 경로에 따른 결과나 의뢰인 인계본을 연결합니다."},
      {"id":"use-doc-permit-form","name":"용도변경 허가신청서·접수증","source":"실무 자료","routes":["용도변경 허가"]},
      {"id":"use-doc-report-form","name":"용도변경 신고서·접수증","source":"실무 자료","routes":["용도변경 신고"]},
      {"id":"use-doc-ledger-form","name":"건축물대장 기재내용 변경 신청 자료","source":"실무 자료","routes":["건축물대장 기재내용 변경"]},
      {"id":"use-doc-exception-memo","name":"기재변경 신청 예외 근거·검토의견서","source":"실무 자료","routes":["기재내용 변경신청 예외"]},
      {"id":"use-doc-approval-doc","name":"사용승인 신청·결과 자료","source":"실무 자료","routes":["용도변경 허가","용도변경 신고"],"when":{"field":"approval","values":["대상 · 사무소 수행"]}}
    ],
    "workflow": {
      "version": 1,
      "kind": "use",
      "fields": [
        {"key":"fromUse","label":"기존 승인 용도 (대장·세부 용도)","type":"text"},
        {"key":"toUse","label":"변경할 세부 용도","type":"text"},
        {"key":"fromGroup","label":"기존 시설군","type":"facility"},
        {"key":"toGroup","label":"변경 시설군","type":"facility"},
        {"key":"area","label":"변경 부분 바닥면적 합계 (㎡)","type":"area"},
        {"key":"major","label":"대수선 수반 여부","type":"select","options":["수반","수반하지 않음"]},
        {"key":"procedure","label":"검토 후 선택한 처리 절차","type":"select","options":["용도변경 허가","용도변경 신고","건축물대장 기재내용 변경","기재내용 변경신청 예외"]},
        {"key":"basis","label":"절차 판단 근거·관할청 회신","type":"note"},
        {"key":"approval","label":"법 제19조제5항 사용승인 검토·수행 범위","type":"select","options":["대상 · 사무소 수행","대상 · 건축주 인계","비대상"],"routes":["용도변경 허가","용도변경 신고"]}
      ],
      "labels": {"checks":"용도·법규 검토","docs":"절차별 도서","history":"용도변경 처리 이력","party":"협의 부서·담당자","authority":"관할청·관련 부서","reference":"접수·회신 번호","body":"판단 근거·협의 결과·후속 조치"},
      "states": ["미검토","검토 중","확인 완료","보완 필요","해당 없음"],
      "base": {"stages":["상담","변경 전후 용도 확인","시설군·처리 절차 검토"],"events":["상담","현황 확인","절차·법규 검토","관할청 사전협의"],"finish":"변경 전후 세부 용도와 시설군을 확인하고 처리 절차와 판단 근거를 기록합니다."},
      "route": {
        "key": "procedure",
        "paths": {
          "용도변경 허가": {
            "stages": ["상담","변경 전후 용도 확인","시설군·처리 절차 검토","변경 도서 작성","용도변경 허가 접수","관계부서 협의·보완","허가서 확인","사용승인 신청","사용승인 확인","대장·후속 업무 확인","결과 인계"],
            "events": ["상담","현황 확인","절차·법규 검토","관할청 사전협의","도서 검토","용도변경 허가 접수","관계부서 회신·보완","허가 통지","사용승인 접수·회신","대장 확인","결과 인계"],
            "finish": "처분 결과, 건축물대장과 해당 후속 업무를 확인해 건축주에게 인계합니다."
          },
          "용도변경 신고": {
            "stages": ["상담","변경 전후 용도 확인","시설군·처리 절차 검토","변경 도서 작성","용도변경 신고 접수","관계부서 협의·보완","신고 수리 확인","사용승인 신청","사용승인 확인","대장·후속 업무 확인","결과 인계"],
            "events": ["상담","현황 확인","절차·법규 검토","관할청 사전협의","도서 검토","용도변경 신고 접수","관계부서 회신·보완","신고 수리","사용승인 접수·회신","대장 확인","결과 인계"],
            "finish": "처분 결과, 건축물대장과 해당 후속 업무를 확인해 건축주에게 인계합니다."
          },
          "건축물대장 기재내용 변경": {
            "stages": ["상담","변경 전후 용도 확인","시설군·처리 절차 검토","기재변경 자료 작성","기재내용 변경 신청","대장 반영 확인","결과 인계"],
            "events": ["상담","현황 확인","절차·법규 검토","관할청 사전협의","기재내용 변경 신청","보완 회신","대장 확인","결과 인계"],
            "finish": "변경된 건축물대장의 세부 용도를 확인하고 사본을 인계합니다."
          },
          "기재내용 변경신청 예외": {
            "stages": ["상담","변경 전후 용도 확인","시설군·처리 절차 검토","예외 근거 검토","관련 기준·후속 인허가 확인","검토 결과 인계"],
            "events": ["상담","현황 확인","절차·법규 검토","관할청 사전협의","예외 근거 기록","별도 인허가 협의","검토 결과 인계"],
            "finish": "예외 적용 근거와 별도 인허가·영업 요건의 검토 결과를 의뢰인에게 인계합니다."
          }
        }
      },
      "conditions": {
        "사용승인 신청": {"field":"approval","values":["대상 · 사무소 수행"]},
        "사용승인 확인": {"field":"approval","values":["대상 · 사무소 수행"]},
        "사용승인 접수·회신": {"field":"approval","values":["대상 · 사무소 수행"]}
      },
      "links": [
        {"name":"건축법 제19조 · 용도변경","url":"https://www.law.go.kr/법령/건축법/제19조"},
        {"name":"건축법 시행령 제14조 · 시설군·기재변경 예외","url":"https://www.law.go.kr/법령/건축법시행령/제14조"},
        {"name":"건축법 시행령 별표 1 · 용도별 건축물의 종류","url":"https://www.law.go.kr/법령/건축법시행령/별표1"}
      ]
    }
  },
  "office3": {
    "name": "인테리어 설계",
    "order": "40",
    "description": "실측, 공간 기획, 발주처 승인과 납품을 관리합니다. 현장 지원은 계약 범위에 따라 추가됩니다.",
    "special": false,
    "stages": ["상담","현장 실측","공간 기획·기본설계","발주처 설계안 승인","실시설계·마감 확정","최종 도서 납품","견적·시공 협의","현장 질의·변경 대응","현장 확인·인계"],
    "terminal": ["최종 도서 납품","현장 확인·인계"],
    "events": ["요구사항 확인","실측","설계안 제안","발주처 피드백","설계안 승인","도서 검토","납품·인수","견적 협의","현장 질의·회신","변경 승인","현장 확인"],
    "checks": [
      {"id":"interior-check-item0","name":"의뢰 범위와 예산","source":"실무 자료"},
      {"id":"interior-check-item1","name":"실측·기존 설비 상태","source":"실무 자료"},
      {"id":"interior-check-brief","name":"공간 요구사항·동선·가구 배치","source":"실무 자료"},
      {"id":"interior-check-works","name":"용도변경·대수선·소방 등 별도 절차 해당 여부","source":"실무 자료","hint":"별도 절차가 발생하면 해당 업무 유형으로 건을 등록하고 같은 프로젝트에 연결합니다."},
      {"id":"interior-check-item2","name":"재료·마감 승인","source":"실무 자료"},
      {"id":"interior-check-item3","name":"현장 변경과 납품 범위","source":"실무 자료","routes":["설계·현장 지원"]},
      {"id":"interior-check-handover","name":"최종 도면 버전·발주처 인수 확인","source":"실무 자료"}
    ],
    "docs": [
      {"id":"interior-doc-item0","name":"현황 실측도·사진","source":"실무 자료"},
      {"id":"interior-doc-item1","name":"기본설계안","source":"실무 자료"},
      {"id":"interior-doc-item2","name":"상세도·마감표","source":"실무 자료"},
      {"id":"interior-doc-feedback","name":"발주처 설계안 승인 기록","source":"실무 자료"},
      {"id":"interior-doc-item3","name":"견적·변경 승인자료","source":"실무 자료","routes":["설계·현장 지원"]},
      {"id":"interior-doc-item4","name":"납품 도서","source":"실무 자료"},
      {"id":"interior-doc-site-log","name":"현장 질의·변경 기록","source":"실무 자료","routes":["설계·현장 지원"]}
    ],
    "workflow": {
      "version": 1,
      "kind": "interior",
      "fields": [
        {"key":"program","label":"공간 용도·요구사항","type":"text"},
        {"key":"area","label":"설계 대상 면적 (㎡)","type":"area"},
        {"key":"budget","label":"공사 예산·포함 범위","type":"text"},
        {"key":"approver","label":"발주처 승인 담당자","type":"text"},
        {"key":"deliverables","label":"약정 납품 도서·형식","type":"text"},
        {"key":"scope","label":"설계·현장 계약 범위","type":"select","options":["설계도서 납품까지","설계·현장 지원"]}
      ],
      "labels": {
        "checks": "설계 검토",
        "docs": "도면·납품 자료",
        "history": "설계 협의·납품 이력",
        "party": "발주처·시공사 담당자",
        "authority": "발주처·협력사",
        "reference": "도면 버전·회의 번호",
        "body": "요청 사항·설계 결정·변경 내용"
      },
      "states": ["미검토","작업 중","승인 대기","확정","수정 필요","해당 없음"],
      "base": {
        "stages": ["상담","현장 실측","공간 기획·기본설계","발주처 설계안 승인","실시설계·마감 확정","최종 도서 납품"],
        "events": ["요구사항 확인","실측","설계안 제안","발주처 피드백","설계안 승인","도서 검토","납품·인수"],
        "finish": "약정한 도면·마감표 등 최종 성과물을 납품하고 인수 확인을 기록합니다."
      },
      "route": {
        "key": "scope",
        "paths": {
          "설계도서 납품까지": {
            "stages": ["상담","현장 실측","공간 기획·기본설계","발주처 설계안 승인","실시설계·마감 확정","최종 도서 납품"],
            "events": ["요구사항 확인","실측","설계안 제안","발주처 피드백","설계안 승인","도서 검토","납품·인수"],
            "finish": "약정한 도면·마감표 등 최종 성과물을 납품하고 인수 확인을 기록합니다."
          },
          "설계·현장 지원": {
            "stages": ["상담","현장 실측","공간 기획·기본설계","발주처 설계안 승인","실시설계·마감 확정","견적·시공 협의","현장 질의·변경 대응","현장 확인·인계"],
            "events": ["요구사항 확인","실측","설계안 제안","발주처 피드백","설계안 승인","도서 검토","납품·인수","견적 협의","현장 질의·회신","변경 승인","현장 확인"],
            "finish": "납품 도서와 현장 변경 사항, 잔여 조치를 정리해 발주처에 인계합니다."
          }
        }
      },
      "links": []
    }
  },
  "office0": {
    "name": "일반 업무",
    "order": "50",
    "description": "조사·자문·도면 작성 등 개별 의뢰의 납품물과 완료 기준을 직접 정합니다.",
    "special": false,
    "stages": ["요청 접수","업무 범위 합의","자료 조사·수행","의뢰인 검토·수정","성과물 전달","인수 확인"],
    "terminal": ["인수 확인"],
    "events": ["요청 접수","범위·일정 합의","자료 수령","작업 기록","의뢰인 피드백","성과물 전달","인수 확인"],
    "checks": [
      {"id":"general-check-item0","name":"업무 범위","source":"실무 자료"},
      {"id":"general-check-item1","name":"현장 조건","source":"실무 자료","hint":"현장 업무가 있는 경우 확인합니다."},
      {"id":"general-check-item2","name":"일정·협의 사항","source":"실무 자료"},
      {"id":"general-check-acceptance","name":"성과물과 완료 기준 합의","source":"실무 자료"},
      {"id":"general-check-delivery","name":"납품·인수 확인","source":"실무 자료"}
    ],
    "docs": [
      {"id":"general-doc-item0","name":"의뢰 자료","source":"실무 자료"},
      {"id":"general-doc-item1","name":"현황 도면·사진","source":"실무 자료","hint":"현장 업무가 있는 경우 사용합니다."},
      {"id":"general-doc-item2","name":"협의 기록","source":"실무 자료"},
      {"id":"general-doc-item3","name":"최종 성과물","source":"실무 자료"}
    ],
    "workflow": {
      "version": 1,
      "kind": "general",
      "fields": [
        {"key":"request","label":"업무 요청·목적","type":"note"},
        {"key":"deliverable","label":"약정 성과물·납품 형식","type":"text"},
        {"key":"acceptance","label":"완료 기준·인수 방법","type":"text"},
        {"key":"reviewer","label":"검토·인수 담당자","type":"text"}
      ],
      "labels": {"checks":"업무 체크리스트","docs":"요청 자료·성과물","history":"작업·인계 이력","party":"의뢰인·검토자","authority":"요청 부서·협력처","reference":"자료명·버전","body":"작업 내용·피드백·인계 사항"},
      "states": ["미착수","진행 중","확인 완료","수정 필요","해당 없음"],
      "base": {
        "stages": ["요청 접수","업무 범위 합의","자료 조사·수행","의뢰인 검토·수정","성과물 전달","인수 확인"],
        "events": ["요청 접수","범위·일정 합의","자료 수령","작업 기록","의뢰인 피드백","성과물 전달","인수 확인"],
        "finish": "의뢰인과 합의한 완료 기준에 따라 성과물을 전달하고 인수를 확인합니다."
      },
      "links": []
    }
  }
}
$workflows$::jsonb)
)
insert into lv_register.templates(id,body)
select id,body from definitions
on conflict(id) do update set body=excluded.body, version=lv_register.templates.version+1
where lv_register.templates.owner_id is null and lv_register.templates.body is distinct from excluded.body;

-- Reuse identifiers when item names match so saved notes, statuses and file keys stay attached.
-- Unmatched historical items stay readable under their original identifiers.
create function pg_temp.upgrade_register_items(previous jsonb, upcoming jsonb) returns jsonb
language sql immutable set search_path='' as $$
  with old_items as (select value as v, ordinality as pos from jsonb_array_elements(previous) with ordinality),
  new_items as (select value as v, ordinality as pos from jsonb_array_elements(upcoming) with ordinality),
  merged as (
    select n.pos, case when o.v is null then n.v else n.v || jsonb_build_object('id',o.v->>'id') end as v
      from new_items n left join old_items o on o.v->>'name'=n.v->>'name'
    union all
    select 1000+o.pos, o.v || '{"legacy":true}'::jsonb from old_items o
      where not exists (select from new_items n where n.v->>'name'=o.v->>'name')
  )
  select coalesce(jsonb_agg(v order by pos),'[]'::jsonb) from merged
$$;
with upgrades as (
  select c.id, t.body || jsonb_build_object(
    'checks',pg_temp.upgrade_register_items(c.blueprint->'checks',t.body->'checks'),
    'docs',pg_temp.upgrade_register_items(c.blueprint->'docs',t.body->'docs'),
    'stages',case when (t.body->'stages') ? (c.data->>'stage') then t.body->'stages'
      else (t.body->'stages') || jsonb_build_array(c.data->>'stage') end,
    'terminal',case when (c.blueprint->'terminal') ? (c.data->>'stage') and not (t.body->'terminal' ? (c.data->>'stage'))
      then (t.body->'terminal') || jsonb_build_array(c.data->>'stage') else t.body->'terminal' end
  ) as blueprint from lv_register.cases c join lv_register.templates t on t.id=c.template_id
  where t.owner_id is null and c.template_id in ('office0','office2','office3')
    and c.blueprint->'workflow' is null
)
update lv_register.cases c set blueprint=u.blueprint, revision=c.revision+1 from upgrades u where c.id=u.id;

create function lv_register.workflow_condition(rule jsonb, details jsonb) returns boolean
language sql immutable set search_path='' as $$
  select rule is null or coalesce((rule->'values') ? (details->>(rule->>'field')),false)
$$;

create function lv_register.active_work_item(item jsonb, workflow jsonb, details jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(item->>'legacy','false') <> 'true'
    and (not (item ? 'routes') or coalesce((item->'routes') ? (details->>(workflow->'route'->>'key')),false))
    and lv_register.workflow_condition(item->'when',details)
$$;

-- The same route controls allowable stages for forms and direct register writes.
create function lv_register.check_workflow_stage() returns trigger
language plpgsql set search_path='' as $$
declare flow jsonb:=new.blueprint->'workflow'; details jsonb:=new.data->'details';
  selected text; journey jsonb; stage_name text:=new.data->>'stage';
begin
  if flow is null then return new; end if;
  selected:=coalesce(details->>(flow->'route'->>'key'),'');
  if selected<>'' and not ((flow->'route'->'paths') ? selected) then
    raise exception using errcode='22023',message='invalid workflow path';
  end if;
  journey:=coalesce(flow->'route'->'paths'->selected,flow->'base');
  if not ((journey->'stages') ? stage_name and lv_register.workflow_condition(flow->'conditions'->stage_name,details)) then
    if tg_op='UPDATE' then
      if stage_name=old.data->>'stage' and details is not distinct from old.data->'details' then return new; end if;
      if stage_name=old.data->>'stage' and not exists (
        select from jsonb_array_elements_text(flow->'base'->'stages') s where s=stage_name
        union all select from jsonb_each(flow->'route'->'paths') p
        where (p.value->'stages') ? stage_name
      ) and selected=coalesce(old.data->'details'->>(flow->'route'->>'key'),'') then return new; end if;
    end if;
    raise exception using errcode='22023',message='stage does not apply to selected workflow';
  end if;
  return new;
end; $$;
create trigger check_workflow_stage before insert or update of data on lv_register.cases
for each row execute function lv_register.check_workflow_stage();

-- List counters include the active path's documents, just like the case detail.
create function lv_register.workflow_list(p_key text,p_args jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare member_id uuid:=lv_register.member(p_key); result jsonb;
begin
  with page as (
    select * from lv_register.cases where owner_id=member_id and serial>coalesce((p_args->>'after')::bigint,0)
    order by serial limit 80
  ), items as (
    select c.serial,jsonb_build_object('id',c.id,'serial',c.serial,'type',c.blueprint->>'name','templateId',c.template_id,
      'title',c.data->>'title','client',c.data->>'client','address',c.data->>'address','projectId',c.data->>'projectId',
      'stage',c.data->>'stage','closed',(c.blueprint->'terminal') ? (c.data->>'stage'),'due',c.data->>'due',
      'nextAction',c.data->>'nextAction','archived',c.data->'archived','updated',c.updated_at,
      'route',nullif(c.data->'details'->>(c.blueprint->'workflow'->'route'->>'key'),''),
      'docsTotal',d.total,'docsReceived',d.received) as entry from page c
    cross join lateral (
      select count(*) filter(where coalesce(c.data->'docs'->(i->>'id')->>'status','')<>'해당 없음') as total,
        count(*) filter(where c.data->'docs'->(i->>'id')->>'status' in ('수합','검토 완료')) as received
      from jsonb_array_elements(c.blueprint->'docs') i
      where lv_register.active_work_item(i,c.blueprint->'workflow',c.data->'details')
    ) d
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(entry order by serial),'[]'::jsonb),
    'after',case when count(*)=80 then max(serial) end) into result from items;
  return result;
end; $$;

revoke all on function lv_register.workflow_condition(jsonb,jsonb),lv_register.active_work_item(jsonb,jsonb,jsonb),
  lv_register.check_workflow_stage(),lv_register.workflow_list(text,jsonb) from public,anon,authenticated;
grant execute on function lv_register.workflow_list(text,jsonb) to anon,authenticated;
create or replace function public.lv_work_register(p_key text,p_action text,p_case uuid default null,p_args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
return case when p_action='list' then lv_register.workflow_list(p_key,p_args)
  else lv_register.dispatch(p_key,p_action,p_case,p_args) end;

notify pgrst,'reload schema';
