package dev.showcasedocs;

import static dev.showcasedocs.DocsClient.M;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.showcasedocs.github.FakeGitHub;
import dev.showcasedocs.github.GitHubSync;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Predicate;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * GitHub Pages publishing end to end against a fake GitHub: the tree written for each kind of page, links between pages, the API
 * for publish, targets and unpublish, and a GitHub failure that must not fail or delay the publish.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GitHubPublishingTest {

    static final Path DIR = DocsClient.tempDir();
    static final String PASSWORD = "docs-test-password";
    static final FakeGitHub GH = start();
    static final String SITE = "https://octo.github.io/showcase/";

    static FakeGitHub start() {
        try {
            return new FakeGitHub();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        DocsClient.useTemp(r, DIR);
        r.add("app.auth.password-hash", () -> new BCryptPasswordEncoder(4).encode(PASSWORD));
        r.add("app.auth.mode", () -> "all");
        r.add("docs.github.enabled", () -> "true");
        r.add("docs.github.repo", () -> "octo/showcase");
        r.add("docs.github.branch", () -> "gh-pages");
        r.add("docs.github.token", () -> FakeGitHub.TOKEN);
        r.add("docs.github.api-url", GH::url);
    }

    @AfterAll
    static void stop() {
        GH.close();
    }

    @LocalServerPort int port;
    @Autowired DocsService docs;
    @Autowired GitHubSync github;
    DocsClient c;

    @BeforeEach
    void browser() throws Exception {
        c = new DocsClient(port).login(PASSWORD);
        GH.failPrefix = null;
    }

    // ---------------------------------------------------------------- helpers

    long version(long id) {
        return ((Number) docs.get(id).get("version")).longValue();
    }

    void save(long id, String title, String json) throws Exception {
        docs.save(id, title, M.readTree(json), version(id));
    }

    void publishTo(long id, String slug) {
        docs.publish(id, DocsService.Target.of(slug), version(id), "127.0.0.1", "test");
    }

    /** Waits until the sync run ended and the fake GitHub's branch holds a tree that satisfies {@code ok}. */
    void awaitTree(Predicate<Map<String, byte[]>> ok) {
        Awaitility.await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            assertThat(github.status().state()).isIn(GitHubSync.State.LIVE, GitHubSync.State.ERROR);
            assertThat(ok.test(GH.files())).as("tree: " + GH.files().keySet()).isTrue();
        });
        assertThat(github.status().state()).isEqualTo(GitHubSync.State.LIVE);
    }

    void awaitFile(String path) {
        awaitTree(f -> f.containsKey(path));
    }

    void awaitGone(String path) {
        awaitTree(f -> !f.containsKey(path));
    }

    JsonNode json(String path) throws Exception {
        return M.readTree(GH.text(path));
    }

    long create(String title, String kind) throws Exception {
        return c.json("POST", "/api/admin/docs/pages", Map.of("title", title, "kind", kind), 201).path("id").asLong();
    }

    JsonNode page(long id) throws Exception {
        return c.json("GET", "/api/admin/docs/pages/" + id, null, 200);
    }

    // ---------------------------------------------------------------- the tree

    @Test
    void aRichPageWithAnImageAWebappAndAnEmbedAreWrittenToTheirFolders() throws Exception {
        String img = docs.addAsset(new ByteArrayInputStream(DocsClient.PNG), "net.png").get("sha256").toString();
        long app = docs.create(null, null, "webapp", "Tiny app");
        docs.uploadBundle(app, BundleReaderTest.zip(BundleReaderTest.files("index.html", "<p>app</p>", "x.js", "1")), "a.zip", version(app));
        long rich = docs.create(null, null, "rich", "Notes & more");
        save(rich, "Notes & more", """
                {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]},
                  {"type":"image","attrs":{"sha":"%s","alt":"pic"}},
                  {"type":"webappEmbed","attrs":{"pageId":%d,"height":300}}]}""".formatted(img, app));
        publishTo(rich, "tree-notes");
        publishTo(app, "tree-app");
        awaitFile("tree-app/page.json");
        awaitFile("tree-notes/page.json");

        Map<String, byte[]> files = GH.files();
        assertThat(files).containsKeys(".nojekyll", "viewer/assets/app.js", "viewer/assets/app.css");
        assertThat(files).doesNotContainKeys("index.html", "viewer/index.html");
        assertThat(files.get(".nojekyll")).isEmpty();

        String shell = GH.text("tree-notes/index.html");
        assertThat(shell).contains("<meta name=\"static-data\" content=\"page.json\">").contains("<meta name=\"robots\" content=\"noindex\">")
                .contains("../viewer/assets/app.js").contains("<title>Notes &amp; more</title>").doesNotContain("\"./assets/");

        JsonNode p = json("tree-notes/page.json");
        assertThat(p.path("title").asText()).isEqualTo("Notes & more");
        assertThat(p.at("/assets/" + img + "/file").asText()).isEqualTo("a/" + img + ".png");
        assertThat(files.get("tree-notes/a/" + img + ".png")).isEqualTo(DocsClient.PNG);
        String embed = p.at("/body/content/2/attrs/bundle").asText();
        assertThat(embed).hasSize(64);
        assertThat(p.at("/embeds/" + embed + "/bundle/files/index.html/sha").asText()).hasSize(64);
        assertThat(GH.text("tree-notes/app/" + embed + "/index.html")).isEqualTo("<p>app</p>");
        assertThat(GH.text("tree-notes/app/" + embed + "/x.js")).isEqualTo("1");
        assertThat(GH.text("tree-notes/app/" + embed + "/" + ThemeEmbed.PATH)).isEqualTo(ThemeEmbed.SCRIPT);

        JsonNode a = json("tree-app/page.json");
        assertThat(a.path("kind").asText()).isEqualTo("webapp");
        String bundle = a.at("/bundle/sha").asText();
        assertThat(bundle).isEqualTo(embed);
        assertThat(GH.text("tree-app/app/" + bundle + "/x.js")).isEqualTo("1");
        assertThat(GH.text("tree-app/index.html")).contains("<title>Tiny app</title>");
        assertThat(GH.files().keySet().stream().filter(k -> k.startsWith("tree-"))).allMatch(k -> k.matches("tree-(notes|app)/.*"));
        assertThat(GH.badAuth).isEmpty();
        assertThat(GH.commitParents).as("every commit is an orphan").allMatch(n -> n == 0);
    }

    // ---------------------------------------------------------------- links

    @Test
    void linksPointToGithubAddressesOrStayPlainText() throws Exception {
        long other = docs.create(null, null, "rich", "Other public");
        long draft = docs.create(null, null, "rich", "Draft");
        long linker = docs.create(null, null, "rich", "Linker");
        save(linker, "Linker", """
                {"type":"doc","content":[{"type":"paragraph","content":[
                  {"type":"pageLink","attrs":{"pageId":%d,"label":"other"}},{"type":"pageLink","attrs":{"pageId":%d,"label":"draft"}}]}]}"""
                .formatted(other, draft));
        publishTo(other, "link-other");
        publishTo(linker, "link-linker");
        awaitFile("link-linker/page.json");

        JsonNode links = json("link-linker/page.json").at("/body/content/0/content");
        assertThat(links.get(0).at("/attrs/href").asText()).isEqualTo(SITE + "link-other/");
        assertThat(links.get(1).path("attrs").has("href")).isFalse();

        Map<Long, JsonNode> byId = new HashMap<>();
        for (JsonNode l : c.json("GET", "/api/admin/docs/pages/" + linker + "/publish-check", null, 200).path("links")) {
            byId.put(l.path("pageId").asLong(), l);
        }
        assertThat(byId.get(other).path("href").asText()).isEqualTo(SITE + "link-other/");
        assertThat(byId.get(other).path("public").asBoolean()).isTrue();
        assertThat(byId.get(other).path("missing").asBoolean()).isFalse();
        assertThat(byId.get(draft).path("href").isNull()).isTrue();
        assertThat(byId.get(draft).path("public").asBoolean()).isFalse();
        assertThat(c.json("GET", "/api/admin/docs/pages/" + linker + "/publish-check", null, 200).path("githubSlug").asText()).isEqualTo("link-linker");

        // Taking the linked page off GitHub re-renders the linker.
        docs.unpublish(other, version(other));
        awaitTree(f -> !f.containsKey("link-other/page.json") && !new String(f.get("link-linker/page.json"), StandardCharsets.UTF_8).contains("link-other/"));
    }

    // ---------------------------------------------------------------- API

    @Test
    void configAndTreeShowTheGithubState() throws Exception {
        JsonNode cfg = c.json("GET", "/api/admin/docs/config", null, 200).path("github");
        assertThat(cfg.path("enabled").asBoolean()).isTrue();
        assertThat(cfg.path("siteUrl").asText()).isEqualTo(SITE);
        assertThat(cfg.path("dryRun").asBoolean()).isFalse();
        assertThat(cfg.path("configError").isNull()).isTrue();
        long id = create("Tree badge", "rich");
        assertThat(page(id).path("githubSlug").isNull()).isTrue();
        publishTo(id, "api-badge");
        boolean found = false;
        for (JsonNode t : c.json("GET", "/api/admin/docs/tree", null, 200)) {
            if (t.path("id").asLong() == id) {
                found = true;
                assertThat(t.path("githubSlug").asText()).isEqualTo("api-badge");
                assertThat(t.has("publicHost")).isFalse();
                assertThat(t.path("state").asText()).isEqualTo("public");
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void publishNeedsAFolderAndKeepsTheOldOneWhenNoneIsGiven() throws Exception {
        long id = create("Two ways", "rich");
        assertThat(c.json("POST", "/api/admin/docs/pages/" + id + "/publish", Map.of("version", version(id)), 400).path("message").asText())
                .contains("Choose a folder name");

        JsonNode first = c.json("POST", "/api/admin/docs/pages/" + id + "/publish", Map.of("githubSlug", "two-ways", "version", version(id)), 200);
        assertThat(first.path("githubUrl").asText()).isEqualTo(SITE + "two-ways/");
        assertThat(first.path("github").path("state").asText()).isIn("pending", "building", "live");
        assertThat(first.path("live").asBoolean()).isTrue();
        awaitFile("two-ways/page.json");
        JsonNode detail = page(id);
        assertThat(detail.path("state").asText()).isEqualTo("public");
        assertThat(detail.path("githubUrl").asText()).isEqualTo(SITE + "two-ways/");

        // A request without the key keeps the folder.
        JsonNode kept = c.json("POST", "/api/admin/docs/pages/" + id + "/publish", Map.of("version", version(id)), 200);
        assertThat(kept.path("githubSlug").asText()).isEqualTo("two-ways");

        // An explicit null is refused: unpublish is the way to take a page off.
        Map<String, Object> none = new HashMap<>();
        none.put("githubSlug", null);
        none.put("version", version(id));
        assertThat(c.json("POST", "/api/admin/docs/pages/" + id + "/publish", none, 400).path("message").asText()).contains("Choose a folder name");
    }

    @Test
    void folderNamesAreCheckedAndUnique() throws Exception {
        long a = create("Name A", "rich");
        long b = create("Name B", "rich");
        publishTo(a, "taken-name");
        assertThat(c.json("GET", "/api/admin/docs/github/check?slug=taken-name&pageId=" + a, null, 200).path("ok").asBoolean()).isTrue();
        JsonNode other = c.json("GET", "/api/admin/docs/github/check?slug=Taken-Name&pageId=" + b, null, 200);
        assertThat(other.path("ok").asBoolean()).isFalse();
        assertThat(other.path("message").asText()).contains("already used").contains("Name A");
        JsonNode free = c.json("GET", "/api/admin/docs/github/check?slug=free-name", null, 200);
        assertThat(free.path("ok").asBoolean()).isTrue();
        assertThat(free.path("message").asText()).isEqualTo(SITE + "free-name/ is free.");
        for (String bad : new String[] {"viewer", "a", "has%20space", "under_score", "-x"}) {
            assertThat(c.json("GET", "/api/admin/docs/github/check?slug=" + bad, null, 200).path("ok").asBoolean()).as(bad).isFalse();
        }
        Map<String, Object> req = new HashMap<>();
        req.put("githubSlug", "taken-name");
        req.put("version", version(b));
        assertThat(c.json("POST", "/api/admin/docs/pages/" + b + "/publish", req, 400).path("message").asText()).contains("already used");
        req.put("githubSlug", "viewer");
        assertThat(c.json("POST", "/api/admin/docs/pages/" + b + "/publish", req, 400).path("message").asText()).contains("used by the site itself");
    }

    @Test
    void targetsMoveTheFolderWithoutANewVersion() throws Exception {
        long id = create("Moves", "rich");
        publishTo(id, "moves-a");
        int published = page(id).path("publishedVersion").asInt();
        awaitFile("moves-a/page.json");

        JsonNode r = c.json("PUT", "/api/admin/docs/pages/" + id + "/targets", Map.of("githubSlug", "moves-b", "version", version(id)), 200);
        assertThat(r.path("githubUrl").asText()).isEqualTo(SITE + "moves-b/");
        assertThat(page(id).path("publishedVersion").asInt()).as("no new published version").isEqualTo(published);
        awaitFile("moves-b/page.json");
        assertThat(GH.files()).doesNotContainKey("moves-a/page.json");
        assertThat(page(id).path("state").asText()).isEqualTo("public");
        JsonNode history = c.json("GET", "/api/admin/docs/pages/" + id + "/versions", null, 200);
        assertThat(history.get(0).path("kind").asText()).isEqualTo("targets");
        assertThat(history.get(0).path("note").asText()).contains("GitHub folder moves-b");

        // A missing key leaves the folder alone.
        c.json("PUT", "/api/admin/docs/pages/" + id + "/targets", Map.of("version", version(id)), 200);
        assertThat(page(id).path("githubSlug").asText()).isEqualTo("moves-b");

        // Null on a published page unpublishes it.
        Map<String, Object> off = new HashMap<>();
        off.put("githubSlug", null);
        off.put("version", version(id));
        c.json("PUT", "/api/admin/docs/pages/" + id + "/targets", off, 200);
        JsonNode after = page(id);
        assertThat(after.path("state").asText()).isEqualTo("internal");
        assertThat(after.path("publishedVersion").isNull()).isTrue();
        assertThat(after.path("githubSlug").isNull()).isTrue();
        awaitGone("moves-b/page.json");

        // On a page that was never published, the folder is only reserved.
        long draft = create("Reserve", "rich");
        c.json("PUT", "/api/admin/docs/pages/" + draft + "/targets", Map.of("githubSlug", "reserve", "version", version(draft)), 200);
        assertThat(page(draft).path("state").asText()).isEqualTo("internal");
        assertThat(page(draft).path("githubSlug").asText()).isEqualTo("reserve");
        assertThat(page(draft).path("githubUrl").isNull()).as("not live").isTrue();
    }

    @Test
    void unpublishTakesThePageOffAndKeepsTheFolderReserved() throws Exception {
        long id = create("Off", "rich");
        publishTo(id, "off-name");
        awaitFile("off-name/page.json");
        c.json("POST", "/api/admin/docs/pages/" + id + "/unpublish", Map.of("version", version(id)), 200);
        awaitGone("off-name/page.json");
        JsonNode d = page(id);
        assertThat(d.path("state").asText()).isEqualTo("internal");
        assertThat(d.path("githubSlug").asText()).isEqualTo("off-name");
        assertThat(d.path("githubUrl").isNull()).isTrue();
        // Still reserved for this page: another page cannot take it.
        long other = create("Wants the name", "rich");
        Map<String, Object> req = new HashMap<>();
        req.put("githubSlug", "off-name");
        req.put("version", version(other));
        c.json("POST", "/api/admin/docs/pages/" + other + "/publish", req, 400);
        // Publishing again with nothing mentioned brings it back.
        c.json("POST", "/api/admin/docs/pages/" + id + "/publish", Map.of("version", version(id)), 200);
        awaitFile("off-name/page.json");
    }

    @Test
    void aGithubFailureNeverFailsOrDelaysThePublishAndRetryRecovers() throws Exception {
        GH.failPrefix = "GET ";
        GH.failStatus = 401;
        GH.failBody = "{\"message\":\"Bad credentials " + FakeGitHub.TOKEN + "\"}";
        long id = create("Resilient", "rich");
        long start = System.nanoTime();
        JsonNode r = c.json("POST", "/api/admin/docs/pages/" + id + "/publish", Map.of("githubSlug", "resilient", "version", version(id)), 200);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
        assertThat(r.path("live").asBoolean()).isTrue();
        assertThat(page(id).path("state").asText()).isEqualTo("public");

        Awaitility.await().atMost(Duration.ofSeconds(15)).until(() -> github.status().state() == GitHubSync.State.ERROR);
        JsonNode st = c.json("GET", "/api/admin/docs/github/status", null, 200);
        assertThat(st.path("state").asText()).isEqualTo("error");
        assertThat(st.path("message").asText()).contains("401").doesNotContain(FakeGitHub.TOKEN);
        assertThat(st.path("enabled").asBoolean()).isTrue();
        assertThat(st.has("lastSyncedAt")).isTrue();
        assertThat(st.path("siteUrl").asText()).isEqualTo(SITE);
        assertThat(st.has("files")).isTrue();
        assertThat(st.has("dryRun")).isTrue();

        GH.failPrefix = null;
        JsonNode retry = c.json("POST", "/api/admin/docs/github/retry", null, 200);
        assertThat(retry.path("state").asText()).isIn("pending", "building", "live");
        awaitFile("resilient/page.json");
        assertThat(c.json("GET", "/api/admin/docs/github/status", null, 200).path("state").asText()).isEqualTo("live");
    }
}
