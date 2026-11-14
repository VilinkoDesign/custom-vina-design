export const personalizationSource = `Preset { dependsOn: "Pogget_Std" }
Custom {
 label: "自定义个性化分组标题需要完整换行显示",
 description: "这是一段很长的预设说明，用于验证窄面板和高缩放下文本完整换行，折叠标题自动增高，展开后控件不能与说明重叠。Long descriptions must remain completely inside the header.",
 icon: "\\uf013",
 ui {
  Width { label: "控件宽度", control: "slider", type: "number", min: 80, max: 260, step: 2, default: 120 },
  Enabled { label: "显示颜色控件", control: "switch", type: "boolean", default: true },
  Color { label: "自定义颜色", control: "color", type: "number", default: rgb(90,140,200), visible: \${ui.Enabled.value}, notice: "颜色说明：H、S、L 均需实时生效并保留。" },
  Mode { label: "方向选择", control: "choice", type: "boolean", invert: true, default: false, choices { a: "向上", b: "向下" } },
  Text { label: "文本内容", control: "text", type: "text", default: "中文与 Emoji 😀" },
  Font { label: "字体选择", control: "font", type: "text", default: "Segoe UI" },
  Action { label: "列表视图", control: "button", action: pogget.action.view.list }
 },
 view { type: "rect", x: 20, y: 80, width: \${ui.Width.value}, height: 80, background: \${ui.Color.value}, visible: \${ui.Enabled.value} }
}
`;
