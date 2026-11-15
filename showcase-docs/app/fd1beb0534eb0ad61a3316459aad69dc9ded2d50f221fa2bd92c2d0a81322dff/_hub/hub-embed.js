// hub-embed.js: optional helper for webapps shown in Homelab Hub Docs. Include with
//   <script src="_hub/hub-embed.js"></script>
// It sets <html data-theme="light|dark">, fires a "hub:theme" event on window when the theme changes,
// and reports the page height to the Docs page (used when the height mode is "auto").
(function () {
  var theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
  function apply(t) {
    theme = t === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent("hub:theme", { detail: theme }));
  }
  function report() {
    var px = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    parent.postMessage({ type: "hub:height", px: px }, "*");
  }
  window.addEventListener("message", function (e) {
    if (e.source === parent && e.data && e.data.type === "hub:theme") apply(e.data.theme);
  });
  window.hubEmbed = { theme: function () { return theme; }, reportHeight: report };
  apply(theme);
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener("load", report);
})();
