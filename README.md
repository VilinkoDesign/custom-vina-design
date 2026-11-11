# CustomVinaEditor

这是在线编辑器的独立运行版本，保留界面、解析与渲染模块、Pogget 标准数据、打开示例所需的预设，以及本地 FA6 图标、字体和许可证。

本地预览需要 Node.js 20 或更新版本，无需安装依赖。在本目录运行：

```powershell
npm start
```

打开 <http://127.0.0.1:4173>。若端口已占用，可在 PowerShell 中先设置 `$env:PORT=4174`，然后运行 `npm start`，打开对应端口。

也可以把此目录作为网站根目录部署到静态 HTTP 服务。请保留目录结构；浏览器模块与预设读取需要 HTTP 服务。

FA6 图标及字体由 Fonticons, Inc. 提供，许可证见 [vendor/fontawesome/LICENSE.txt](vendor/fontawesome/LICENSE.txt)。
