import test from "node:test";
import assert from "node:assert/strict";
import { FA6_BY_NAME, FA6_ICONS, fa6Token, fa6Tokens } from "../icons.js";

test("FA6 tokens match the native Vina :glyph: convention", () => {
  const arrow = FA6_BY_NAME.get("arrow-up-right-from-square");
  assert.ok(arrow);
  assert.equal(fa6Token(arrow.glyph), ":\uf35d:");
  assert.deepEqual(fa6Tokens(`前 ${fa6Token(arrow.glyph)} 后`), [
    { start: 2, end: 5, glyph: arrow.glyph },
  ]);
});

test("the picker catalog contains the component and example glyphs", () => {
  assert.ok(FA6_ICONS.length >= 40);
  for (const name of ["icons", "pen-nib", "chevron-up", "xmark"])
    assert.match(FA6_BY_NAME.get(name).glyph, /^[\uE000-\uF8FF]$/u);
});
