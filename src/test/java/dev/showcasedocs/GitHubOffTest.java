package dev.showcasedocs;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** With GitHub switched off (the default) the Docs app works as before, and the GitHub routes say so clearly. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GitHubOffTest {

    static final Path DIR = DocsClient.tempDir();
    static final String PASSWORD = "docs-test-password";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        DocsClient.useTemp(r, DIR);
        r.add("app.auth.password-hash", () -> new BCryptPasswordEncoder(4).encode(PASSWORD));
        r.add("app.auth.mode", () -> "all");
    }

    @LocalServerPort int port;

    @Test
    void theGithubOptionIsHiddenAndRefused() throws Exception {
        DocsClient c = new DocsClient(port).login(PASSWORD);
        JsonNode cfg = c.json("GET", "/api/admin/docs/config", null, 200).path("github");
        assertThat(cfg.path("enabled").asBoolean()).isFalse();
        assertThat(cfg.path("siteUrl").isNull()).isTrue();
        assertThat(cfg.path("dryRun").asBoolean()).isFalse();

        JsonNode st = c.json("GET", "/api/admin/docs/github/status", null, 200);
        assertThat(st.path("state").asText()).isEqualTo("off");
        assertThat(st.path("enabled").asBoolean()).isFalse();
        assertThat(c.json("POST", "/api/admin/docs/github/retry", null, 200).path("state").asText()).isEqualTo("off");
        assertThat(c.json("GET", "/api/admin/docs/github/check?slug=anything", null, 200).path("ok").asBoolean()).isFalse();

        long id = c.json("POST", "/api/admin/docs/pages", Map.of("title", "Plain", "kind", "rich"), 201).path("id").asLong();
        long v = c.json("GET", "/api/admin/docs/pages/" + id, null, 200).path("version").asLong();
        Map<String, Object> gh = new HashMap<>();
        gh.put("githubSlug", "plain");
        gh.put("version", v);
        assertThat(c.json("POST", "/api/admin/docs/pages/" + id + "/publish", gh, 400).path("message").asText()).contains("not turned on");
        assertThat(c.json("GET", "/api/admin/docs/pages/" + id, null, 200).path("state").asText()).isEqualTo("internal");
        assertThat(cfg.path("configError").isNull()).isTrue();
    }
}
