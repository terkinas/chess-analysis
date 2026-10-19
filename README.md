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

## Game history (Prisma + PostgreSQL)

Finished games against Stockfish are saved to PostgreSQL and listed on the
History page (`/history`), where each one can be opened in Analysis, downloaded
as PGN or deleted. There are no accounts: each browser gets an anonymous, signed visitor cookie
(`gambit_vid`, HttpOnly, set when its first game is saved) and its history is
kept under a keyed hash of that id, so nobody sees anybody else's games. Only
the hash is stored, and every query in `app/api/games` is filtered by it.

Setup:

```bash
npm install
cp .env.example .env        # set DATABASE_URL to your PostgreSQL database
npm run db:migrate          # first time: creates the games table (name it "init")
npm run db:generate         # generates the Prisma client into app/generated/prisma
npm run dev
```

- Set `HISTORY_OWNER_SECRET` in `.env` (required in production); see
  `.env.example`.
- Put `DATABASE_URL` in `.env` (not only `.env.local`): the Prisma CLI reads `.env`.
- On a server, apply committed migrations with `npm run db:deploy`.
- History belongs to the browser: it follows the same browser across network
  changes, but clearing cookies, private windows and other devices or browsers
  start a new, empty history. Games saved before ownership existed (empty
  `ownerKey`), or while it was keyed by IP address, are shown to nobody.
- The schema is `prisma/schema.prisma`; the API is `app/api/games`. The server
  replays the submitted moves with chess.js and works out the result and PGN
  itself, so it never stores an illegal game or a made-up result.
- If the database is unreachable the game still plays; the panel says the game
  couldn't be saved and the PGN download remains available.
