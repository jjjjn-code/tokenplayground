// Build the Figma plugin into figma-plugin/dist (code.js and ui.html).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../figma-plugin/", import.meta.url).pathname;
mkdirSync(`${root}dist`, { recursive: true });

await build({ entryPoints: [`${root}src/code.ts`], bundle: true, outfile: `${root}dist/code.js`, format: "iife", target: "es2017", logLevel: "warning" });
const ui = await build({ entryPoints: [`${root}src/ui.ts`], bundle: true, write: false, format: "iife", target: "es2017", logLevel: "warning" });
const script = ui.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync(`${root}src/ui.html`, "utf8").replace("/*UI_SCRIPT*/", () => script);
writeFileSync(`${root}dist/ui.html`, html);
console.log("Built figma-plugin/dist/code.js and figma-plugin/dist/ui.html");

// A zip of the plugin, served by Token Library so designers can download it.
// Stored without compression: the files are small and this needs no extra package.
import { crc32 } from "node:zlib";
const entries = ["manifest.json", "dist/code.js", "dist/ui.html"].map((p) => ({ name: `token-library-figma-plugin/${p}`, data: readFileSync(`${root}${p}`) }));
const parts = [];
const central = [];
let offset = 0;
for (const e of entries) {
  const name = Buffer.from(e.name);
  const crc = crc32(e.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8); local.writeUInt32LE(0x00210000, 10); // fixed date: 1 January 1980
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(e.data.length, 18); local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  parts.push(local, name, e.data);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(0, 10); c.writeUInt32LE(0x00210000, 12); c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(e.data.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += 30 + name.length + e.data.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const publicDir = new URL("../public/", import.meta.url).pathname;
mkdirSync(publicDir, { recursive: true });
writeFileSync(`${publicDir}token-library-figma-plugin.zip`, Buffer.concat([...parts, cd, end]));
console.log("Built public/token-library-figma-plugin.zip");
