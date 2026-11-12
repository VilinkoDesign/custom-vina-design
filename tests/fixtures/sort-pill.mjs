// The user's two-level sort pill, including all paint, geometry and animation
// declarations. Only repeated button/menu markup is generated to keep the
// regression fixture readable; references expand to the exact native paths.
const core = `Preset { dependsOn: "Pogget_Std" }
SortPill {
  label: "排序药丸", description: "右下角两级排序胶囊", icon: "\\uf0dc",
  ui {
    Margin { label: "距右下角边距", type: "number", control: "slider", min: 0, max: 40, step: 1, default: 12 },
    Opacity { label: "胶囊透明度", type: "number", control: "slider", min: 0, max: 1, step: 0.01, default: 0.88 }
  },
  vars {
    margin: f32(@{ui.Margin.value}), alpha: clamp(f32(@{ui.Opacity.value}), f32(0), f32(1)),
    hoverTint: fade(@{pogget.theme.midnight}, average(@{pogget.theme.midnight}) > 128 ? -26 : 26),
    height: 34, fullWidth: 204, smallWidth: 34, span: f32(@{vars.fullWidth} - @{vars.smallWidth}),
    right: f32(@{pogget.width} - @{vars.margin}), y: f32(@{pogget.height} - @{vars.height} - @{vars.margin}),
    segWidth: 36, segHeight: 26, segRadius: 13, segY: 4, seg1X: 8, seg2X: 44, seg3X: 80, seg4X: 116, iconSize: 13,
    iconX: f32((@{vars.segWidth} - @{vars.iconSize}) / 2), iconY: f32(@{vars.height} / 2 - @{vars.iconSize} / 1.5),
    markSize: 14, markX: f32(@{vars.fullWidth} - @{vars.smallWidth} + (@{vars.smallWidth} - @{vars.markSize}) / 2), markY: f32(@{vars.height} / 2 - @{vars.markSize} / 1.5),
    subWidth: 104, subHeight: 60, subRowHeight: 24, subPad: 4, subTop: f32(max(f32(0), @{vars.y} - 64)),
    subRetainHeight: f32(@{vars.height} + f32(@{vars.y} - @{vars.subTop})), subBandHeight: f32(@{vars.y} - @{vars.subTop}),
    timeMenuX: 46, sizeMenuX: 82, rowIconSize: 11, rowIconX: 8, rowIconY: f32(@{vars.subRowHeight} / 2 - 11 / 1.5), rowTextX: 26,
    tipWidth: 70, tipHeight: 22, tipY: f32(max(f32(0), @{vars.y} - 30)), tipShift: f32((@{vars.segWidth} - @{vars.tipWidth}) / 2), tipTextY: f32(@{vars.tipHeight} / 2 - 11 / 1.5),
    hotspot: @{SortPill.view.Hotspot.hoverProgress},
    zoneTime: max(@{SortPill.view.TimeZone.hoverProgress}, @{SortPill.view.TimeMenu.hoverProgress}),
    zoneSize: max(@{SortPill.view.SizeZone.hoverProgress}, @{SortPill.view.SizeMenu.hoverProgress}),
    expand: max(@{vars.hotspot}, max(@{vars.zoneTime}, @{vars.zoneSize})), menuOpen: max(@{vars.zoneTime}, @{vars.zoneSize}),
    shown: !@{pogget.collapsed} && !@{pogget.searching} && @{pogget.width} >= 200
  },
  view {
    type: "group", width: @{pogget.width}, height: @{pogget.height}, visible: true,
    Hotspot {
      type: "group", x: @{vars.right} - @{vars.smallWidth}, y: @{vars.y}, width: @{vars.smallWidth}, height: @{vars.height}, transition: 180ms, unhoverTransition: 150ms,
      hoverRegion { x: @{vars.right} - @{vars.smallWidth}, y: @{vars.y}, width: @{vars.smallWidth}, height: @{vars.height},
        retainX: @{vars.right} - @{vars.fullWidth}, retainY: @{vars.menuOpen} > f32(0.02) ? @{vars.subTop} : @{vars.y}, retainWidth: @{vars.fullWidth},
        retainHeight: @{vars.menuOpen} > f32(0.02) ? @{vars.subRetainHeight} : @{vars.height}, enabled: @{vars.shown} }, visible: true
    },
    TimeZone { type: "group", z: 15, x: @{vars.right} - @{vars.fullWidth} + @{vars.seg3X}, y: @{vars.y}, width: @{vars.segWidth}, height: @{vars.height}, visible: @{vars.expand} > f32(0.02), transition: 150ms, unhoverTransition: 130ms,
      hoverRegion { x: @{vars.right} - @{vars.fullWidth} + @{vars.seg3X}, y: @{vars.y}, width: @{vars.segWidth}, height: @{vars.height}, enabled: @{vars.expand} > f32(0.5) } },
    SizeZone { type: "group", z: 15, x: @{vars.right} - @{vars.fullWidth} + @{vars.seg4X}, y: @{vars.y}, width: @{vars.segWidth}, height: @{vars.height}, visible: @{vars.expand} > f32(0.02), transition: 150ms, unhoverTransition: 130ms,
      hoverRegion { x: @{vars.right} - @{vars.fullWidth} + @{vars.seg4X}, y: @{vars.y}, width: @{vars.segWidth}, height: @{vars.height}, enabled: @{vars.expand} > f32(0.5) } },
    Shadow { type: "group", x: f32(@{vars.right} - f32(@{vars.smallWidth} + @{vars.span} * @{vars.expand})), y: @{vars.y}, width: f32(@{vars.smallWidth} + @{vars.span} * @{vars.expand}), height: @{vars.height}, radius: 17, shadowOpacity: f32(0.04 * @{vars.alpha}), shadowX: 0, shadowY: 2, shadowBlur: 10, shadowQuality: 5, shadowColor: @{pogget.theme.white} },
    Pill { type: "group", x: f32(@{vars.right} - f32(@{vars.smallWidth} + @{vars.span} * @{vars.expand})), y: @{vars.y}, width: f32(@{vars.smallWidth} + @{vars.span} * @{vars.expand}), height: @{vars.height}, clip: true, clipLayer: true, clipRadius: 17,
      Content { type: "group", x: f32(@{vars.span} * @{vars.expand} - @{vars.span}), y: 0, width: @{vars.fullWidth}, height: @{vars.height},
        Surface { type: "rect", width: @{vars.fullWidth}, height: @{vars.height}, radius: 17, background: @{pogget.theme.midnight}, fillOpacity: @{vars.alpha}, border: 1, borderColor: @{pogget.theme.white}, borderOpacity: f32(0.14 + f32(0.14 * @{vars.expand})) },
        Highlight { type: "glass", visible: false, width: @{vars.fullWidth}, height: @{vars.height}, radius: 17, background: @{pogget.theme.midnight}, fillOpacity: @{vars.alpha}, glassOpacity: 0.9, glassActive: @{pogget.frame} == 3 },
        Divider { type: "rect", visible: @{vars.expand} > f32(0.35), x: 160, y: 10, width: 1, height: 14, background: @{pogget.theme.white}, fillOpacity: 0.10 },
        BUTTONS,
        SortMark { type: "icon", x: @{vars.markX}, y: @{vars.markY}, width: @{vars.markSize}, height: @{vars.markSize}, textY: 0, textSize: @{vars.markSize}, icon: "\\uf161", font: "Font Awesome 6 Free Solid", textRenderer: "glyph", color: @{pogget.buttonColor}, opacity: f32(0.70 + f32(0.12 * @{vars.expand})) }
      }
    },
    TIPS,
    MENUS
  }
}`;
const buttons = [
  ["ButtonAlpha", "seg1X", "sortNameAsc", "\\uf15d"],
  ["ButtonAlphaDesc", "seg2X", "sortNameDesc", "\\uf15e"],
  ["ButtonTime", "seg3X", "sortTimeDesc", "\\uf017", "@{vars.zoneTime}"],
  ["ButtonSize", "seg4X", "sortSizeDesc", "\\uf15b", "@{vars.zoneSize}"],
]
  .map(([name, x, action, glyph, input]) => {
    const progress =
      input || `@{SortPill.view.Pill.Content.${name}.hoverProgress}`;
    return `${name} { type: "group", z: 10, visible: @{vars.expand} > f32(0.02), x: @{vars.${x}}, y: 0, width: @{vars.segWidth}, height: @{vars.height}, action: pogget.action.${action}, transition: 150ms, unhoverTransition: 110ms, pressDuration: 120ms, releaseDuration: 160ms, pressScale: 0.94,
    Bg { type: "rect", visible: ${progress} > f32(0.01), x: 0, y: @{vars.segY}, width: @{vars.segWidth}, height: @{vars.segHeight}, radius: @{vars.segRadius}, background: @{vars.hoverTint}, fillOpacity: f32(0.90 * ${progress}) },
    Glyph { type: "icon", x: @{vars.iconX}, y: @{vars.iconY}, width: @{vars.iconSize}, height: @{vars.iconSize}, textY: 0, textSize: @{vars.iconSize}, icon: "${glyph}", font: "Font Awesome 6 Free Solid", textRenderer: "glyph", color: @{pogget.buttonColor}, opacity: f32(0.62 + f32(0.38 * ${progress})) ${name === "ButtonSize" ? ", visible: true" : ""} }
  }`;
  })
  .join(",\n");
const tips = ["Alpha", "AlphaDesc"]
  .map((suffix, i) => {
    const progress = `@{SortPill.view.Pill.Content.Button${suffix}.hoverProgress}`,
      other = `@{SortPill.view.Pill.Content.Button${i ? "Alpha" : "AlphaDesc"}.hoverProgress}`;
    return `Tip${suffix} { type: "group", z: 20, x: f32(@{vars.right} - @{vars.fullWidth} + @{vars.seg${i + 1}X} + @{vars.tipShift}), y: f32(@{vars.tipY} + f32(4 * (1 - ${progress}))), width: @{vars.tipWidth}, height: @{vars.tipHeight}, visible: ${progress} > f32(0.01) && ${progress} ${i ? ">=" : ">"} ${other} && ${progress} >= @{vars.zoneTime} && ${progress} >= @{vars.zoneSize}, opacity: f32(clamp(${progress} * 2.2, 0, 1)),
    Box { type: "rect", width: @{vars.tipWidth}, height: @{vars.tipHeight}, radius: 7, background: @{pogget.theme.midnight}, fillOpacity: f32(0.96 * @{vars.alpha}), border: 1, borderColor: @{pogget.theme.white}, borderOpacity: 0.14, shadowOpacity: f32(0.05 * @{vars.alpha}), shadowY: 2, shadowBlur: 8, shadowQuality: 4, shadowColor: @{pogget.theme.white} },
    Text { type: "text", x: 0, y: @{vars.tipTextY}, width: @{vars.tipWidth}, height: 14, label: "名称 ${i ? "Z→A" : "A→Z"}", textLiteral: true, textRenderer: "dwrite3", textNoWrap: true, textY: 0, textSize: 11, font: "Segoe UI", align: "center", color: @{pogget.buttonColor}, opacity: 0.92 }
  }`;
  })
  .join(",\n");
const menus = ["Time", "Size"]
  .map((name, i) => {
    const zone = `@{vars.zone${name}}`,
      other = `@{vars.zone${i ? "Time" : "Size"}}`;
    const rows = ["Asc", "Desc"]
      .map((direction, row) => {
        const progress = `@{SortPill.view.${name}Menu.${direction}.hoverProgress}`;
        return `${direction} { type: "group", z: 10, x: @{vars.subPad}, y: ${row ? "@{vars.subPad} + @{vars.subRowHeight} + @{vars.subPad}" : "@{vars.subPad}"}, width: @{vars.subWidth} - @{vars.subPad} * 2, height: @{vars.subRowHeight}, action: pogget.action.sort${name}${direction}, transition: 130ms, unhoverTransition: 110ms, pressDuration: 120ms, releaseDuration: 160ms, pressScale: 0.97,
      Bg { type: "rect", visible: ${progress} > f32(0.01), width: @{vars.subWidth} - @{vars.subPad} * 2, height: @{vars.subRowHeight}, radius: 6, background: @{vars.hoverTint}, fillOpacity: f32(0.88 * ${progress}) },
      Icon { type: "icon", x: @{vars.rowIconX}, y: @{vars.rowIconY}, width: @{vars.rowIconSize}, height: @{vars.rowIconSize}, textY: 0, textSize: @{vars.rowIconSize}, icon: "${row ? "\\uf0dd" : "\\uf0de"}", font: "Font Awesome 6 Free Solid", textRenderer: "glyph", color: @{pogget.buttonColor}, opacity: f32(0.62 + f32(0.38 * ${progress})) },
      Label { type: "text", x: @{vars.rowTextX}, y: @{vars.rowIconY}, width: 64, height: 14, label: "${i ? "大小" : "时间"}${row ? "倒序" : "正序"}", textLiteral: true, textRenderer: "dwrite3", textNoWrap: true, textY: 0, textSize: 11, font: "Segoe UI", align: "left", color: @{pogget.buttonColor}, opacity: 0.92 }
    }`;
      })
      .join(",\n");
    return `${name}Menu { type: "group", z: 20, x: f32(@{vars.right} - @{vars.fullWidth} + @{vars.${i ? "sizeMenuX" : "timeMenuX"}}), y: f32(@{vars.subTop} + f32(6 * (1 - ${zone}))), width: @{vars.subWidth}, height: @{vars.subHeight}, transition: 150ms, unhoverTransition: 130ms,
    visible: ${zone} > f32(0.02) && ${zone} ${i ? ">=" : ">"} ${other} && ${zone} > @{SortPill.view.Pill.Content.ButtonAlpha.hoverProgress} && ${zone} > @{SortPill.view.Pill.Content.ButtonAlphaDesc.hoverProgress},
    hoverRegion { x: f32(@{vars.right} - @{vars.fullWidth} + @{vars.${i ? "sizeMenuX" : "timeMenuX"}}), y: @{vars.subTop}, width: @{vars.subWidth}, height: @{vars.subBandHeight}, enabled: @{vars.shown} },
    Panel { type: "rect", width: @{vars.subWidth}, height: @{vars.subHeight}, radius: 10, background: @{pogget.theme.midnight}, fillOpacity: f32(0.96 * @{vars.alpha}), border: 1, borderColor: @{pogget.theme.white}, borderOpacity: 0.14, shadowOpacity: f32(0.05 * @{vars.alpha}), shadowY: 3, shadowBlur: 10, shadowQuality: 4, shadowColor: @{pogget.theme.white} },
    ${rows}
  }`;
  })
  .join(",\n");
export const sortPillSource = core
  .replace("BUTTONS", buttons)
  .replace("TIPS", tips)
  .replace("MENUS", menus)
  .replaceAll("@{", "${");
