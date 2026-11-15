// The viewer is served on the internet. It must not contain the editor or any admin code.
// Run after the viewer build. Exits 1 with the offending strings if anything leaks.
//   node scripts/check-viewer-bundle.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = ["tiptap", "prosemirror", "ProseMirror", "/api/admin", "/api/auth", "mermaid.initialize", "docs-preview", "preview-token", "publish-check", "X-XSRF-TOKEN"];
const dir = new URL("../dist/viewer/", import.meta.url).pathname;
if (!existsSync(dir)) { console.error(`${dir} does not exist: build it first`); process.exit(2); }

function walk(d) {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

let bad = 0;
const files = walk(dir).filter((f) => /\.(js|css|html|map)$/.test(f));
let all = "";
for (const f of files) {
  const text = readFileSync(f, "utf8");
  all += text;
  for (const s of FORBIDDEN) {
    if (text.includes(s)) { console.error(`LEAK: ${f.replace(dir, "")} contains "${s}"`); bad++; }
  }
}
if (!all.includes("static-data")) { console.error("MISSING: the viewer no longer reads the static-data tag"); bad++; }
console.log(`viewer: checked ${files.length} files, ${(all.length / 1024).toFixed(0)} KiB of text`);
if (bad) { console.error(`${bad} problem(s). The viewer bundle must stay read-only.`); process.exit(1); }
console.log("viewer bundle is clean");
