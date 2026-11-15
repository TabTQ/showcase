import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared/fonts";
import "../shared/styles.css";
import "../shared/docs/docs.css";
import { DocRenderer, type RenderContext } from "../shared/docs/DocRenderer";
import { useCurrentTheme } from "../shared/docs/theme";
import type { PublicPage } from "../shared/docs/types";
import { assetHref, bundleBase, staticDataFile } from "../shared/docs/static";
import { WebappFrame } from "../shared/docs/WebappFrame";
import { applyTheme, loadTheme, nextTheme, type ThemeChoice } from "../shared/theme";

// The page as shown on GitHub Pages: exactly this page, read-only. No tree, no search, no other pages.
// The shell has a <meta name="static-data"> tag that names a JSON file next to the page. That file is read, files use the
// "file" path it lists, and webapps are at app/<bundle>/ relative to the page. There is no API mode.
let STATIC_FILE: string | null = null;
let STATIC_ERROR: string | null = null;
try {
  STATIC_FILE = staticDataFile();
  if (STATIC_FILE === null) STATIC_ERROR = "This page has no data file.";
} catch (e) { STATIC_ERROR = (e as Error).message; }

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function App() {
  const [page, setPage] = useState<PublicPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ThemeChoice>(loadTheme);
  useEffect(() => applyTheme(choice), [choice]);
  const theme = useCurrentTheme();

  useEffect(() => {
    if (STATIC_ERROR || STATIC_FILE === null) { setError(STATIC_ERROR ?? "This page has no data file."); return; }
    fetch(STATIC_FILE, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Nothing here." : `This page could not be loaded (HTTP ${r.status}).`);
        return (await r.json()) as PublicPage;
      })
      .then((p) => { setPage(p); document.title = p.title; })
      .catch((e: Error) => setError(e.message));
  }, []);

  const ctx: RenderContext | null = useMemo(() => page && {
    assetUrl: (sha) => assetHref(sha, page.assets, true),
    dark: theme === "dark",
    pageLink: (a) => ({ href: typeof a.href === "string" && a.href.startsWith("https://") ? a.href : null }),
    embed: (a, key) => {
      const e = page.embeds[a.bundle];
      if (!e) return null;
      return (
        <div key={key} className="dx-embed">
          <WebappFrame base={bundleBase(a.bundle, true)} settings={e.settings} theme={theme} title="Embedded app" heightOverride={a.height ?? null} />
        </div>
      );
    },
  }, [page, theme]);

  if (error) return <div className="wrap"><div className="login" role="alert"><h2>{error}</h2></div></div>;
  if (!page || !ctx) return <div className="wrap"><p className="sub" style={{ marginTop: 40 }}>Loading…</p></div>;

  if (page.kind === "webapp" && page.settings?.display !== "framed" && page.bundle) {
    return <div className="dx-full"><WebappFrame base={bundleBase(page.bundle.sha, true)} settings={page.settings!} theme={theme} title={page.title} fill /></div>;
  }

  const updated = formatDate(page.updatedAt);
  return (
    <>
      <header className="dx-pubhead">
        <span className="t">{page.title}</span>
        <button className="btn" onClick={() => setChoice(nextTheme(choice))} aria-label="Change theme">◐ Theme</button>
      </header>
      <main className="dx-pubbody">
        <h1 className="title">{page.title}</h1>
        {updated && <div className="updated">Updated {updated}</div>}
        <article className="doc">
          {page.kind === "rich" ? <DocRenderer doc={page.body} ctx={ctx} /> : (
            <>
              <DocRenderer doc={page.intro} ctx={ctx} />
              {page.bundle && <div className="dx-embed"><WebappFrame base={bundleBase(page.bundle.sha, true)} settings={page.settings!} theme={theme} title={page.title} /></div>}
            </>
          )}
        </article>
      </main>
      <footer className="dx-pubfoot"><span>{updated ? `Last updated ${updated}` : ""}</span><span>Shared page, read only</span></footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
