// Packs the built bundles for the Java app.
//   node scripts/pack.mjs <distDir> <resourcesDir>
// distDir:      where the builds are (web/dist). Needs editor/ and viewer/ inside.
// resourcesDir: the jar's resources folder (src/main/resources).
// Result: <resourcesDir>/static/ (the editor) and <resourcesDir>/static-export/viewer/ with a files.txt
// (one relative path per line, sorted). The files.txt lets the server list the viewer without scanning the class path.
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

if (process.argv.length < 4) { console.error("usage: node scripts/pack.mjs <distDir> <resourcesDir>"); process.exit(2); }
const dist = resolve(process.argv[2]);
const res = resolve(process.argv[3]);

function walk(d) {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
for (const part of ["editor", "viewer"]) {
  if (!existsSync(join(dist, part, "index.html"))) { console.error(`${join(dist, part)} has no index.html: build it first`); process.exit(2); }
}

const staticDir = join(res, "static");
rmSync(staticDir, { recursive: true, force: true });
cpSync(join(dist, "editor"), staticDir, { recursive: true });
console.log(`editor: ${walk(staticDir).length} files -> static/`);

rmSync(join(res, "static-export"), { recursive: true, force: true });
const dest = join(res, "static-export", "viewer");
cpSync(join(dist, "viewer"), dest, { recursive: true });
const files = walk(dest).map((p) => relative(dest, p).split("\\").join("/")).filter((p) => p !== "files.txt").sort();
writeFileSync(join(dest, "files.txt"), files.join("\n") + "\n");
console.log(`viewer: ${files.length} files -> static-export/viewer/`);
