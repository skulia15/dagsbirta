import type { NextConfig } from "next";

// Pin the project root: a lockfile in a parent directory otherwise makes Next infer
// the wrong root, which also skews file tracing for serverless functions.
const root = __dirname;

const nationalDem = "./data/dem/national-80m/**";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: { root },
  outputFileTracingRoot: root,
  // Data files read at runtime with dynamic paths, so tracing can't see them
  outputFileTracingIncludes: {
    "/api/address": ["./data/dem/raw/Stadfangaskra.csv"],
    "/api/scene": [nationalDem],
    "/api/analyze": [nationalDem],
  },
  // Never ship local-only data: 1+ GB DEM downloads and the dev building cache
  outputFileTracingExcludes: {
    "*": ["./data/dem/raw/*.tif", "./data/buildings/**"],
    // dem.ts looks in data/dem/raw/ for optional local tiles; tracing then drags in the address CSV
    "/api/scene": ["./data/dem/raw/*.csv"],
    "/api/analyze": ["./data/dem/raw/*.csv"],
  },
};

export default nextConfig;
