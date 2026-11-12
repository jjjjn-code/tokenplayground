import { Suspense } from "react";
import { Overview } from "./_components/Overview";

export default function Home() {
  return (
    <main className="main">
      <Suspense>
        <Overview />
      </Suspense>
    </main>
  );
}
