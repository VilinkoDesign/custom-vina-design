// Cross-runtime acceptance uses Pogget's actual compiler and localization code.
#include "PoggetCore/Personalization/PresetComposition.hpp"
#include "PoggetCore/Personalization/PresetText.hpp"
#include "PoggetCore/Storage/FlowJson.hpp"
#include "MultiLanguage.hpp"
#include <fstream>
#include <iostream>
using namespace PoggetCore::Personalization;
namespace J = PoggetCore::Storage::FlowJson;
using O = J::Value::Object;
using A = J::Value::Array;
static std::string Read(const char* path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("cannot open fixture");
    return {(std::istreambuf_iterator<char>(file)), {}};
}
static J::Value Json(const Value& value) {
    return std::visit([](const auto& v) -> J::Value {
        using T = std::decay_t<decltype(v)>;
        if constexpr (std::is_same_v<T, std::wstring>) return Encode(v);
        else return v;
    }, value);
}
static std::wstring Label(std::wstring text) {
    if (!text.starts_with(L"pogget.label.")) return text;
    const auto key = std::wstring_view(text).substr(13);
#define POGGET_PERSONALIZATION_LABEL(name) if (key == L###name) return MultiLanguage::name;
#include "PoggetPersonalizationLabels.inl"
#undef POGGET_PERSONALIZATION_LABEL
    return text;
}
static std::wstring Clean(std::wstring raw) {
    const auto colon = raw.rfind(L':');
    if (colon != std::wstring::npos && colon + 1 < raw.size()) {
        raw = raw.substr(colon + 1);
        while (!raw.empty() && (raw.front() == L' ' || raw.front() == L'\t')) raw.erase(0, 1);
    }
    return raw;
}
int main(int argc, char** argv) {
    try {
        if (argc < 2) throw std::runtime_error("missing mode");
        J::Value output;
        if (std::string_view(argv[1]) == "--labels") {
            O languages;
            for (const auto* lang : {L"zh-CN", L"zh-TW", L"en-US"}) {
                MultiLanguage::UpdateLanguage(lang); O labels;
#define POGGET_PERSONALIZATION_LABEL(name) labels.emplace_back(#name, Encode(MultiLanguage::name));
#include "PoggetPersonalizationLabels.inl"
#undef POGGET_PERSONALIZATION_LABEL
                labels.emplace_back("hslHue", Encode(MultiLanguage::hslHue));
                labels.emplace_back("hslSaturation", Encode(MultiLanguage::hslSaturation));
                labels.emplace_back("hslLightness", Encode(MultiLanguage::hslLightness));
                languages.emplace_back(Encode(lang), std::move(labels));
            }
            output = std::move(languages);
        } else {
            if (argc != 5) throw std::runtime_error("source, inputs, language, base required");
            auto source = Decode(Read(argv[1]));
            const auto syntax = Compiler(source).Parse();
            if (!PresetComposition::Dependency(*syntax).empty()) {
                const auto base = Decode(Read(argv[4]));
                source = PresetComposition::Compose(base, *Compiler(base).Compile(), source, *syntax);
            }
            const auto document = Compiler(source).Compile();
            J::Value input; J::Error error;
            if (!J::Parse(Read(argv[2]), input, error)) throw std::runtime_error("invalid inputs");
            Instance values(document, [&](std::wstring_view path) -> std::optional<Value> {
                if (const auto* v = J::Find(*input.get_if<O>(), Encode(path))) {
                    if (const auto* n = v->get_if<double>()) return *n;
                    if (const auto* n = v->get_if<std::int64_t>()) return static_cast<double>(*n);
                    if (const auto* n = v->get_if<bool>()) return *n;
                    if (const auto* n = v->get_if<std::string>()) return Decode(*n);
                }
                return std::nullopt;
            });
            for (const auto& [key, v] : *input.get_if<O>()) {
                if (key.starts_with("pogget.")) continue;
                if (const auto* n = v.get_if<double>()) values.Set(Decode(key), *n);
                if (const auto* n = v.get_if<std::int64_t>()) values.Set(Decode(key), static_cast<double>(*n));
                if (const auto* n = v.get_if<bool>()) values.Set(Decode(key), *n);
                if (const auto* n = v.get_if<std::string>()) values.Set(Decode(key), Decode(*n));
            }
            MultiLanguage::UpdateLanguage(Decode(argv[3]));
            A groups;
            for (const auto& component : document->components) if (const auto* ui = component.Find(L"ui")) {
                A fields;
                for (const auto& f : ui->children) {
                    const auto get = [&](const wchar_t* key, std::wstring fallback = {}) { return values.GetText(f.path + L"." + key, std::move(fallback)); };
                    const auto kind = get(L"control", L"slider");
                    const auto* choices = f.Find(L"choices") ? f.Find(L"choices") : f.Find(L"options");
                    A options;
                    if (choices) {
                        for (const auto id : choices->properties) options.emplace_back(Encode(Label(values.GetText(document->properties[id].path))));
                        for (const auto& option : choices->children) options.emplace_back(Encode(Label(values.GetText(option.path + L".label", option.name))));
                    }
                    const auto min = values.GetNumber(f.path + L".min", 0);
                    fields.emplace_back(O{
                        {"path", Encode(f.path)}, {"label", Encode(Label(get(L"label", f.name)))},
                        {"notice", Encode(Label(get(L"notice")))}, {"kind", Encode(kind)},
                        {"type", Encode(get(L"type", L"number"))}, {"bind", Encode(get(L"bind"))},
                        {"visible", Truth(values.Get(f.path + L".visible", true))},
                        {"value", Json(values.Get(f.path + L".value", kind == L"button" || kind == L"action" ? Value(std::wstring{}) : Value(0.0)))},
                        {"min", min}, {"max", (std::max)(min, values.GetNumber(f.path + L".max", kind == L"color" ? 16777215.0 : 1.0))},
                        {"step", (std::max)(0.000001, values.GetNumber(f.path + L".step", 0.01))},
                        {"invert", Truth(values.Get(f.path + L".invert", false))}, {"choices", std::move(options)}
                    });
                }
                groups.emplace_back(O{{"path", Encode(component.path)}, {"title", Encode(Clean(Label(values.GetText(component.path + L".label", component.name))))},
                    {"description", Encode(Label(values.GetText(component.path + L".description")))}, {"fields", std::move(fields)}});
            }
            output = std::move(groups);
        }
        std::string encoded; J::Error error;
        if (!J::Stringify(output, encoded, error)) throw std::runtime_error("cannot encode snapshot");
        std::cout << encoded;
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what(); return 1; }
}
