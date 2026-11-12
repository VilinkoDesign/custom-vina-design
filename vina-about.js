const media = matchMedia("(prefers-color-scheme: dark)");
function updateTheme() {
  let mode = "system";
  try {
    mode = localStorage.getItem("customvina.theme") || "system";
  } catch {}
  document.documentElement.dataset.theme =
    mode === "dark" || (mode === "system" && media.matches) ? "dark" : "light";
}
updateTheme();
media.addEventListener("change", updateTheme);
window.addEventListener("storage", (event) => {
  if (event.key === "customvina.theme" || event.key === null) updateTheme();
});
document.documentElement.dataset.ready = "true";
