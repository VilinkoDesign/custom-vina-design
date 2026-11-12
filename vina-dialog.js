// Match the original modal: 180 ms ease, fade and 10 DIP vertical travel.
const pending = new WeakMap();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function reset(dialog) {
  const state = pending.get(dialog);
  if (state) {
    clearTimeout(state.timer);
    dialog.removeEventListener("animationend", state.finish);
    dialog.inert = state.inert;
    pending.delete(dialog);
  }
  dialog.classList.remove("dialog-entering", "dialog-closing");
}
export function showDialog(dialog) {
  reset(dialog);
  if (!dialog.open) dialog.showModal();
  if (!reduced()) dialog.classList.add("dialog-entering");
}
export function closeDialog(dialog) {
  if (!dialog.open || pending.has(dialog)) return;
  dialog.classList.remove("dialog-entering");
  if (reduced()) {
    dialog.close();
    return;
  }
  const state = { inert: dialog.inert };
  state.finish = (event) => {
    if (
      event &&
      (event.target !== dialog || event.animationName !== "vinaDialogOut")
    )
      return;
    reset(dialog);
    if (dialog.open) dialog.close();
  };
  pending.set(dialog, state);
  dialog.inert = true;
  dialog.classList.add("dialog-closing");
  dialog.addEventListener("animationend", state.finish);
  // Cleanup also works if the browser suppresses animationend or motion changes.
  state.timer = setTimeout(() => state.finish(), 240);
}
