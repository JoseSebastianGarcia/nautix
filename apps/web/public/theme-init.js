// Apply the theme before first paint (no flash). External file so the CSP can stay strict.
(() => {
  try {
    const t = localStorage.getItem("nautix.theme") || "system";
    const dark =
      t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {}
})();
