"use client";

import { useEffect, useState } from "react";

export interface AddressPick {
  lat: number;
  lng: number;
  label: string;
}

interface AddressResult {
  label: string;
  postcode: string;
  lat: number;
  lng: number;
}

/** Debounced prefix search over the Staðfangaskrá address registry (/api/address) */
export function AddressSearch({
  onSelect,
  autoFocus = false,
}: {
  onSelect: (c: AddressPick) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/address?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j: { results?: AddressResult[] }) => setResults(j.results ?? []))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        placeholder="Search address, e.g. Laugavegur 10"
        aria-label="Search address"
        // biome-ignore lint/a11y/noAutofocus: landing page whose only job is this search
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-600 bg-slate-800 text-sm shadow-lg">
          {results.map((r) => (
            <li key={`${r.label}-${r.postcode}`}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-slate-100 hover:bg-slate-700"
                onClick={() => {
                  onSelect({
                    lat: r.lat,
                    lng: r.lng,
                    label: `${r.label}, ${r.postcode}`,
                  });
                  setQ(r.label);
                  setOpen(false);
                }}
              >
                {r.label} <span className="text-slate-400">{r.postcode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
