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

  function initialize() {
    initializePageCopy();
    initializeCodeCopy();
    initializeReadingProgress();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
