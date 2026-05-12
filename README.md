This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 운영 설계 문서

- [Admin 운영 구조 설계](./docs/operational-architecture.md)
- [Admin Backend/API 설계](./docs/backend-api-design.md)
- [PostgreSQL 스키마 초안](./docs/database-schema.sql)

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

## DB 초기화

PostgreSQL 또는 Neon 연결 후 운영 스키마와 기본 `master` 계정을 만들려면:

```bash
cp .env.example .env.local
npm run db:init
```

`.env.local`의 `DATABASE_URL`, `SESSION_SECRET`, `MASTER_PASSWORD`를 먼저 채워주세요.
`MASTER_PASSWORD`를 생략하면 초기 비밀번호는 `0000`입니다.

검증 중 만든 `smoke-...` 테스트 데이터는 아래 명령으로 정리합니다.

```bash
npm run db:clean-smoke
```

## 운영 점검

배포 전에는 환경변수 기본값과 약한 비밀번호가 남아 있지 않은지 확인합니다.

```bash
npm run ops:check
npm run lint
npm run build
```

운영 전에 직접 바꿔야 하는 값은 `DATABASE_URL`, `SESSION_SECRET`, `MASTER_PASSWORD`, `NEXT_PUBLIC_APP_URL`입니다.

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
