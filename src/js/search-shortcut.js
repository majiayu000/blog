(() => {
  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    if (window.location.pathname === "/search/" || window.location.pathname === "/search") {
      const input = document.querySelector("#search-input");
      if (!input) {
        console.error("Search input is missing");
        return;
      }
      input.focus();
      return;
    }
    window.location.assign("/search/");
  });
})();
