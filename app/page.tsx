import { Suspense } from "react";
import { Overview } from "./_components/Overview";

export default function Home() {
  return (
    <Suspense>
      <Overview />
    </Suspense>
  );
}
