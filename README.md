# Obisan

Obsidian for Music.

## Phase 1

- Spotify OAuth with PKCE
- Encrypted token persistence
- PostgreSQL + Prisma schema
- DB-backed sync jobs
- Initial sync runner endpoint

## Setup

1. Copy `.env.example` to `.env.local`.
2. Configure Spotify OAuth redirect URI.
3. Run `npm install`.
4. Run `npx prisma generate` and `npx prisma db push`.
5. Start with `npm run dev`.

## Notes

- Tokens are encrypted before storage.
- Sync jobs are persisted in Postgres for MVP reliability on Vercel.
- The generic `Relationship` model is the derived graph layer, not the source of truth.
# Obisan
