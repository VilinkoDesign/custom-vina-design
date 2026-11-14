// Regenerate the web catalog from the native registered localization symbols.
// Usage: node tools/sync-pogget-labels.mjs <Pogget/VinaApp>
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Pass the native VinaApp directory");
const source = readFileSync(resolve(root, "MultiLanguage.hpp"), "utf8");
const names = [...new Set([
  ...[...readFileSync(resolve(root, "PoggetPersonalizationLabels.inl"), "utf8")
    .matchAll(/^POGGET_PERSONALIZATION_LABEL\((\w+)\)/gm)].map(m => m[1]),
  // These native controls read MultiLanguage directly rather than via Label().
  "hslHue", "hslSaturation", "hslLightness", "settingsSearchPlaceholder",
])].sort();
const starts = [source.indexOf('if (lang == L"en-US")'), source.indexOf('} else if (lang == L"zh-TW")'), source.indexOf('// default/zh-CN')];
if (starts.some(n => n < 0)) throw new Error("Native localization branches changed");
const assignments = text => Object.fromEntries([...text.matchAll(/^\s*(?:inline\s+std::wstring\s+)?(\w+)\s*=\s*L("(?:\\.|[^"\\])*")\s*;/gm)]
  .map(m => [m[1], JSON.parse(m[2])]));
const initial = assignments(source.slice(0, source.indexOf("inline void UpdateLanguage")));
const catalog = {};
for (const [language, text] of [["zh-CN", source.slice(starts[2])], ["zh-TW", source.slice(starts[1], starts[2])], ["en-US", source.slice(starts[0], starts[1])]]) {
  const values = { ...initial, ...assignments(text) };
  catalog[language] = Object.fromEntries(names.map(name => {
    if (values[name] === undefined) throw new Error(`Missing ${language} ${name}`);
    return [name, values[name]];
  }));
}
writeFileSync(new URL("../data/pogget-labels.json", import.meta.url), JSON.stringify(catalog, null, 2) + "\n");
console.log(`Synced ${names.length} native labels in three languages`);
