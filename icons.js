// Official Font Awesome Free 6 icons, bundled locally as an SVG sprite.
const sprite = new URL("./vendor/fontawesome/fa6.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
export const COMPONENT_ICONS = {
  rect: "regular-square",
  rectangle: "regular-square",
  solid: "square",
  glass: "braille",
  text: "font",
  icon: "icons",
  image: "image",
  button: "hand-pointer",
  group: "object-group",
  path: "pen-nib",
  content: "file-lines",
  container: "layer-group",
};
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "fa-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.dataset.icon = name;
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${sprite}#fa-${name}`);
  svg.append(use);
  return svg;
}
