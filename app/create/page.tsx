"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComponentCreator } from "../_components/ComponentCreator";
import { TokenEditor } from "../_components/TokenEditor";

export default function CreatePage() {
  const [mode, setMode] = useState<"component" | "single">("component");
  const router = useRouter();
  return (
    <main className="main">
      <div className="page-head">
        <h1>Create tokens</h1>
        <div className="seg" role="group" aria-label="What to create">
          <button type="button" aria-pressed={mode === "component"} onClick={() => setMode("component")}>Component tokens</button>
          <button type="button" aria-pressed={mode === "single"} onClick={() => setMode("single")}>Primitive or semantic token</button>
        </div>
      </div>
      {mode === "component" ? (
        <ComponentCreator />
      ) : (
        <div className="narrow">
          <TokenEditor onDone={(saved) => router.push(saved ? `/?token=${saved.name}` : "/")} />
        </div>
      )}
    </main>
  );
}
