import * as V from "./vina-core.js";
import * as M from "./vina-model.js";

export const LINK_LIMIT = 2 * 1024 * 1024;
const LINK_PREFIX =
  "https://vilinkodesign.github.io/custom-vina-design/index.html";

// c contains the exact UTF-8 Vina source as unpadded base64url. Validate the
// envelope before allocating/decoding; malformed links never reach storage.
export function projectFromLink(hash, standard, inputs, schema) {
  if (!hash.startsWith("#c=")) return null;
  if (LINK_PREFIX.length + hash.length >= LINK_LIMIT)
    throw new Error("编辑器链接达到或超过 2 MiB 参数限制");
  const encoded = hash.slice(3);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1)
    throw new Error("链接中的 Vina 编码无效");
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  // Reject noncanonical encodings (including nonzero trailing pad bits).
  if (btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== encoded)
    throw new Error("链接中的 Vina 编码无效");
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    Uint8Array.from(binary, (c) => c.charCodeAt(0)),
  );
  const next = M.projectFromVina(source);
  try {
    M.validate(next, standard, inputs(next), schema);
  } catch (error) {
    // Match file import: custom dependencies can be supplied in the editor.
    if (!error.message.startsWith("缺少基础预设")) throw error;
  }
  next.linkedSource = { source, canonical: V.serialize(next.doc) };
  return next;
}
