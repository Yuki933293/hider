// Entry point — imports modules and wires up top-level events
import { state, dom, initDom } from './modules/state.js';
import { initContent, switchMode, showContent, closeFile, navigateLine, navigateImmersiveLines, saveCurrentProgressNow, closeTocDropdown, isLineLimitedMode, isImmersiveFileMode } from './modules/content.js';
import { initSettings, applySettings, syncControlsToSettings, renderCustomPresets, ensureDefaultPresets, restoreActivePreset, handleHotkeyRecording, cancelRecordingIfOutside, debounceSave, markPresetDirty, updateProStatus, updateProFeatureUI, updateSiteRulesUI, toggleAlwaysOnTop, applyExternalAlwaysOnTop, toggleImmersiveMode, setImmersiveMode, applyShortcutRegistrationStatus } from './modules/settings.js';
import { initHoverController, setHoverDragging } from './modules/hover.js';

// ============ Initialize ============
initDom();
initContent();
initSettings();
initHoverController();

function isImeTextEntry(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return ['text', 'search', 'url', 'email', 'password', 'number', ''].includes((el.type || '').toLowerCase());
}

document.addEventListener('focusin', (e) => {
  if (isImeTextEntry(e.target)) {
    window.api.setTextInputActive?.(true);
  }
});

document.addEventListener('focusout', (e) => {
  if (isImeTextEntry(e.target)) {
    window.setTimeout(() => {
      if (!isImeTextEntry(document.activeElement)) {
        window.api.setTextInputActive?.(false);
      }
    }, 0);
  }
});

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

window.api.onToggleSettings(() => toggleSettings());
window.api.onToggleImmersiveMode(() => toggleImmersiveMode());
window.api.onShortcutRegistrationResult((status) => applyShortcutRegistrationStatus(status));
window.api.onAlwaysOnTopChanged((enabled) => {
  applyExternalAlwaysOnTop(enabled);
});

window.api.onFileLoaded((data) => {
  saveCurrentProgressNow();
  state.currentFile = data;
  if (state.currentMode !== 'file') {
    switchMode('file');
  }
  showContent(data);
  applySettings();
});

window.addEventListener('beforeunload', () => {
  saveCurrentProgressNow({ sync: true });
});

// ============ Titlebar Buttons ============
dom.btnOpen.addEventListener('click', () => window.api.openFile());
dom.btnPin.addEventListener('click', () => toggleAlwaysOnTop());
dom.btnImmersive.addEventListener('click', () => toggleImmersiveMode());
dom.btnCloseFile.addEventListener('click', closeFile);
document.getElementById('btn-settings').addEventListener('click', toggleSettings);
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('btn-close').addEventListener('click', () => window.api.closeWindow());
document.getElementById('btn-close-settings').addEventListener('click', () => {
  dom.settingsPanel.classList.add('hidden');
  document.getElementById('btn-settings').classList.remove('active');
});

function toggleSettings() {
  if (isImmersiveFileMode()) {
    setImmersiveMode(false);
  }
  dom.settingsPanel.classList.toggle('hidden');
  document.getElementById('btn-settings').classList.toggle('active', !dom.settingsPanel.classList.contains('hidden'));
}

// Right-click to open settings (essential in text-only mode where titlebar is hidden)
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#settings-panel, webview')) return;
  e.preventDefault();
  toggleSettings();
});

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
    closeTocDropdown();
    if (isImmersiveFileMode()) {
      e.preventDefault();
      setImmersiveMode(false);
      return;
    }
    if (inSettings) {
      dom.settingsPanel.classList.add('hidden');
      document.getElementById('btn-settings').classList.remove('active');
    }
    return;
  }

  if (inSettings || state.currentMode === 'web') return;

  if (isImmersiveFileMode() && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    window.api.openFile();
    return;
  }

  // Line-limited mode navigation
  if (isLineLimitedMode() && state.currentFile) {
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

  // Immersive mode keeps every keyboard movement aligned to full text rows.
  if (isImmersiveFileMode() && state.currentFile) {
    const pageLines = Math.max(1, state.settings.immersiveLines || 3);
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      navigateImmersiveLines(1);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      navigateImmersiveLines(-1);
      return;
    }
    if (e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault();
      navigateImmersiveLines(pageLines);
      return;
    }
    if (e.key === 'PageUp') {
      e.preventDefault();
      navigateImmersiveLines(-pageLines);
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
    if (isImmersiveFileMode()) {
      state.settings.immersiveFontSize = Math.min(32, (state.settings.immersiveFontSize || state.settings.fontSize || 16) + 1);
    } else {
      state.settings.fontSize = Math.min(32, state.settings.fontSize + 1);
    }
    markPresetDirty();
    applySettings();
    syncControlsToSettings();
    debounceSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault();
    if (isImmersiveFileMode()) {
      state.settings.immersiveFontSize = Math.max(10, (state.settings.immersiveFontSize || state.settings.fontSize || 16) - 1);
    } else {
      state.settings.fontSize = Math.max(10, state.settings.fontSize - 1);
    }
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

  if (!dom.tocDropdown.classList.contains('hidden') && !e.target.closest('#toc-dropdown, #btn-toc')) {
    closeTocDropdown();
  }
});

document.addEventListener('selectstart', (e) => {
  if (isImmersiveFileMode() && e.target.closest('#text-content, #placeholder')) {
    e.preventDefault();
  }
});

document.addEventListener('dragstart', (e) => {
  if (isImmersiveFileMode() && e.target.closest('#text-content, #placeholder')) {
    e.preventDefault();
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
        saveCurrentProgressNow();
        state.currentFile = { path: file.name, name: file.name, content: reader.result, scrollPosition: 0 };
        showContent(state.currentFile);
        applySettings();
      };
      reader.readAsText(file);
    }
  }
});

// ============ Manual Window Drag ============
let isDragging = false;
let isDragPointerDown = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function endWindowDrag() {
  isDragPointerDown = false;
  if (!isDragging) return;
  isDragging = false;
  setHoverDragging(false);
}

document.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;

  if (isImmersiveFileMode() && e.button === 0 && e.target.closest('#text-content, #placeholder')) {
    e.preventDefault();
  } else {
    if (e.target.closest('button, input, select, textarea, label, #settings-panel, webview, #bookmarks-dropdown, #toc-dropdown')) return;
    if (state.currentMode === 'web' && e.target.closest('#reader-container')) return;
  }

  isDragPointerDown = true;
  const result = await window.api.startDrag();
  if (!isDragPointerDown) return;
  if (!result) return;
  isDragging = true;
  setHoverDragging(true);
  dragOffsetX = result.mouseX - result.winX;
  dragOffsetY = result.mouseY - result.winY;
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  if ((e.buttons & 1) !== 1) {
    endWindowDrag();
    return;
  }
  window.api.moveWindow({ offsetX: dragOffsetX, offsetY: dragOffsetY });
});

document.addEventListener('mouseup', endWindowDrag);
document.addEventListener('mouseleave', endWindowDrag);
window.addEventListener('blur', endWindowDrag);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) endWindowDrag();
});
