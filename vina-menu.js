// Desktop-style menus share the editor's existing commands and enabled states.
export function mountToolMenus(root, { onOpen = () => {} } = {}) {
  const triggers = [...root.querySelectorAll("[aria-haspopup=menu]")];
  let active = null;
  const panelFor = (trigger) =>
    document.getElementById(trigger.getAttribute("aria-controls"));
  const items = () =>
    active
      ? [...panelFor(active).querySelectorAll('[role="menuitem"]')].filter(
          (item) =>
            !item.disabled && item.getAttribute("aria-disabled") !== "true",
        )
      : [];
  function rove(trigger) {
    for (const button of triggers)
      button.tabIndex = button === trigger ? 0 : -1;
  }
  function close(restoreFocus = false) {
    if (!active) return;
    const trigger = active;
    active = null;
    panelFor(trigger).hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  }
  function position() {
    if (!active) return;
    const panel = panelFor(active),
      rect = active.getBoundingClientRect();
    panel.style.left =
      Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8)) +
      "px";
    panel.style.top = rect.bottom + 6 + "px";
  }
  function open(trigger, edge = "first") {
    close();
    onOpen();
    active = trigger;
    rove(trigger);
    trigger.setAttribute("aria-expanded", "true");
    const panel = panelFor(trigger);
    panel.hidden = false;
    position();
    const enabled = items();
    (edge === "last" ? enabled.at(-1) : enabled[0])?.focus();
    if (!enabled.length) panel.focus();
  }
  function adjacent(trigger, delta) {
    return triggers[
      (triggers.indexOf(trigger) + delta + triggers.length) % triggers.length
    ];
  }
  root.addEventListener(
    "click",
    (event) => {
      const trigger = event.target.closest("[aria-haspopup=menu]");
      if (trigger && root.contains(trigger)) {
        if (active === trigger) close(true);
        else open(trigger);
      } else if (event.target.closest('[role="menuitem"]')) {
        // Close before dispatching the original command so modal focus returns to
        // the visible trigger when a file dialog is subsequently dismissed.
        close(true);
      }
    },
    { capture: true },
  );
  root.addEventListener("pointerover", (event) => {
    if (!active || event.pointerType === "touch") return;
    const trigger = event.target.closest("[aria-haspopup=menu]");
    if (trigger && trigger !== active) open(trigger);
  });
  root.addEventListener("keydown", (event) => {
    const trigger = event.target.closest("[aria-haspopup=menu]");
    const current = active || trigger;
    if (!current) return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      close(true);
      return; // Keep the editor's command shortcuts working.
    }
    event.stopPropagation();
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const next = adjacent(current, event.key === "ArrowRight" ? 1 : -1);
      if (active) open(next);
      else {
        rove(next);
        next.focus();
      }
    } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!active || trigger)
        open(current, event.key === "ArrowUp" ? "last" : "first");
      else {
        const enabled = items(),
          index = enabled.indexOf(document.activeElement);
        enabled[
          (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
            enabled.length
        ]?.focus();
      }
    } else if (["Home", "End"].includes(event.key)) {
      event.preventDefault();
      const options = active ? items() : triggers;
      const next = event.key === "Home" ? options[0] : options.at(-1);
      if (next) {
        if (!active) rove(next);
        next.focus();
      }
    } else if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      document.activeElement?.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(true); // Native Tab traversal continues from the menu trigger.
    } else if (active && event.key.length === 1) {
      const enabled = items(),
        start = enabled.indexOf(document.activeElement);
      for (let offset = 1; offset <= enabled.length; offset++) {
        const next = enabled[(start + offset) % enabled.length];
        if (
          (
            next.querySelector(".tool-menu-label")?.textContent ||
            next.textContent
          )
            .trim()
            .startsWith(event.key)
        ) {
          next.focus();
          break;
        }
      }
    }
  });
  root.addEventListener("focusout", (event) => {
    // During native pointer focus, activeElement is briefly body before the next
    // focusin. Keep the panel mounted while focus moves to another menu item.
    if (root.contains(event.relatedTarget)) return;
    queueMicrotask(() => {
      if (!root.contains(document.activeElement)) close();
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) close();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "F10" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (active) close(true);
      else triggers.find((trigger) => trigger.tabIndex === 0)?.focus();
    },
    { capture: true },
  );
  window.addEventListener("blur", () => close());
  window.addEventListener("resize", position);
  return {
    close,
    get isOpen() {
      return !!active;
    },
  };
}
