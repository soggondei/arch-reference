This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 2026-10-18 가격 근거 표시

입찰 API는 `basis-final-v1` 모델·사례기반 참고 상태·최소 10개 사례가 확인된 가격만 노출한다.
보류 또는 이전 계산값은 금액을 숨기고 `추천 보류`와 사유를 보여 준다.
기초금액·기초금액 대비 비율·비교 범위·가격 자료 기준일을 함께 표시하며, 근거 없는 개인화 보정은 제거했다.
Notion의 페이지 ID·참가 기록·개찰 결과 필드는 변경하지 않는다.
검증: `node --test tests/*.test.mjs`, `npm run build`.
