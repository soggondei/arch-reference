'use client';

import { useEffect } from 'react';

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 설치 배너가 안 뜰 뿐 앱 사용에는 지장 없음 — 조용히 무시
      });
    }
  }, []);
  return null;
}
