(() => {
  const config = window.__SS_ANALYTICS__;
  if (!config?.endpoint) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

  const allowed = new Set([
    "page_view",
    "scroll",
    "search",
    "search_result_click",
    "related_click",
    "journey_click",
    "copy_link",
    "copy_code",
    "outbound_click",
    "comments_view",
  ]);

  const send = (name, payload = {}) => {
    if (!allowed.has(name)) {
      console.error(`Unknown analytics event: ${name}`);
      return;
    }

    const body = JSON.stringify({
      name,
      path: window.location.pathname,
      title: document.title,
      pageType: config.pageType || "page",
      ...payload,
    });

    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon?.(config.endpoint, blob)) return;
      fetch(config.endpoint, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch((error) => {
        console.error("Unable to send analytics event", error);
      });
    } catch (error) {
      console.error("Unable to send analytics event", error);
    }
  };

  window.ssTrack = send;
  send("page_view");

  const seenDepth = new Set();
  const reportScroll = () => {
    if (config.pageType !== "post") return;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 1;
    for (const depth of [50, 100]) {
      if (ratio * 100 < depth || seenDepth.has(depth)) continue;
      seenDepth.add(depth);
      send("scroll", { depth });
    }
  };

  let frame = 0;
  const scheduleScroll = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      reportScroll();
    });
  };

  window.addEventListener("scroll", scheduleScroll, { passive: true });
  reportScroll();

  document.addEventListener(
    "click",
    (event) => {
      const tracked = event.target.closest?.("[data-ss-event]");
      if (tracked) {
        send(tracked.dataset.ssEvent, {
          slug: tracked.dataset.ssSlug,
          direction: tracked.dataset.ssDirection,
          href: tracked.getAttribute("href") || undefined,
        });
        return;
      }

      const link = event.target.closest?.("a[href]");
      if (!link) return;
      let url;
      try {
        url = new URL(link.href, window.location.href);
      } catch (error) {
        console.error("Unable to parse outbound link", error);
        return;
      }
      if (url.origin === window.location.origin) return;
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      send("outbound_click", { href: `${url.origin}${url.pathname}` });
    },
    { capture: true },
  );
})();
