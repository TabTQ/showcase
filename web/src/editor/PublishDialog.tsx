import { fmtBytes } from "../shared/util";
import { useEffect, useMemo, useState } from "react";
import { api } from "../shared/api";
import { useToast } from "../shared/components/Toast";
import type { PMNode } from "../shared/docs/types";
import { blockDiff, summarize } from "./docDiff";
import { A, go, when, type DocsConfig, type PageDetail, type PublishCheck } from "./docsApi";
import { PlacementFields, Sheet } from "./Dialogs";
import { cleanSlugInput, dialogRules, githubGate, githubPageUrl, githubToast, notConfiguredText, slugFromTitle, slugProblem, targetsBody } from "./githubUi";
import { siblings, type TreeItem } from "./treeModel";

/**
 * Page settings and Publish in one dialog. One target: GitHub Pages. Publish copies the current draft to the site.
 * Unpublish takes the folder offline. Save settings only changes the folder of a page that is already live.
 */
export function PublishDialog({ page, items, config, onClose, onChanged, fail }: {
  page: PageDetail; items: TreeItem[]; config: DocsConfig | null; onClose: () => void; onChanged: () => void; fail: (e: any) => void;
}) {
  const toast = useToast();
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const ghAvailable = githubGate(config);
  const [slug, setSlug] = useState(page.githubSlug ?? slugFromTitle(page.title));
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const before = siblings(items, page.parentId);
  const at = before.findIndex((i) => i.id === page.id);
  const [placement, setPlacement] = useState({ parentId: page.parentId, afterId: at > 0 ? before[at - 1].id : null });

  useEffect(() => { api<PublishCheck>(`${A}/pages/${page.id}/publish-check`).then(setCheck).catch(fail); }, [page.id, page.version, fail]);

  const live = page.state !== "internal";
  useEffect(() => {
    const bad = ghAvailable ? slugProblem(slug) : null;
    if (!ghAvailable || !slug) { setSlugMsg(null); return; }
    if (bad) { setSlugMsg({ ok: false, message: bad }); return; }
    const t = setTimeout(() => {
      api(`${A}/github/check?slug=${encodeURIComponent(slug)}&pageId=${page.id}`)
        .then((r) => setSlugMsg({ ok: r.ok, message: r.ok ? `✓ ${r.message}` : r.message }))
        .catch(() => setSlugMsg(null));
    }, 250);
    return () => clearTimeout(t);
  }, [slug, ghAvailable, page.id]);

  const diffSummary = useMemo(() => {
    if (!check || page.kind !== "rich") return null;
    if (!check.liveBody) return "First publish: the whole page goes live.";
    const s = summarize(blockDiff(check.liveBody as PMNode, page.body as PMNode));
    return s === "no changes" && check.liveTitle === page.title ? "No changes since the live version." : `${check.liveTitle !== page.title ? "Title changed. " : ""}${s}.`;
  }, [check, page]);

  // Every action reloads the page's version first: the dialog may have been open while something else saved.
  const withVersion = async () => (await api<PageDetail>(`${A}/pages/${page.id}`)).version;
  const placementChanged = placement.parentId !== page.parentId || placement.afterId !== (at > 0 ? before[at - 1].id : null);
  const run = async (what: "publish" | "unpublish" | "save") => {
    setBusy(true);
    try {
      if (placementChanged) {
        await api(`${A}/pages/${page.id}/move`, { method: "POST", body: { ...placement, version: await withVersion() } });
      }
      if (what === "publish") {
        const r = await api(`${A}/pages/${page.id}/publish`, { method: "POST", body: targetsBody({ slug, version: await withVersion() }) });
        toast(githubToast(r) || "Published.");
      } else if (what === "unpublish") {
        await api(`${A}/pages/${page.id}/unpublish`, { method: "POST", body: { version: await withVersion() } });
        toast("Unpublished. The page leaves GitHub Pages in about a minute.");
      } else {
        const body = targetsBody({ slug, version: await withVersion() });
        if (body.githubSlug !== (page.githubSlug ?? null)) await api(`${A}/pages/${page.id}/targets`, { method: "PUT", body });
        toast("Settings saved.");
      }
      onChanged();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const rules = dialogRules({
    live, githubAvailable: ghAvailable, slug, slugOk: slugMsg ? slugMsg.ok : null,
    problems: check?.problems.length ?? 0, busy, currentSlug: page.githubSlug ?? null,
  });
  const siteUrl = config?.github?.siteUrl ?? "";

  if (!ghAvailable) {
    return (
      <Sheet title={`Publish “${page.title}”`} onClose={onClose} wide>
        <div className="dx-banner" role="status">{notConfiguredText(config)}</div>
        <p className="hint" style={{ display: "block" }}>Pages stay internal until publishing is set up. See the README for the DOCS_GH_* settings.</p>
        <div className="mrow dx-acts"><span className="grow" /><button className="btn" onClick={onClose}>Close</button></div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`Publish “${page.title}”`} onClose={onClose} wide>
      <p className="hint">Draft v{check?.draftVersion ?? page.latestVersion}{live && check?.publishedVersion ? ` · public now shows v${check.publishedVersion} (published ${when(check.publishedAt)})` : " · not public"}</p>
      <div className="caption">Where to publish</div>
      <div className="dx-target on">
        <div className="dx-thead">
          <b>GitHub Pages{config?.github?.dryRun ? " (dry run)" : ""}</b>
          <span className="dx-tstate">{live && page.githubSlug ? "Live now" : "Not live yet"}</span>
        </div>
        <p>A static copy in your GitHub Pages site. Takes about a minute. Anyone with the link can view this one page.</p>
        <label htmlFor="dx-slug" className="dx-sr">Folder name</label>
        <div className="dx-hostin">
          <span className="mono muted">{siteUrl ? (siteUrl.endsWith("/") ? siteUrl : siteUrl + "/") : "https://…/"}</span>
          <input id="dx-slug" type="text" value={slug} autoComplete="off" spellCheck={false} placeholder="my-page"
            onChange={(e) => setSlug(cleanSlugInput(e.target.value))} />
          <span className="mono muted dx-tail">/</span>
        </div>
        {slugMsg && <div className="hint" style={{ color: slugMsg.ok ? "var(--ok)" : "var(--bad)" }} role="status">{slugMsg.message}</div>}
        {rules.takesGithubOffline && <div className="hint" style={{ color: "var(--warn)" }}>Changing the folder takes {githubPageUrl(siteUrl, page.githubSlug ?? "")} offline.</div>}
      </div>
      <PlacementFields items={items} movingId={page.id} parentId={placement.parentId} afterId={placement.afterId} onChange={(p, a) => setPlacement({ parentId: p, afterId: a })} />
      <div className="caption">Pre-publish checks</div>
      {!check ? <p className="hint">Checking…</p> : (
        <div className="dx-checks">
          {check.problems.map((p) => <Check key={p} m="b">{p}</Check>)}
          {diffSummary && <Check m="ok">{diffSummary} {check.liveBody && <a href={`#/p/${page.id}/history`} onClick={() => go(`#/p/${page.id}/history`)}>Show diff</a>}</Check>}
          {check.links.map((l) => l.public && l.href
            ? <Check key={l.pageId} m="ok">Link to <b>{l.title}</b> → <span className="mono">{l.href.replace("https://", "").replace(/\/$/, "")}</span> (public)</Check>
            : <Check key={l.pageId} m="w">Link to <b>{l.title ?? "a deleted page"}</b> is {l.missing ? "broken" : "internal"}, so visitors see it as <b>plain text</b>.</Check>)}
          {check.embeds.map((e) => e.source === "missing"
            ? <Check key={e.pageId} m="w">Embedded webapp <b>{e.title ?? "(deleted page)"}</b> has no app uploaded: it will be left out.</Check>
            : <Check key={e.pageId} m="ok">Embedded webapp <b>{e.title}</b> ({e.source === "published" ? "published" : "current draft"} bundle b{e.bundleSeq}, {fmtBytes(e.size ?? 0)}) will be included.</Check>)}
          {page.kind === "webapp" && check.bundle && <Check m="ok">App bundle b{check.bundle.seq} ({check.bundle.files.length} files, {fmtBytes(check.bundle.size)}) goes live.</Check>}
          <Check m="ok">{check.files.length} file{check.files.length === 1 ? "" : "s"} will be copied to the site{check.fileBytes ? ` · ${fmtBytes(check.fileBytes)} in total` : ""}.</Check>
        </div>
      )}
      <div className="mrow dx-acts">
        {rules.showUnpublish && <button className="btn danger" disabled={busy} onClick={() => run("unpublish")}>Unpublish</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        {live && <button className="btn" disabled={!rules.canSave} onClick={() => run("save")}>Save settings only</button>}
        <button className="btn pri" disabled={!rules.canPublish} onClick={() => run("publish")}>Publish v{check?.draftVersion ?? page.latestVersion}</button>
      </div>
      {live && <p className="hint" style={{ display: "block" }}><b>Save settings only</b> moves the current published version{check?.publishedVersion ? ` (v${check.publishedVersion})` : ""}, with no new version.{" "}
        <b>Publish v{check?.draftVersion ?? page.latestVersion}</b> also sends the new draft.</p>}
    </Sheet>
  );
}

function Check({ m, children }: { m: "ok" | "w" | "b"; children: React.ReactNode }) {
  return <div className="dx-check"><span className={`m ${m}`} aria-hidden="true">{m === "ok" ? "✓" : m === "w" ? "!" : "✗"}</span><div>{children}</div></div>;
}
