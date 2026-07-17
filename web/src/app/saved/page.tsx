import type { Metadata } from "next";
import { SavedScreen } from "@/components/saves/saved-screen";

export const metadata: Metadata = { title: "Saved listings" };

// The shortlist lives in localStorage, so this page is a thin server shell
// around a client component that reads the saves context and fetches rows.
export default function SavedPage() {
  return <SavedScreen />;
}
