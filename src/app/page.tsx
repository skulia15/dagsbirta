"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddressSearch } from "@/components/shadow3d/AddressSearch";

export default function Home() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">Dagsbirta</h1>
        <p className="mt-2 text-slate-400">
          How much direct sun does your home get? See shade from buildings and
          mountains at any hour of any day, in 3D, and the sun hours for the
          whole year.
        </p>
        <div className="mt-6">
          <AddressSearch
            autoFocus
            onSelect={({ lat, lng, label }) =>
              router.push(
                `/shadows?${new URLSearchParams({ lat: lat.toFixed(6), lng: lng.toFixed(6), label })}`,
              )
            }
          />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Or{" "}
          <Link href="/shadows" className="text-amber-400 hover:underline">
            explore central Reykjavík
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
