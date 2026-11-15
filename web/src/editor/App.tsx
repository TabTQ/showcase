import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../shared/api";
import { Login } from "../shared/components/Login";
import { Palette, usePaletteHotkey, type PaletteItem } from "../shared/components/Palette";
import { useToast } from "../shared/components/Toast";
import { applyTheme, loadTheme, nextTheme, type ThemeChoice } from "../shared/theme";
import { A, go, loadTree, when, type DocsConfig } from "./docsApi";
import { githubPageUrl, isBusyState, statusText, type GithubStatus } from "./githubUi";
import { DeleteDialog, MoveDialog, NewPageDialog, RenameDialog } from "./Dialogs";
import { PageView } from "./PageView";
import { Trash } from "./Trash";
import { Tree, type TreeAction } from "./Tree";
import type { TreeItem } from "./treeModel";

// The editor (TipTap, and Mermaid on demand) and the history view are lazy chunks: reading a page never loads them.
const Editor = lazy(() => import("./Editor"));
const History = lazy(() => import("./History"));
interface AuthStatus { authenticated: boolean; mode: "all" | "edit" | "none"; passwordConfigured: boolean }

type Route = { name: "home" } | { name: "page" | "edit" | "history" | "publish"; id: number } | { name: "trash" };

export function parseRoute(hash: string): Route {
  const m = /^#\/p\/(\d+)(?:\/(edit|history|publish))?$/.exec(hash);
  if (m) return { name: (m[2] as "edit" | "history" | "publish" | undefined) ?? "page", id: Number(m[1]) };
  if (hash.startsWith("#/trash")) return { name: "trash" };
  return { name: "home" };
}

function useRoute(): Route {
  const [r, setR] = useState(() => parseRoute(location.hash));
  useEffect(() => { const h = () => setR(parseRoute(location.hash)); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  return r;
}

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [forceLogin, setForceLogin] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);
  const loadAuth = useCallback(() => {
    api<AuthStatus>("/api/auth/status").then((a) => { setAuth(a); setOffline(null); }).catch((e) => setOffline(e.message));
  }, []);
  useEffect(loadAuth, [loadAuth]);

  if (offline) return <div className="wrap"><div className="login" role="alert"><h2>Cannot reach the server</h2><p className="sub">{offline}</p><button className="btn" onClick={loadAuth}>Try again</button></div></div>;
  if (!auth) return <div className="wrap"><p className="sub" style={{ marginTop: 40 }}>Loading…</p></div>;
  if (forceLogin || (auth.mode !== "none" && !auth.authenticated)) {
    return <Login brand="Showcase Docs" hashVariable="DOCS_PASSWORD_HASH" passwordConfigured={auth.passwordConfigured} onLoggedIn={() => { setForceLogin(false); loadAuth(); }} />;
  }
  return <Shell auth={auth} onUnauthorized={() => { if (auth.mode !== "none") setForceLogin(true); }}
    onLogout={() => api("/api/auth/logout", { method: "POST" }).finally(() => { setForceLogin(false); loadAuth(); })} />;
}

export type Pending = { kind: "new"; parentId: number | null; afterId: number | null; pageKind: "rich" | "webapp" }
  | { kind: "move" | "delete" | "rename"; item: TreeItem };

function Shell({ auth, onUnauthorized, onLogout }: { auth: AuthStatus; onUnauthorized: () => void; onLogout: () => void }) {
  const route = useRoute();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const [items, setItems] = useState<TreeItem[] | null>(null);
  const [config, setConfig] = useState<DocsConfig | null>(null);
  const [ghStatus, setGhStatus] = useState<GithubStatus | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const fail = useCallback((e: any) => {
    if (e?.status === 401) onUnauthorized(); else toast(e?.message ?? String(e));
  }, [onUnauthorized, toast]);
  const refresh = useCallback(() => {
    loadTree().then(setItems).catch(fail);
    api<GithubStatus>(`${A}/github/status`).then(setGhStatus).catch(() => setGhStatus(null));
  }, [fail]);
  // A sync takes a few seconds: keep looking while one is queued or running.
  useEffect(() => {
    if (!isBusyState(ghStatus?.state)) return;
    const t = setInterval(() => api<GithubStatus>(`${A}/github/status`).then(setGhStatus).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [ghStatus?.state]);
  const retryGh = () => api<GithubStatus>(`${A}/github/retry`, { method: "POST" }).then(setGhStatus).catch(fail);
  const ghText = statusText(ghStatus, (iso) => (iso ? when(iso) : ""));
  useEffect(() => {
    refresh(); api<DocsConfig>(`${A}/config`).then(setConfig).catch(fail);
  }, [refresh, fail]);
  useEffect(() => setDrawer(false), [route]);

  usePaletteHotkey(useCallback(() => setPalette((o) => !o), []));
  const paletteItems: PaletteItem[] = useMemo(() => [
    { group: "Actions", title: "New page", hint: "top level", run: () => setPending({ kind: "new", parentId: null, afterId: null, pageKind: "rich" }) },
    { group: "Actions", title: "New webapp page", hint: "top level", run: () => setPending({ kind: "new", parentId: null, afterId: null, pageKind: "webapp" }) },
    { group: "Actions", title: "Trash", hint: "deleted pages", run: () => go("#/trash") },
    ...(items ?? []).map((i) => ({ group: "Pages", title: i.title, hint: i.githubSlug ?? (i.kind === "webapp" ? "webapp" : ""), run: () => go(`#/p/${i.id}`) })),
  ], [items]);

  const currentId = "id" in route ? route.id : null;

  const onAction = (a: TreeAction, item: TreeItem | null) => {
    if (a === "new" || a === "newChild" || a === "newWebapp") {
      setPending({ kind: "new", parentId: a === "new" ? null : item?.id ?? null, afterId: null, pageKind: a === "newWebapp" ? "webapp" : "rich" });
    } else if (item && (a === "move" || a === "delete" || a === "rename")) setPending({ kind: a, item });
    else if (item && a === "duplicate") {
      api(`${A}/pages/${item.id}/duplicate`, { method: "POST" }).then((p) => { refresh(); go(`#/p/${p.id}`); toast("Duplicated."); }).catch(fail);
    } else if (item && a === "copyLink" && item.githubSlug) {
      const url = githubPageUrl(config?.github?.siteUrl, item.githubSlug);
      navigator.clipboard?.writeText(url).then(() => toast("Link copied.")).catch(() => toast(url));
    } else if (item && a === "settings") go(`#/p/${item.id}/publish`);
  };

  const onMove = (id: number, parentId: number | null, afterId: number | null) => {
    api(`${A}/pages/${id}`).then((p) => api(`${A}/pages/${id}/move`, { method: "POST", body: { parentId, afterId, version: p.version } }))
      .then(refresh).catch((e) => { fail(e); refresh(); });
  };

  const side = (
    <aside className={`dx-side${drawer ? " open" : ""}`} aria-label="Pages">
      {items ? <Tree items={items} currentId={currentId} onAction={onAction} onMove={onMove} />
        : <p className="hint">Loading pages…</p>}
      <div className="dx-legend"><span><i className="dx-dot pub" />public</span><span><i className="dx-dot draft" />unpublished changes</span><span><i className="dx-dot" />internal</span></div>
      <a className="dx-trashlink" href="#/trash">🗑 Trash</a>
    </aside>
  );

  return (
    <div className="dx-app">
      <header className="dx-bar">
        <button className="btn sm dx-menu" onClick={() => setDrawer((d) => !d)} aria-label="Pages" aria-expanded={drawer}>☰</button>
        <a className="brand" href="#/"><i aria-hidden="true" />Showcase Docs</a>
        <span className="grow" />
        {ghText && ghStatus && (
          <span className={`dx-ghstate ${ghText.tone}`} role="status" title={ghText.detail}>
            <i className={`dot ${ghText.tone}`} />{ghText.title}
            {ghStatus.state === "error" && <button className="btn sm" onClick={retryGh}>Retry</button>}
          </span>
        )}
        <button className="kbd-search dx-search" onClick={() => setPalette(true)} aria-label="Search pages"><span>Search pages</span><kbd>Ctrl K</kbd></button>
        <button className="btn sm" onClick={() => setTheme(nextTheme(theme))} aria-label="Change theme">Theme: {theme}</button>
        {auth.mode !== "none" && auth.authenticated && <button className="btn sm" onClick={onLogout}>Sign out</button>}
      </header>
      <div className="dx-layout">
        {drawer && <div className="dx-scrim" onClick={() => setDrawer(false)} />}
        {side}
        <main className="dx-main">
          {route.name === "home" && <Home items={items} onNew={() => setPending({ kind: "new", parentId: null, afterId: null, pageKind: "rich" })} />}
          {route.name === "trash" && <Trash onChanged={refresh} fail={fail} />}
          {(route.name === "page" || route.name === "publish") && <PageView key={route.id} id={route.id} publish={route.name === "publish"} items={items ?? []} config={config} onChanged={refresh} fail={fail} />}
          {route.name === "edit" && (
            <Suspense fallback={<p className="hint">Loading the editor…</p>}>
              <Editor key={route.id} id={route.id} items={items ?? []} config={config} onChanged={refresh} fail={fail} />
            </Suspense>
          )}
          {route.name === "history" && (
            <Suspense fallback={<p className="hint">Loading the history…</p>}>
              <History key={route.id} id={route.id} items={items ?? []} onChanged={refresh} fail={fail} />
            </Suspense>
          )}
        </main>
      </div>
      <Palette items={paletteItems} open={palette} onClose={() => setPalette(false)} />
      {pending?.kind === "new" && items && <NewPageDialog pending={pending} items={items} onClose={() => setPending(null)} onDone={(id) => { setPending(null); refresh(); go(`#/p/${id}${pending.pageKind === "rich" ? "/edit" : ""}`); }} fail={fail} />}
      {pending?.kind === "move" && items && <MoveDialog item={pending.item} items={items} onClose={() => setPending(null)} onMove={(p, a) => { setPending(null); onMove(pending.item.id, p, a); }} />}
      {pending?.kind === "rename" && <RenameDialog item={pending.item} onClose={() => setPending(null)} onDone={() => { setPending(null); refresh(); }} fail={fail} />}
      {pending?.kind === "delete" && items && <DeleteDialog item={pending.item} items={items} onClose={() => setPending(null)} onDone={() => { setPending(null); refresh(); if (currentId === pending.item.id) go("#/"); toast("Moved to the Trash."); }} fail={fail} />}
    </div>
  );
}

function Home({ items, onNew }: { items: TreeItem[] | null; onNew: () => void }) {
  return (
    <div className="dx-home">
      <h1>Showcase Docs</h1>
      <p className="sub">Pages are internal until you publish them. Publishing puts a page on your GitHub Pages site, in its own folder.</p>
      {items && items.length === 0 ? <button className="btn pri" onClick={onNew}>Create the first page</button>
        : <p className="hint">Pick a page on the left, or press Ctrl K to search.</p>}
    </div>
  );
}
