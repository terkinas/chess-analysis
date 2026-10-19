import type { Metadata } from "next";
import SettingsPanel from "../components/SettingsPanel";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Settings — Gambit",
};

export default function SettingsPage() {
  return (
    <>
      <SiteHeader current="settings" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <SettingsPanel />
      </main>
    </>
  );
}
