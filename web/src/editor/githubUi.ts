// Pure helpers for the GitHub Pages parts of the editor: folder names, the dialog's rules and the status wording.

export const RESERVED_SLUGS = ["viewer", "assets", "a", "app", "api", "static", "index"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface GithubConfig { enabled: boolean; siteUrl: string | null; dryRun: boolean; configError: string | null }
export type GithubSyncState = "off" | "idle" | "pending" | "building" | "live" | "error";
export interface GithubStatus {
  enabled: boolean; dryRun: boolean; state: GithubSyncState; message: string | null; lastSyncedAt: string | null; siteUrl: string | null; files: number | null;
}

export type Tone = "up" | "warn" | "down" | "unknown";

/** A folder name from a page title: lower case, letters and digits, single dashes, at most 63 characters. */
export function slugFromTitle(title: string): string {
  const s = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/, "");
  if (!s) return "";
  return RESERVED_SLUGS.includes(s) ? `${s}-page`.slice(0, 63) : s;
}

/** Null when the folder name is fine, otherwise a short reason. */
export function slugProblem(slug: string): string | null {
  if (!slug) return "Enter a folder name.";
  if (RESERVED_SLUGS.includes(slug)) return `“${slug}” is reserved. Pick another name.`;
  if (!SLUG_RE.test(slug)) return "Use lower-case letters, digits and dashes. Start with a letter or digit. At most 63 characters.";
  return null;
}

/** Makes what the owner types safe to show: lower case, spaces become dashes. */
export function cleanSlugInput(v: string): string { return v.toLowerCase().replace(/\s+/g, "-"); }

/** True when publishing is switched on and fully set up. */
export function githubGate(config: { github?: GithubConfig | null } | null | undefined): boolean { return !!config?.github?.enabled; }

export function githubPageUrl(siteUrl: string | null | undefined, slug: string): string {
  const base = siteUrl ? (siteUrl.endsWith("/") ? siteUrl : siteUrl + "/") : "";
  return `${base}${slug}/`;
}

export interface DialogInput {
  live: boolean;            // the page has a published version now
  githubAvailable: boolean; // config.github.enabled
  slug: string; slugOk: boolean | null;   // slugOk: null = not checked yet
  problems: number; busy: boolean;
  currentSlug: string | null;             // what the page has now
}
export interface DialogRules {
  canPublish: boolean; canSave: boolean; showUnpublish: boolean; takesGithubOffline: boolean;
}

/** The dialog's enable and disable rules in one place, so they can be tested. */
export function dialogRules(i: DialogInput): DialogRules {
  const valid = i.githubAvailable && slugProblem(i.slug) === null && i.slugOk !== false;
  return {
    canPublish: valid && i.problems === 0 && !i.busy,
    canSave: valid && i.live && !i.busy,
    showUnpublish: i.live,
    takesGithubOffline: i.live && !!i.currentSlug && i.slug !== i.currentSlug,
  };
}

/** The body of POST /publish and PUT /targets. */
export function targetsBody(i: { slug: string; version: number }): { githubSlug: string | null; version: number } {
  return { githubSlug: i.slug || null, version: i.version };
}

export function hasGithubBadge(item: { state: string; githubSlug?: string | null }): boolean {
  return item.state !== "internal" && !!item.githubSlug;
}

export interface StatusText { title: string; detail: string; tone: Tone }

/** Words for the top bar and tooltips. Returns null when GitHub is off, so nothing is drawn. */
export function statusText(s: GithubStatus | null, fmtWhen: (iso: string | null) => string = (x) => x ?? ""): StatusText | null {
  if (!s || !s.enabled || s.state === "off") return null;
  const dry = s.dryRun ? " (dry run)" : "";
  switch (s.state) {
    case "live": {
      const parts = [s.lastSyncedAt ? `Last sent ${fmtWhen(s.lastSyncedAt)}` : "", s.files != null ? `${s.files} files` : ""].filter(Boolean);
      return { title: `GitHub Pages: live${dry}`, detail: parts.join(" · "), tone: "up" };
    }
    case "building": return { title: `GitHub Pages: building${dry}`, detail: s.message || "Sent. GitHub is updating the site, usually under a minute.", tone: "warn" };
    case "pending": return { title: `GitHub Pages: updating${dry}`, detail: s.message || "Changes are queued and go out in a moment.", tone: "warn" };
    case "error": return { title: "GitHub Pages: not updated", detail: s.message || "The last update failed.", tone: "down" };
    default: return { title: `GitHub Pages: ready${dry}`, detail: s.message || "Nothing waiting to be sent.", tone: "unknown" };
  }
}

export const isBusyState = (state: GithubSyncState | undefined) => state === "pending" || state === "building";

/** The toast sentence about GitHub after a publish. */
export function githubToast(r: { githubUrl?: string | null; github?: { state: string; message?: string | null } | null } | null | undefined): string {
  const g = r?.github;
  if (!g || g.state === "off") return "";
  if (g.state === "error") return `GitHub Pages was not updated: ${g.message || "unknown error"} Use Retry in the top bar.`;
  if (g.state === "pending" || g.state === "building") return `GitHub Pages is updating, about a minute${r?.githubUrl ? `: ${r.githubUrl}` : "."}`;
  return `GitHub Pages: ${r?.githubUrl ?? "live"}`;
}

/** The text shown in the Publish dialog when publishing is not set up. */
export function notConfiguredText(config: { github?: GithubConfig | null } | null | undefined): string {
  const e = config?.github?.configError;
  return e ? `Publishing is switched on but not set up yet: ${e}` : "Publishing is not switched on. Set the DOCS_GH_* settings on the server to publish pages to GitHub Pages.";
}
