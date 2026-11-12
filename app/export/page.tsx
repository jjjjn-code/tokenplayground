"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cssFiles, serialiseDtcg } from "@/src/lib/tokens";
import { useStore } from "../_lib/store";

/** Local export, to check the CSS output before push arrives in phase 3. */
export default function ExportPage() {
  const { set } = useStore();
  const files = useMemo(() => cssFiles(set), [set]);
  const [active, setActive] = useState(files[0]?.path ?? "");
  const file = files.find((f) => f.path === active) ?? files[0];
  const lines = file.block.split("\n");

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 pl-16 md:pl-4">
        <div>
          <h1 className="text-sm font-medium">Export CSS</h1>
          <p className="text-xs text-muted-foreground">What push will write. Each file only changes inside the managed block. Paths are provisional.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => download("tokens.json", JSON.stringify(serialiseDtcg(set), null, 2) + "\n", "application/json")}>
          <FileJson className="size-3.5" /> Token data (JSON)
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={file.path} onValueChange={setActive} className="min-w-0">
            <TabsList className="h-auto flex-wrap">
              {files.map((f) => (
                <TabsTrigger key={f.path} value={f.path} className="font-mono text-xs">{f.path}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(file.block);
                  toast.success(`Copied ${file.path}`);
                } catch {
                  toast.error("Copy failed");
                }
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={() => download(file.path.split("/").pop()!, file.block + "\n", "text/css")}>
              <Download className="size-3.5" /> Download
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30" tabIndex={0} aria-label={`Generated CSS for ${file.path}`}>
          <pre className="py-3 font-mono text-[12.5px] leading-6">
            {lines.map((l, i) => (
              <div key={i} className="flex">
                <span className="w-12 shrink-0 pr-4 text-right text-muted-foreground/60 select-none">{i + 1}</span>
                <span className="whitespace-pre pr-4">{l}</span>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
