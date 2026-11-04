import type { Metadata } from "next";
import ShadowExplorer from "@/components/shadow3d/ShadowExplorerClient";

export const metadata: Metadata = {
  title: "Shadow explorer · Dagsbirta",
  description:
    "See sun and shadow at any spot in Reykjavík, any time of day and year, in 3D.",
};

export default function ShadowsPage() {
  return <ShadowExplorer />;
}
