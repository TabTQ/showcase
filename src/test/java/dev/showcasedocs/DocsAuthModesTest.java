package dev.showcasedocs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** DOCS_AUTH_MODE edit and none, plus a server without a password. */
class DocsAuthModesTest {

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    class EditMode {
        static final Path DIR = DocsClient.tempDir();

        @DynamicPropertySource
        static void props(DynamicPropertyRegistry r) {
            DocsClient.useTemp(r, DIR);
            r.add("app.auth.password-hash", () -> new BCryptPasswordEncoder(4).encode("pw"));
            r.add("app.auth.mode", () -> "edit");
        }

        @LocalServerPort int port;

        @Test
        void theEditorApiStillNeedsTheLogin() throws Exception {
            DocsClient anon = new DocsClient(port);
            anon.call("GET", "/api/auth/status", null);
            assertThat(anon.call("GET", "/api/admin/docs/tree", null).statusCode()).isEqualTo(401);
            assertThat(anon.call("GET", "/api/auth/status", null).body()).contains("\"mode\":\"edit\"");
            DocsClient in = new DocsClient(port).login("pw");
            assertThat(in.call("GET", "/api/admin/docs/tree", null).statusCode()).isEqualTo(200);
        }
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    class NoneMode {
        static final Path DIR = DocsClient.tempDir();

        @DynamicPropertySource
        static void props(DynamicPropertyRegistry r) {
            DocsClient.useTemp(r, DIR);
            r.add("app.auth.mode", () -> "none");
        }

        @LocalServerPort int port;

        @Test
        void noLoginButCsrfStillApplies() throws Exception {
            DocsClient anon = new DocsClient(port);
            anon.call("GET", "/api/auth/status", null);
            assertThat(anon.call("GET", "/api/admin/docs/tree", null).statusCode()).isEqualTo(200);
            anon.csrf = false;
            anon.csrf = true;
            assertThat(anon.call("POST", "/api/admin/docs/pages", Map.of("title", "x", "kind", "rich")).statusCode()).isEqualTo(201);
            anon.csrf = false;
            assertThat(anon.call("POST", "/api/admin/docs/pages", Map.of("title", "y", "kind", "rich")).statusCode()).isEqualTo(403);
        }
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    class NoPassword {
        static final Path DIR = DocsClient.tempDir();

        @DynamicPropertySource
        static void props(DynamicPropertyRegistry r) {
            DocsClient.useTemp(r, DIR);
            r.add("app.auth.mode", () -> "all");
            r.add("app.auth.password-hash", () -> "");
        }

        @LocalServerPort int port;

        @Test
        void loginSaysThePasswordIsNotConfigured() throws Exception {
            DocsClient anon = new DocsClient(port);
            anon.call("GET", "/api/auth/status", null);
            var r = anon.call("POST", "/api/auth/login", "{\"password\":\"x\"}");
            assertThat(r.statusCode()).isEqualTo(503);
            assertThat(r.body()).contains("password_not_configured");
        }
    }
}
