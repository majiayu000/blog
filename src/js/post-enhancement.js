(() => {
  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("浏览器拒绝了复制命令");
  }

  function showButtonState(button, label, timeout = 1800) {
    const original = button.dataset.originalLabel || button.textContent;
    button.dataset.originalLabel = original;
    button.textContent = label;
    window.setTimeout(() => {
      button.textContent = original;
    }, timeout);
  }

  function initializePageCopy() {
    const button = document.querySelector("[data-copy-page]");
    if (!button) return;

    button.addEventListener("click", async () => {
      try {
        await writeClipboard(window.location.href);
        showButtonState(button, "链接已复制");
        window.ssTrack?.("copy_link");
      } catch (error) {
        console.error("Unable to copy page URL", error);
        showButtonState(button, "复制失败");
      }
    });
  }

  function initializeCodeCopy() {
    for (const pre of document.querySelectorAll("pre")) {
      if (pre.closest(".ss-afterword") || pre.dataset.copyEnhanced === "true") continue;

      const code = pre.querySelector("code");
      const source = code?.textContent || pre.textContent;
      if (!source.trim()) continue;

      pre.dataset.copyEnhanced = "true";
      pre.classList.add("ss-code-copy-host");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ss-code-copy";
      button.textContent = "复制";
      button.setAttribute("aria-label", "复制代码");
      button.addEventListener("click", async () => {
        try {
          await writeClipboard(source);
          showButtonState(button, "已复制");
          window.ssTrack?.("copy_code");
        } catch (error) {
          console.error("Unable to copy code block", error);
          showButtonState(button, "失败");
        }
      });
      pre.append(button);
    }
  }

  function initializeReadingProgress() {
    if (document.querySelector("#progress, .progress, [data-reading-progress]")) return;

    const progress = document.createElement("div");
    progress.className = "ss-reading-progress";
    progress.dataset.readingProgress = "true";
    progress.setAttribute("aria-hidden", "true");
    document.body.append(progress);

    let frame = 0;
    const update = () => {
      frame = 0;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 1;
      progress.style.setProperty("--ss-reading-progress", `${ratio * 100}%`);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
  }

  function initializeArticleToc() {
    const headings = [...document.querySelectorAll("h2")].filter(
      (heading) => !heading.closest(".ss-afterword, .ss-article-rail, .ss-article-drawer"),
    );
    const seen = new Set();
    headings.forEach((heading, index) => {
      const valid = /^[A-Za-z][\w:.-]*$/.test(heading.id) && !seen.has(heading.id);
      if (!valid) {
        let generated = `ss-section-${String(index + 1).padStart(2, "0")}`;
        while (seen.has(generated)) generated = `${generated}-generated`;
        heading.id = generated;
      }
      seen.add(heading.id);
    });

    const railLinks = [...document.querySelectorAll('.ss-article-rail a[href^="#"]')];
    if (!("IntersectionObserver" in window) || !railLinks.length) return;
    const linksById = new Map(
      railLinks.map((link) => [decodeURIComponent(link.hash.slice(1)), link]),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible) return;
        for (const link of railLinks) link.removeAttribute("aria-current");
        linksById.get(visible.target.id)?.setAttribute("aria-current", "location");
      },
      { rootMargin: "-18% 0px -70%" },
    );
    for (const heading of headings) observer.observe(heading);

    const drawer = document.querySelector(".ss-article-drawer");
    drawer?.addEventListener("click", (event) => {
      if (event.target.closest('a[href^="#"]')) drawer.removeAttribute("open");
    });
  }

  function initializeGiscus() {
    const host = document.querySelector("[data-giscus-repo]");
    if (!host) return;
    const section = host.closest(".ss-afterword__comments");
    const status = section?.querySelector("[data-giscus-status]");
    let loaded = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      window.ssTrack?.("comments_view");
      if (status) status.textContent = "正在加载评论…";

      const script = document.createElement("script");
      script.className = "giscus-script";
      script.src = "https://giscus.app/client.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.repo = host.dataset.giscusRepo;
      script.dataset.repoId = host.dataset.giscusRepoId;
      script.dataset.category = host.dataset.giscusCategory;
      script.dataset.categoryId = host.dataset.giscusCategoryId;
      script.dataset.mapping = "pathname";
      script.dataset.strict = "1";
      script.dataset.reactionsEnabled = "1";
      script.dataset.emitMetadata = "0";
      script.dataset.inputPosition = "top";
      script.dataset.theme = "preferred_color_scheme";
      script.dataset.lang = "zh-CN";
      script.addEventListener("load", () => {
        if (status) status.remove();
      });
      script.addEventListener("error", () => {
        if (status) status.textContent = "评论加载失败，请使用下面的 GitHub Discussions 链接。";
      });
      host.append(script);
    };

    if (!("IntersectionObserver" in window) || !section) {
      load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "1000px 0px" },
    );
    observer.observe(section);
  }

  function initialize() {
    initializePageCopy();
    initializeCodeCopy();
    initializeReadingProgress();
    initializeArticleToc();
    initializeGiscus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
