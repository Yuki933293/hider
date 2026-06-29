<div align="center">
  <img src="build/icon.png" width="96" alt="Hider logo" />

  <h1>Hider</h1>

  <p><strong>一个低可见度、透明悬浮、本地优先的桌面阅读器。</strong></p>
  <p>
    <strong>中文</strong>
    ·
    <a href="README.en.md">English</a>
  </p>

  <p>
    <a href="https://github.com/Yuki933293/hider"><img alt="GitHub repo" src="https://img.shields.io/badge/GitHub-hider-181717?logo=github" /></a>
    <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" />
    <img alt="Platform" src="https://img.shields.io/badge/macOS%20%7C%20Windows-supported-blue" />
    <img alt="License" src="https://img.shields.io/badge/license-ISC-green" />
  </p>
</div>

---

Hider 是一个面向安静阅读场景的桌面应用。它可以把小说、文档或网页内容以透明悬浮窗口的形式显示在桌面上，也可以进入只保留文字的沉浸模式，让阅读界面尽可能轻、稳、低打扰。

## 功能亮点

- **透明悬浮阅读**：窗口透明度、字体、字号、行高、颜色和置顶状态都可以按需调整。
- **沉浸文字模式**：隐藏标题栏、按钮、进度条等控件，只显示可滚动的纯文字。
- **本地文件阅读**：支持打开本地 `.txt`、`.md`、`.text` 和 `.epub` 文件，并恢复上次阅读进度。
- **智能目录跳转**：自动识别章节标题，支持在本地文件中快速切换章节。
- **网页阅读清洗**：通过内置 WebView 打开网页，并提取正文内容用于更干净的阅读。
- **快捷键控制**：支持全局显示/隐藏、老板键、设置面板和沉浸模式快捷键。
- **阅读预设**：保存常用窗口尺寸、透明度、字体样式、行数和沉浸模式配置。

## 适合场景

- 在桌面上保留一个低存在感的文字窗口。
- 阅读本地小说、笔记、Markdown 或 EPUB 文本。
- 将网页正文提取成更干净的阅读内容。
- 需要快速隐藏、恢复、调整透明度和切换显示状态的轻量阅读场景。

## 下载与运行

推荐从 [GitHub Releases](https://github.com/Yuki933293/hider/releases) 下载发行版：

- macOS：下载 `.dmg` 后拖入应用程序目录。
- Windows：下载 `Hider-*-Setup-x64.exe` 后按安装向导完成安装。

也可以从源码运行：

```bash
git clone https://github.com/Yuki933293/hider.git
cd hider
npm install
npm start
```

构建本地安装包：

```bash
npm run build
npm run build:mac
npm run build:win
```

应用内“关于与更新”区域会检测最新 GitHub Release，并在发现新版本时下载对应系统的安装包。

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/Cmd + Shift + H` | 显示或隐藏 Hider |
| `Ctrl/Cmd + Shift + X` | 老板键 |
| `Ctrl/Cmd + Shift + S` | 打开设置 |
| `Ctrl/Cmd + Shift + F` | 切换沉浸模式 |
| `Ctrl/Cmd + O` | 打开本地文件 |
| `Esc` | 退出沉浸模式或关闭设置 |
| `Ctrl/Cmd + + / -` | 调整字体大小 |
| `Space / PageDown` | 向下滚动 |
| `PageUp` | 向上滚动 |
| `ArrowUp / ArrowDown` | 在固定行数模式中逐行移动 |

快捷键可以在设置中修改。若快捷键被系统或其它应用占用，Hider 会在设置界面提示注册失败或冲突状态。

## 阅读模式

| 模式 | 说明 |
| --- | --- |
| 本地文件模式 | 打开本地文本文件，支持进度恢复和目录跳转。 |
| 网页模式 | 使用内置 WebView 访问网页，并提取适合阅读的正文。 |
| 固定行数模式 | 只显示指定行数，适合小窗口悬浮阅读。 |
| 沉浸模式 | 隐藏所有可见控件，只保留文字、滚动和快捷键操作。 |

## 隐私说明

Hider 默认以本地优先的方式工作。阅读进度、最近文件、快捷键和样式配置保存在本机应用数据目录中，不需要账号，也不会主动上传本地阅读内容。

网页模式会访问用户打开的网站；网页内容提取仅用于当前阅读界面展示。

## 许可证

本项目基于 ISC License 发布。
