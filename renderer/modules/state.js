// Shared mutable state (passed by reference across modules)
export const state = {
  settings: {},
  currentFile: null,
  saveTimeout: null,
  lines: [],
  currentLineIndex: 0,
  currentMode: 'file',
  bookmarks: [],
  webviewReady: false,
  readerModeEnabled: false,
  readerCssKey: null,
  progressSaveTimeout: null,
  extractedFromWeb: false,
  extractNextChapterUrl: null,  // URL for auto-loading next chapter
  autoLoadingNext: false,       // prevent double-loading
  activePreset: null,     // index into customPresets, or null
  isPresetDirty: false,
  isPro: false,
};

// DOM element references (initialized by initDom)
export const dom = {};

export function initDom() {
  dom.app = document.getElementById('app');
  dom.titleFilename = document.getElementById('titlebar-filename');
  dom.readerContainer = document.getElementById('reader-container');
  dom.readerContent = document.getElementById('reader-content');
  dom.textContent = document.getElementById('text-content');
  dom.placeholder = document.getElementById('placeholder');
  dom.progressFill = document.getElementById('progress-fill');
  dom.settingsPanel = document.getElementById('settings-panel');
  dom.singleLineOverlay = document.getElementById('single-line-overlay');
  dom.singleLineText = document.getElementById('single-line-text');
  dom.urlBar = document.getElementById('url-bar');
  dom.urlInput = document.getElementById('url-input');
  dom.webview = document.getElementById('webview');
  dom.bookmarksDropdown = document.getElementById('bookmarks-dropdown');
  dom.bookmarksList = document.getElementById('bookmarks-list');
  dom.bookmarksEmpty = document.getElementById('bookmarks-empty');
  dom.btnOpen = document.getElementById('btn-open');
  dom.btnBookmark = document.getElementById('btn-bookmark');
  dom.btnBookmarksList = document.getElementById('btn-bookmarks-list');
  dom.btnCloseFile = document.getElementById('btn-close-file');
  dom.btnBackToWeb = document.getElementById('btn-back-to-web');
  dom.btnExtractRead = document.getElementById('btn-extract-read');
  dom.recentFiles = document.getElementById('recent-files');
  dom.progressBar = document.getElementById('progress-bar');
}

// ============ Utility Functions ============
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export function isColorDark(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 < 0.5;
}

export function formatHotkey(hotkey) {
  if (!hotkey) return '';
  return hotkey
    .replace('CommandOrControl', window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl')
    .replace('Command', 'Cmd');
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}