import type { Metadata } from "next";
import HistoryList from "../components/HistoryList";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "History — Gambit",
};

export default function HistoryPage() {
  return (
    <>
      <SiteHeader current="history" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
        <h1 className="text-lg font-semibold text-foreground">Game history</h1>
        <HistoryList />
      </main>
    </>
  );
}
