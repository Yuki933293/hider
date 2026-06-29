<div align="center">
  <img src="build/icon.png" width="96" alt="Hider logo" />

  <h1>Hider</h1>

  <p><strong>A discreet desktop reader for quiet, local-first reading.</strong></p>
  <p>透明悬浮、沉浸纯文字、本地文件与网页阅读合一的隐身阅读器。</p>

  <p>
    <a href="https://github.com/Yuki933293/hider"><img alt="GitHub repo" src="https://img.shields.io/badge/GitHub-hider-181717?logo=github" /></a>
    <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" />
    <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" />
    <img alt="License" src="https://img.shields.io/badge/license-ISC-green" />
  </p>
</div>

---

## Overview

Hider is a stealth-oriented novel and document reader built with Electron. It focuses on a low-visibility reading experience: transparent floating windows, shortcut-driven control, local file reading, web reader cleanup, and an independent immersive mode that can show only the text itself.

Hider 是一个偏「偷闲阅读」场景的桌面阅读器。它不是传统电子书管理器，而是一个可悬浮、可透明、可快速隐藏、可进入无边界沉浸文字模式的轻量工具。

## Highlights

| Feature | Description |
| --- | --- |
| Immersive Mode | Hide all app chrome and show only floating text with configurable lines, font size, color, opacity, and line height. |
| Local Reader | Open `.txt`, `.md`, `.text`, and `.epub` files with progress restore and recent files. |
| Smart TOC | Detect TXT/Markdown/EPUB-like chapter headings and jump across chapters quickly. |
| Web Reader | Browse web pages, extract readable content, and apply site-specific reader rules. |
| Stealth Controls | Global shortcuts, boss key, hover mode, always-on-top, transparent background, and text-only display. |
| Presets | Save window size, typography, opacity, hover behavior, visible line count, and immersive settings as presets. |

## Screens And Modes

Hider is designed around several reading surfaces:

- **File Mode**: local text / Markdown / EPUB reading.
- **Web Mode**: built-in webview with reader-mode extraction and site rules.
- **Line-Limited Mode**: show only a fixed number of lines for compact reading.
- **Independent Immersive Mode**: borderless text-only scrolling, no titlebar, no progress bar, no visible controls.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Shift + H` | Show / hide Hider |
| `Ctrl/Cmd + Shift + X` | Boss key |
| `Ctrl/Cmd + Shift + S` | Open settings |
| `Ctrl/Cmd + Shift + F` | Toggle immersive mode |
| `Ctrl/Cmd + O` | Open file in immersive mode |
| `Esc` | Exit immersive mode / close settings |
| `Ctrl/Cmd + + / -` | Adjust font size |
| `Space / PageDown` | Scroll down |
| `PageUp` | Scroll up |
| `ArrowUp / ArrowDown` | Move in line-limited reading |

Shortcuts are configurable in the settings panel. Hider also reports shortcut conflicts when a key combination is already used by Hider, the OS, or another app.

## Quick Start

```bash
git clone https://github.com/Yuki933293/hider.git
cd hider
npm install
npm start
```

Build distributables:

```bash
npm run build
npm run build:mac
npm run build:win
```

## Project Structure

```text
main.js                    Electron main process, IPC, file loading, shortcuts
preload.js                 Safe renderer bridge
renderer/app.js            Renderer entry and top-level interactions
renderer/modules/state.js  Shared state and DOM references
renderer/modules/content.js
                           File/web content, TOC, progress, reader mode
renderer/modules/settings.js
                           Settings, presets, shortcuts, Pro UI
renderer/modules/hover.js  Hover/click-through window behavior
renderer/adapters/         Site adapter experiments
scripts/                   Icon, license, notarization helpers
ROADMAP.md                 Product and engineering roadmap
```

## Roadmap

Current focus:

- Improve immersive-mode text selection without exposing visible drag handles.
- Continue stabilizing hover / click-through / window interaction states.
- Expand local-first backup, export, and migration.
- Improve web reader extraction and site rule coverage.
- Explore a reusable presence-gate architecture for continuous privacy protection.

See [ROADMAP.md](ROADMAP.md) for the full plan.

## Design Principles

- **Low visibility first**: controls should stay quiet and shortcuts should be fast.
- **Local-first reading**: files, progress, and settings should work without accounts or cloud services.
- **Small surface, useful depth**: the first screen should be usable, but power users can tune typography, opacity, shortcuts, presets, and reader rules.
- **Explicit tradeoffs**: stealth interactions sometimes conflict with normal editor behavior; Hider favors discreet reading by default while leaving room for configurable escape hatches.

## License

ISC
