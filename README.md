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

## Shadow explorer (`/shadows`) and analysis (`/api/analyze`)

3D sun-and-shadow view and sunlight/solar analysis for any spot in Iceland, any time
of day and year, with shade from **buildings and terrain**. Both use the same scene,
so the 3D view and the report always agree.

**No setup needed.** Data sources:

- **Distant terrain (80 m):** `data/dem/national-80m/`, committed (17 MB). Built from
  the ÍslandsDEM 20 m national model with `scripts/build-national-tiles.mjs`.
- **Detailed terrain (2 m):** ÍslandsDEM v1.0 tiles, read remotely from gis.lmi.is via
  HTTP range requests (`src/lib/terrain/islandsdem-tiles.json`). A tile placed in
  `data/dem/raw/` is used instead.
- **Buildings:** OpenStreetMap (Overpass), fetched per 1 km tile and cached: on disk in
  `data/buildings/` locally, in the Vercel Runtime Cache when deployed (30-day TTL).
  In Reykjavík, storey counts come from LUKR open data (residential units only).
  Large buildings with no height data get an estimate from the surface model.
- **Addresses:** `data/dem/raw/Stadfangaskra.csv` (HMS address registry).

`POST /api/analyze` takes `includeBuildings` (default `true`), `surface`
(`auto` | `roof` | `ground`, default `auto` = roof if a building is at the point) and
`heightAboveSurface` (default 1.5 m). `meta.obstruction` reports what was used.

**Deploying (Vercel):** works as is. `next.config.ts` bundles the national tiles and
the address CSV into the functions that read them and excludes local-only data. The
first visit to an area waits on the public Overpass API (up to about a minute); after
that the cache answers in well under a second.

Validated against known sun-return dates: Seyðisfjörður's first direct sun lands on
18–20 February (traditional date: 18 February), Ísafjörður's on 25–28 January
(traditional: 25 January).

Data: ÍslandsDEM © Náttúrufræðistofnun / LMÍ (CC BY 4.0); © OpenStreetMap contributors (ODbL); LUKR, Reykjavíkurborg (notify usk_lukr@reykjavik.is of use).
