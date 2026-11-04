/**
 * GET /api/address?q=Laugavegur 10
 *
 * Prefix search over Staðfangaskrá (HMS address registry), all of Iceland.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const CSV = path.join(process.cwd(), "data", "dem", "raw", "Stadfangaskra.csv");
const MAX_RESULTS = 8;

interface Address {
  label: string;
  key: string;
  postcode: string;
  lat: number;
  lng: number;
}

let addresses: Promise<Address[]> | null = null;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .replace(/ð/g, "d")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function load(): Promise<Address[]> {
  addresses ??= readFile(CSV, "utf8").then((text) => {
    const lines = text.split("\n");
    const header = lines[0].split(",");
    const col = (name: string) => header.indexOf(name);
    const iStreet = col("HEITI_NF");
    const iNum = col("HUSNR");
    const iLetter = col("BOKST");
    const iPost = col("POSTNR");
    const iLat = col("N_HNIT_WGS84");
    const iLng = col("E_HNIT_WGS84");
    const out: Address[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const f = lines[i].split(",");
      if (f.length !== header.length) continue; // skip rows with embedded commas
      const lat = Number(f[iLat]);
      const lng = Number(f[iLng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue;
      const label = `${f[iStreet]} ${f[iNum]}${f[iLetter]}`.trim();
      const dedupe = `${label}|${f[iPost]}`;
      if (!f[iStreet] || seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ label, key: normalize(label), postcode: f[iPost], lat, lng });
    }
    return out;
  });
  return addresses;
}

export async function GET(request: Request) {
  const q = normalize(new URL(request.url).searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const all = await load();
    const matches = all.filter((a) => a.key.startsWith(q));
    // Shortest first so "laugavegur 1" ranks above "laugavegur 105"
    matches.sort(
      (a, b) =>
        a.key.length - b.key.length ||
        a.key.localeCompare(b.key, "is", { numeric: true }),
    );
    const results = matches.slice(0, MAX_RESULTS).map((a) => ({
      label: a.label,
      postcode: a.postcode,
      lat: a.lat,
      lng: a.lng,
    }));
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Address search failed", detail: message },
      { status: 500 },
    );
  }
}
