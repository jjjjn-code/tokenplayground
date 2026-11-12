import raw from "@/data/dummy/tokens.json";
import { parseDtcg, validateTokenSet, type Layer } from "@/src/lib/tokens";

/** Phase 1 status page. The token table and creation form arrive in phase 2. */
export default function Home() {
  const set = parseDtcg(raw);
  const issues = validateTokenSet(set);
  const count = (s: string) => issues.filter((i) => i.severity === s).length;
  const layers: Layer[] = ["primitive", "semantic", "component"];

  return (
    <>
      <header>
        <h1>Token tool</h1>
        <div className="sub">Phase 1: foundations. Dummy token set.</div>
      </header>
      <main>
        <table>
          <thead>
            <tr><th>Layer</th><th>Tokens</th></tr>
          </thead>
          <tbody>
            {layers.map((l) => (
              <tr key={l}><td>{l}</td><td>{set.tokens.filter((t) => t.layer === l).length}</td></tr>
            ))}
          </tbody>
        </table>
        <p className={count("error") ? "err" : "ok"}>
          {count("error")} errors, {count("warning")} warnings, {count("info")} notes.
        </p>
      </main>
    </>
  );
}
