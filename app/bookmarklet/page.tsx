'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function BookmarkletPage() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // 브라우저에서 더 많은 텍스트를 수집해 자동 태그 정확도를 높이는 북마클릿
  const bookmarkletCode = `javascript:(function(){
var m=function(s){return document.querySelector(s)};
var all=function(s){return Array.from(document.querySelectorAll(s))};
var body=document.body.innerText.slice(0,800).replace(/\\s+/g,' ');
var kws=all('meta[name="keywords"],meta[property="article:tag"]').map(function(e){return e.content}).join(',');
var og={
  title:m('meta[property="og:title"]')?.content||document.title||'',
  imageUrl:m('meta[property="og:image"]')?.content||m('meta[name="twitter:image"]')?.content||'',
  description:(m('meta[property="og:description"]')?.content||m('meta[name="description"]')?.content||'').slice(0,300),
  bodyText:body,
  keywords:kws.slice(0,300),
  sourceUrl:location.href
};
window.open('${origin || 'http://localhost:3000'}/?add=1&'+new URLSearchParams(og).toString(),'_blank');
})();`.replace(/\n/g, '').replace(/\s{2,}/g, ' ').trim();

  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-100">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 flex items-center gap-1.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            홈으로
          </Link>
          <span className="text-zinc-200">|</span>
          <h1 className="font-semibold text-zinc-900 text-sm">북마클릿 설치</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">원클릭 레퍼런스 저장</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            ArchDaily, Dezeen, Archinect 등 어떤 사이트를 보다가도 북마클릿 클릭 한 번으로 레퍼런스를 저장할 수 있습니다.
            이미지·제목·URL이 자동으로 채워집니다.
          </p>
        </div>

        {/* 설치 방법 */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-zinc-700">설치 방법</h3>

          <div className="flex flex-col gap-3">
            {[
              { step: 1, text: '아래 코드를 복사합니다.' },
              { step: 2, text: '브라우저 북마크 바를 오른쪽 클릭 → "페이지 추가" (또는 새 북마크 만들기)' },
              { step: 3, text: '이름: "Arch Ref 저장", URL 칸에 복사한 코드를 붙여넣기' },
              { step: 4, text: '저장 후, 건축 레퍼런스 사이트에서 북마크를 클릭하면 끝!' },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-zinc-900 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </span>
                <p className="text-sm text-zinc-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 북마클릿 코드 */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">북마클릿 코드</span>
            <button
              onClick={copy}
              className="text-xs px-3 py-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors"
            >
              {copied ? '복사됨 ✓' : '복사'}
            </button>
          </div>
          <div className="p-4">
            <code className="text-xs text-zinc-600 break-all leading-relaxed">
              {bookmarkletCode}
            </code>
          </div>
        </div>

        {/* 또는 드래그로 설치 */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 mb-2">또는 드래그로 설치 (가장 쉬운 방법)</p>
          <p className="text-xs text-blue-600 mb-3">
            북마크 바가 보이는 상태에서 아래 버튼을 북마크 바로 드래그하세요.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={bookmarkletCode}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-move"
            onClick={e => { e.preventDefault(); alert('이 버튼을 클릭하지 말고, 북마크 바로 드래그하세요!'); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Arch Ref 저장
          </a>
        </div>

        {/* 지원 사이트 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">지원 사이트</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'ArchDaily', url: 'archdaily.com', works: true },
              { name: 'Dezeen', url: 'dezeen.com', works: true },
              { name: 'Archinect', url: 'archinect.com', works: true },
              { name: 'Archello', url: 'archello.com', works: true },
              { name: 'Architizer', url: 'architizer.com', works: true },
              { name: '기타 모든 사이트', url: '', works: true },
            ].map(site => (
              <div key={site.name} className="flex items-center gap-2 text-sm text-zinc-600">
                <span className="text-green-500">✓</span>
                {site.name}
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            북마클릿은 브라우저에서 직접 실행되므로 서버 차단과 무관하게 모든 사이트에서 동작합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
