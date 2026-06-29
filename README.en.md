<div align="center">
  <img src="build/icon.png" width="96" alt="Hider logo" />

  <h1>Hider</h1>

  <p><strong>A low-visibility, transparent, local-first desktop reader.</strong></p>
  <p>
    <a href="README.md">中文</a>
    ·
    <strong>English</strong>
  </p>

  <p>
    <a href="https://github.com/Yuki933293/hider"><img alt="GitHub repo" src="https://img.shields.io/badge/GitHub-hider-181717?logo=github" /></a>
    <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" />
    <img alt="Platform" src="https://img.shields.io/badge/macOS%20%7C%20Windows-supported-blue" />
    <img alt="License" src="https://img.shields.io/badge/license-ISC-green" />
  </p>
</div>

---

Hider is a desktop reader designed for quiet, low-distraction reading. It can display novels, documents, and cleaned web content in a transparent floating window, or switch into a text-only immersive mode with no visible app chrome.

## Highlights

- **Transparent floating reader**: Tune window opacity, typography, font size, line height, text color, and always-on-top behavior.
- **Immersive text mode**: Hide the titlebar, buttons, progress UI, and controls while keeping smooth text scrolling.
- **Local file reading**: Open `.txt`, `.md`, `.text`, and `.epub` files with reading progress restore.
- **Smart table of contents**: Detect chapter headings and jump between sections quickly.
- **Web reading cleanup**: Open pages in the built-in WebView and extract readable content.
- **Keyboard-first control**: Global show/hide, boss key, settings, and immersive-mode shortcuts.
- **Reading presets**: Save window size, opacity, typography, visible lines, and immersive-mode settings.

## Use Cases

- Keep a quiet text window floating on the desktop.
- Read local novels, notes, Markdown files, or EPUB text.
- Turn web pages into cleaner reading content.
- Quickly hide, restore, resize, and restyle a lightweight reading surface.

## Download And Run

The recommended path is to download a packaged release from [GitHub Releases](https://github.com/Yuki933293/hider/releases):

- macOS: download the `.dmg` and drag Hider into Applications.
- Windows: download `Hider-*-Setup-x64.exe` and follow the installer.

You can also run Hider from source:

```bash
git clone https://github.com/Yuki933293/hider.git
cd hider
npm install
npm start
```

Build local distributables:

```bash
npm run build
npm run build:mac
npm run build:win
```

The in-app "About and Updates" area checks the latest GitHub Release and downloads the installer for the current platform when a newer version is available.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Shift + H` | Show or hide Hider |
| `Ctrl/Cmd + Shift + X` | Boss key |
| `Ctrl/Cmd + Shift + S` | Open settings |
| `Ctrl/Cmd + Shift + F` | Toggle immersive mode |
| `Ctrl/Cmd + O` | Open a local file |
| `Esc` | Exit immersive mode or close settings |
| `Ctrl/Cmd + + / -` | Adjust font size |
| `Space / PageDown` | Scroll down |
| `PageUp` | Scroll up |
| `ArrowUp / ArrowDown` | Move line by line in line-limited mode |

Shortcuts can be changed in settings. If a shortcut is already used by the system or another app, Hider reports the conflict in the settings panel.

## Reading Modes

| Mode | Description |
| --- | --- |
| Local File | Read local text files with progress restore and chapter navigation. |
| Web | Browse pages in the built-in WebView and extract readable text. |
| Line-Limited | Show only a fixed number of lines for compact floating reading. |
| Immersive | Hide all visible controls and keep only text, scrolling, and shortcuts. |

## Privacy

Hider is local-first by default. Reading progress, recent files, shortcuts, and visual settings are stored in the local app data directory. Hider does not require an account and does not upload local reading content.

Web mode accesses the pages you open. Extracted web content is used only for the current reading view.

## License

Hider is released under the ISC License.
