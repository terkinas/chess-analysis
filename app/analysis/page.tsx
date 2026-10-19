import type { Metadata } from "next";
import AnalysisBoard from "../components/AnalysisBoard";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Analysis — Gambit",
};

export default function AnalysisPage() {
  return (
    <>
      <SiteHeader current="analysis" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <AnalysisBoard />
      </main>
    </>
  );
}
