import Game from "./components/Game";
import SiteHeader from "./components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader current="play" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <Game />
      </main>
    </>
  );
}
