import { describe, expect, it } from "vitest";
import { cleanSlugInput, dialogRules, githubGate, githubPageUrl, githubToast, hasGithubBadge, notConfiguredText, slugFromTitle, slugProblem, statusText, targetsBody, type DialogInput, type GithubStatus } from "./githubUi";

const base: DialogInput = { live: false, githubAvailable: true, slug: "brain", slugOk: true, problems: 0, busy: false, currentSlug: null };

describe("slug from title", () => {
  it("makes a folder name", () => {
    expect(slugFromTitle("Release notes")).toBe("release-notes");
    expect(slugFromTitle("  Café: Naïve  design!! ")).toBe("cafe-naive-design");
    expect(slugFromTitle("---")).toBe("");
    expect(slugFromTitle("x".repeat(100))).toHaveLength(63);
  });
  it("avoids reserved names", () => {
    expect(slugFromTitle("Viewer")).toBe("viewer-page");
    expect(slugProblem("api")).toMatch(/reserved/);
  });
  it("validates", () => {
    expect(slugProblem("network-map")).toBeNull();
    expect(slugProblem("")).not.toBeNull();
    expect(slugProblem("-x")).not.toBeNull();
    expect(slugProblem("Upper")).not.toBeNull();
    expect(cleanSlugInput("My Page")).toBe("my-page");
  });
  it("builds the page URL", () => {
    expect(githubPageUrl("https://octo.github.io/showcase", "a")).toBe("https://octo.github.io/showcase/a/");
    expect(githubPageUrl("https://octo.github.io/showcase/", "a")).toBe("https://octo.github.io/showcase/a/");
  });
});

describe("dialog rules", () => {
  it("publishes when the folder name is valid", () => {
    expect(dialogRules(base).canPublish).toBe(true);
    expect(dialogRules({ ...base, slugOk: false }).canPublish).toBe(false);
    expect(dialogRules({ ...base, slug: "api" }).canPublish).toBe(false);
    expect(dialogRules({ ...base, slug: "" }).canPublish).toBe(false);
    expect(dialogRules({ ...base, problems: 1 }).canPublish).toBe(false);
    expect(dialogRules({ ...base, busy: true }).canPublish).toBe(false);
    expect(dialogRules({ ...base, githubAvailable: false }).canPublish).toBe(false);
  });
  it("saves settings only for a live page", () => {
    expect(dialogRules(base).canSave).toBe(false);
    expect(dialogRules({ ...base, live: true }).canSave).toBe(true);
    expect(dialogRules({ ...base, live: true }).showUnpublish).toBe(true);
    expect(dialogRules(base).showUnpublish).toBe(false);
  });
  it("warns when a new folder name takes the old one offline", () => {
    const live = { ...base, live: true, currentSlug: "brain" };
    expect(dialogRules(live).takesGithubOffline).toBe(false);
    expect(dialogRules({ ...live, slug: "other" }).takesGithubOffline).toBe(true);
  });
});

describe("request body and gate", () => {
  it("sends the folder name and version", () => {
    expect(targetsBody({ slug: "a", version: 3 })).toEqual({ githubSlug: "a", version: 3 });
  });
  it("reads the config", () => {
    expect(githubGate(null)).toBe(false);
    expect(githubGate({ github: { enabled: true, siteUrl: null, dryRun: false, configError: null } })).toBe(true);
    expect(notConfiguredText({ github: { enabled: true, siteUrl: null, dryRun: false, configError: "DOCS_GH_TOKEN is missing" } })).toMatch(/DOCS_GH_TOKEN/);
    expect(notConfiguredText(null)).toMatch(/DOCS_GH_/);
  });
});

describe("badge and status text", () => {
  it("shows the badge only for live pages", () => {
    expect(hasGithubBadge({ state: "public", githubSlug: "a" })).toBe(true);
    expect(hasGithubBadge({ state: "public-changed", githubSlug: "a" })).toBe(true);
    expect(hasGithubBadge({ state: "internal", githubSlug: "a" })).toBe(false);
    expect(hasGithubBadge({ state: "public" })).toBe(false);
  });
  const s = (state: GithubStatus["state"], more: Partial<GithubStatus> = {}): GithubStatus =>
    ({ enabled: true, dryRun: false, state, message: null, lastSyncedAt: null, siteUrl: null, files: null, ...more });
  it("maps each state", () => {
    expect(statusText(null)).toBeNull();
    expect(statusText(s("off"))).toBeNull();
    expect(statusText({ ...s("live"), enabled: false })).toBeNull();
    expect(statusText(s("live", { files: 14, lastSyncedAt: "x" }), () => "today")).toMatchObject({ title: "GitHub Pages: live", tone: "up", detail: "Last sent today · 14 files" });
    expect(statusText(s("building"))?.tone).toBe("warn");
    expect(statusText(s("pending"))?.title).toBe("GitHub Pages: updating");
    expect(statusText(s("error", { message: "401" }))).toMatchObject({ tone: "down", detail: "401" });
    expect(statusText(s("idle"))?.tone).toBe("unknown");
    expect(statusText(s("live", { dryRun: true }))?.title).toContain("dry run");
  });
  it("words the publish toast", () => {
    expect(githubToast({ github: { state: "pending" } })).toMatch(/about a minute/);
    expect(githubToast({ github: { state: "error", message: "bad token" } })).toMatch(/bad token/);
    expect(githubToast({})).toBe("");
    expect(githubToast({ github: { state: "off" } })).toBe("");
  });
});
