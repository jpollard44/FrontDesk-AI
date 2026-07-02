/**
 * FrontDesk AI embeddable widget.
 * Install: <script src="https://YOUR-DOMAIN/embed.js" data-client="EMBED_KEY" async></script>
 * Injects a floating chat bubble; clicking it opens the assistant in an iframe.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var clientKey = script.getAttribute("data-client");
  if (!clientKey) {
    console.warn("[FrontDesk AI] missing data-client attribute");
    return;
  }
  var origin = new URL(script.src).origin;
  var accent = script.getAttribute("data-color") || "#0e7490";

  var bubble = document.createElement("button");
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  bubble.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;z-index:2147483000;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.25);background:" +
    accent + ";";

  var frame = document.createElement("iframe");
  frame.src = origin + "/widget/" + encodeURIComponent(clientKey);
  frame.title = "Chat assistant";
  frame.style.cssText =
    "position:fixed;bottom:88px;right:20px;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);border:none;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.25);z-index:2147483000;display:none;background:#fff;";

  var open = false;
  bubble.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    bubble.innerHTML = open
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(bubble);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
