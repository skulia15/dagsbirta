"use client";

import dynamic from "next/dynamic";

/** Client-only: the explorer reads the URL and current time on first render, and needs WebGL */
const ShadowExplorer = dynamic(() => import("./ShadowExplorer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
      Loading shadow explorer…
    </div>
  ),
});

export default ShadowExplorer;
