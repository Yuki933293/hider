// Entry point — imports modules and wires up top-level events
import { state, dom, initDom } from './modules/state.js';
import { initContent, switchMode, showContent, closeFile, navigateLine } from './modules/content.js';
import { initSettings, applySettings, syncControlsToSettings, renderCustomPresets, ensureDefaultPresets, restoreActivePreset, handleHotkeyRecording, cancelRecordingIfOutside, debounceSave, markPresetDirty, updateProStatus, updateProFeatureUI, updateSiteRulesUI } from './modules/settings.js';

// ============ Initialize ============
initDom();
initContent();
initSettings();

// ============ IPC Events ============
window.api.onSettingsLoaded((data) => {
  state.isPro = !!data.proActivated;
  state.settings = data;
  ensureDefaultPresets();
  restoreActivePreset();
  applySettings();
  syncControlsToSettings();
  renderCustomPresets();
  updateProStatus();
  updateProFeatureUI();
  updateSiteRulesUI();
});

window.api.onFileLoaded((data) => {
  state.currentFile = data;
  if (state.currentMode !== 'file') {
    switchMode('file');
  }
  showContent(data);
});

// ============ Titlebar Buttons ============
dom.btnOpen.addEventListener('click', () => window.api.openFile());
dom.btnCloseFile.addEventListener('click', closeFile);
document.getElementById('btn-settings').addEventListener('click', toggleSettings);
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('btn-close').addEventListener('click', () => window.api.closeWindow());
document.getElementById('btn-close-settings').addEventListener('click', () => {
  dom.settingsPanel.classList.add('hidden');
  document.getElementById('btn-settings').classList.remove('active');
});

function toggleSettings() {
  dom.settingsPanel.classList.toggle('hidden');
  document.getElementById('btn-settings').classList.toggle('active', !dom.settingsPanel.classList.contains('hidden'));
}

// ============ Keyboard Shortcuts ============
document.addEventListener('keydown', (e) => {
  // Hotkey recording takes priority
  if (handleHotkeyRecording(e)) return;

  // Don't handle shortcuts when URL input is focused
  if (document.activeElement === dom.urlInput) return;

  handleKeyboardShortcuts(e);
});

function handleKeyboardShortcuts(e) {
  const inSettings = !dom.settingsPanel.classList.contains('hidden');

  if (e.key === 'Escape') {
    if (inSettings) {
      dom.settingsPanel.classList.add('hidden');
      document.getElementById('btn-settings').classList.remove('active');
    }
    return;
  }

  if (inSettings || state.currentMode === 'web') return;

  // Line-limited mode navigation
  if (state.settings.visibleLines > 0 && state.currentFile) {
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      navigateLine(1);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      navigateLine(-1);
      return;
    }
  }

  // Normal mode scrolling
  if (e.key === ' ' || e.key === 'PageDown') {
    e.preventDefault();
    dom.readerContent.scrollBy({ top: dom.readerContent.clientHeight * 0.85, behavior: 'smooth' });
  }
  if (e.key === 'PageUp') {
    e.preventDefault();
    dom.readerContent.scrollBy({ top: -dom.readerContent.clientHeight * 0.85, behavior: 'smooth' });
  }
  if (e.key === 'ArrowDown') {
    dom.readerContent.scrollBy({ top: 60, behavior: 'smooth' });
  }
  if (e.key === 'ArrowUp') {
    dom.readerContent.scrollBy({ top: -60, behavior: 'smooth' });
  }

  // Font size shortcuts
  if ((e.ctrlKey || e.metaKey) && e.key === '=') {
    e.preventDefault();
    state.settings.fontSize = Math.min(32, state.settings.fontSize + 1);
    markPresetDirty();
    applySettings();
    syncControlsToSettings();
    debounceSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault();
    state.settings.fontSize = Math.max(10, state.settings.fontSize - 1);
    markPresetDirty();
    applySettings();
    syncControlsToSettings();
    debounceSave();
  }
}

// ============ Click Handler ============
document.addEventListener('click', (e) => {
  cancelRecordingIfOutside(e);

  // Click outside settings panel to close it
  // Skip if target was detached from DOM (e.g. by renderCustomPresets rebuild)
  if (!dom.settingsPanel.classList.contains('hidden') && e.target.isConnected && !e.target.closest('#settings-panel, #btn-settings')) {
    dom.settingsPanel.classList.add('hidden');
    document.getElementById('btn-settings').classList.remove('active');
  }

  // Click outside bookmarks dropdown to close it
  if (!dom.bookmarksDropdown.classList.contains('hidden') && !e.target.closest('#bookmarks-dropdown, #btn-bookmarks-list')) {
    dom.bookmarksDropdown.classList.add('hidden');
    dom.btnBookmarksList.classList.remove('active');
  }
});

// ============ Drag & Drop ============
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (state.currentMode !== 'file') {
      switchMode('file');
    }
    if (file.path) {
      window.api.loadFilePath(file.path);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        state.currentFile = { path: file.name, name: file.name, content: reader.result, scrollPosition: 0 };
        showContent(state.currentFile);
      };
      reader.readAsText(file);
    }
  }
});

// ============ Mouse Tracking (hover mode + auto-hide) ============
let mouseOverApp = false;
let hoverPollInterval = null;

function showWindow() {
  if (mouseOverApp) return;
  mouseOverApp = true;
  dom.app.classList.add('mouse-over');
  if (state.settings.autoHideOnLeave) {
    dom.app.classList.remove('auto-hidden');
  }
  startHoverPoll();
}

function hideWindow() {
  mouseOverApp = false;
  stopHoverPoll();
  dom.app.classList.remove('mouse-over');
  if (state.settings.autoHideOnLeave) {
    dom.app.classList.add('auto-hidden');
  }
}

// Poll mouse position via IPC to reliably detect when mouse leaves window
// This works regardless of webview stealing events
function startHoverPoll() {
  stopHoverPoll();
  if (!state.settings.hoverMode) return;
  hoverPollInterval = setInterval(async () => {
    const inside = await window.api.isMouseInWindow();
    if (!inside && mouseOverApp) {
      hideWindow();
    }
  }, 200);
}

function stopHoverPoll() {
  if (hoverPollInterval) {
    clearInterval(hoverPollInterval);
    hoverPollInterval = null;
  }
}

// Entry detection: document events + overlay for webview area
document.addEventListener('mouseenter', showWindow);
document.addEventListener('mousemove', () => {
  if (!mouseOverApp) showWindow();
});

const webviewOverlay = document.getElementById('webview-hover-overlay');
webviewOverlay.addEventListener('mouseenter', showWindow);

// ============ Manual Window Drag ============
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

document.addEventListener('mousedown', async (e) => {
  if (e.target.closest('button, input, select, textarea, label, #settings-panel, webview, #bookmarks-dropdown')) return;
  if (state.currentMode === 'web' && e.target.closest('#reader-container')) return;
  const result = await window.api.startDrag();
  if (!result) return;
  isDragging = true;
  dragOffsetX = result.mouseX - result.winX;
  dragOffsetY = result.mouseY - result.winY;
  document.body.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', () => {
  if (!isDragging) return;
  window.api.moveWindow({ offsetX: dragOffsetX, offsetY: dragOffsetY });
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = '';
  }
});