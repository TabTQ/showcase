package dev.showcasedocs;

/**
 * The optional helper for webapps, served at {@code _embed/theme.js} inside every bundle URL. It applies the theme from
 * {@code ?theme=} and from {@code embed:theme} messages, and reports the page height for "auto" height.
 */
public final class ThemeEmbed {

    public static final String PATH = "_embed/theme.js";

    public static final String SCRIPT = """
            // theme.js: optional helper for webapps shown in Showcase Docs. Include with
            //   <script src="_embed/theme.js"></script>
            // It sets <html data-theme="light|dark">, fires a "embed:theme" event on window when the theme changes,
            // and reports the page height to the Docs page (used when the height mode is "auto").
            (function () {
              var theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
              function apply(t) {
                theme = t === "dark" ? "dark" : "light";
                document.documentElement.setAttribute("data-theme", theme);
                window.dispatchEvent(new CustomEvent("embed:theme", { detail: theme }));
              }
              function report() {
                var px = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
                parent.postMessage({ type: "embed:height", px: px }, "*");
              }
              window.addEventListener("message", function (e) {
                if (e.source === parent && e.data && e.data.type === "embed:theme") apply(e.data.theme);
              });
              window.themeEmbed = { theme: function () { return theme; }, reportHeight: report };
              apply(theme);
              if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement);
              window.addEventListener("load", report);
            })();
            """;

    private ThemeEmbed() {}
}
