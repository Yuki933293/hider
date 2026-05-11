// Settings panel, presets, hotkeys, applySettings
import { state, dom, hexToRgb, isColorDark, formatHotkey } from './state.js';
import { updateVisibleLines, updateProgress, convertReadingPosition, applyReaderMode, toggleReaderMode, getSiteRule, getCurrentHostname, isBuiltinSite } from './content.js';
import { syncHoverMode } from './hover.js';

let controls = {};
let valueDisplays = {};
let recordingInput = null;

const defaultPresets = [
  { name: '幽灵', fontColor: '#888888', fontOpacity: 0.15, bgColor: '#000000', bgOpacity: 0,
    hoverMode: true, visibleLines: 0, autoHideOnLeave: true, hideBg: true, fontSize: 14, lineHeight: 1.6 },
  { name: '暗淡', fontColor: '#666666', fontOpacity: 0.4, bgColor: '#f5f5f5', bgOpacity: 0.3,
    hoverMode: true, visibleLines: 0, autoHideOnLeave: true, hideBg: false, fontSize: 14, lineHeight: 1.6 },
  { name: '正常', fontColor: '#333333', fontOpacity: 1.0, bgColor: '#ffffff', bgOpacity: 0.95,
    hoverMode: false, visibleLines: 0, autoHideOnLeave: false, hideBg: false, fontSize: 16, lineHeight: 1.8 },
  { name: '深色', fontColor: '#00ff41', fontOpacity: 0.8, bgColor: '#0d0d0d', bgOpacity: 0.9,
    hoverMode: false, visibleLines: 0, autoHideOnLeave: false, hideBg: false, fontSize: 14, lineHeight: 1.6 },
];

const presetKeys = ['fontSize', 'fontColor', 'fontOpacity', 'lineHeight', 'bgColor', 'bgOpacity', 'hoverMode', 'visibleLines', 'autoHideOnLeave', 'hideBg', 'textOnly'];

// ============ Preset Initialization ============
export function ensureDefaultPresets() {
  if (!state.settings.customPresets || state.settings.customPresets.length === 0) {
    state.settings.customPresets = defaultPresets.map(p => ({ ...p }));
    window.api.saveSettings(state.settings);
  }
}

// ============ Active Preset State ============
// state.activePreset = index (number) or null
function setActivePreset(index) {
  state.activePreset = index;
  state.isPresetDirty = false;
  state.settings.activePresetIndex = index;
  renderCustomPresets();
}

function clearActivePreset() {
  state.activePreset = null;
  state.isPresetDirty = false;
  state.settings.activePresetIndex = null;
  renderCustomPresets();
}

// Restore active preset from saved settings on startup
export function restoreActivePreset() {
  const idx = state.settings.activePresetIndex;
  if (idx != null && state.settings.customPresets && state.settings.customPresets[idx]) {
    state.activePreset = idx;
    // Check if current settings still match the preset
    const preset = state.settings.customPresets[idx];
    const dirty = presetKeys.some(key => preset[key] !== undefined && preset[key] !== state.settings[key]);
    state.isPresetDirty = dirty;
  }
}

export function markPresetDirty() {
  if (state.activePreset == null) return;
  state.isPresetDirty = true;
  renderCustomPresets();
}

function syncAlwaysOnTopUi() {
  if (controls.alwaysOnTop) {
    controls.alwaysOnTop.checked = !!state.settings.alwaysOnTop;
  }
  if (dom.btnPin) {
    dom.btnPin.classList.toggle('active', !!state.settings.alwaysOnTop);
    dom.btnPin.setAttribute('aria-pressed', state.settings.alwaysOnTop ? 'true' : 'false');
    dom.btnPin.title = state.settings.alwaysOnTop ? '取消置顶' : '置顶窗口';
  }
}

export async function setAlwaysOnTop(enabled, { persist = true } = {}) {
  const previousValue = !!state.settings.alwaysOnTop;
  const nextValue = !!enabled;

  state.settings.alwaysOnTop = nextValue;
  syncAlwaysOnTopUi();

  if (!persist) return nextValue;

  try {
    const confirmed = await window.api.setAlwaysOnTop(nextValue);
    state.settings.alwaysOnTop = !!confirmed;
  } catch (error) {
    console.error('Failed to update always-on-top:', error);
    state.settings.alwaysOnTop = previousValue;
  }

  syncAlwaysOnTopUi();
  return state.settings.alwaysOnTop;
}

export function toggleAlwaysOnTop() {
  return setAlwaysOnTop(!state.settings.alwaysOnTop);
}

export function applyExternalAlwaysOnTop(enabled) {
  state.settings.alwaysOnTop = !!enabled;
  syncAlwaysOnTopUi();
}

export function initSettings() {
  controls = {
    fontSize: document.getElementById('set-font-size'),
    fontColor: document.getElementById('set-font-color'),
    fontOpacity: document.getElementById('set-font-opacity'),
    lineHeight: document.getElementById('set-line-height'),
    bgColor: document.getElementById('set-bg-color'),
    bgOpacity: document.getElementById('set-bg-opacity'),
    hoverMode: document.getElementById('set-hover-mode'),
    visibleLines: document.getElementById('set-visible-lines'),
    hideBg: document.getElementById('set-hide-bg'),
    textOnly: document.getElementById('set-text-only'),
    alwaysOnTop: document.getElementById('set-always-on-top'),
  };

  valueDisplays = {
    fontSize: document.getElementById('val-font-size'),
    fontOpacity: document.getElementById('val-font-opacity'),
    lineHeight: document.getElementById('val-line-height'),
    bgOpacity: document.getElementById('val-bg-opacity'),
  };

  // ============ Control event listeners ============
  controls.fontSize.addEventListener('input', (e) => {
    state.settings.fontSize = parseInt(e.target.value);
    valueDisplays.fontSize.textContent = `${state.settings.fontSize}px`;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.fontColor.addEventListener('input', (e) => {
    state.settings.fontColor = e.target.value;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.fontOpacity.addEventListener('input', (e) => {
    state.settings.fontOpacity = parseFloat(e.target.value);
    valueDisplays.fontOpacity.textContent = `${Math.round(state.settings.fontOpacity * 100)}%`;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.lineHeight.addEventListener('input', (e) => {
    state.settings.lineHeight = parseFloat(e.target.value);
    valueDisplays.lineHeight.textContent = state.settings.lineHeight.toFixed(1);
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.bgColor.addEventListener('input', (e) => {
    state.settings.bgColor = e.target.value;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.bgOpacity.addEventListener('input', (e) => {
    state.settings.bgOpacity = parseFloat(e.target.value);
    valueDisplays.bgOpacity.textContent = `${Math.round(state.settings.bgOpacity * 100)}%`;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.hoverMode.addEventListener('change', (e) => {
    state.settings.hoverMode = e.target.checked;
    state.settings.autoHideOnLeave = e.target.checked;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.visibleLines.addEventListener('input', (e) => {
    const oldVisibleLines = state.settings.visibleLines;
    state.settings.visibleLines = parseInt(e.target.value);
    document.getElementById('val-visible-lines').textContent =
      state.settings.visibleLines === 0 ? '全部' : `${state.settings.visibleLines} 行`;

    markPresetDirty();
    convertReadingPosition(oldVisibleLines, () => {
      applySettings();
      if (state.settings.visibleLines > 0 && state.currentFile) {
        updateVisibleLines();
        updateProgress();
      }
      debounceSave();
    });
  });


  controls.hideBg.addEventListener('change', (e) => {
    state.settings.hideBg = e.target.checked;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.textOnly.addEventListener('change', (e) => {
    state.settings.textOnly = e.target.checked;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.alwaysOnTop.addEventListener('change', (e) => {
    setAlwaysOnTop(e.target.checked);
  });

  // ============ Tab navigation ============
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ============ Hotkey recording ============
  document.querySelectorAll('.hotkey-input').forEach((el) => {
    el.addEventListener('click', () => startRecording(el));
  });

  document.getElementById('btn-restore-hotkeys').addEventListener('click', () => {
    state.settings.toggleHotkey = 'CommandOrControl+Shift+H';
    state.settings.bossHotkey = 'CommandOrControl+Shift+X';
    syncControlsToSettings();
    window.api.saveSettings(state.settings);
  });

  // ============ New preset button ============
  document.getElementById('btn-save-preset').addEventListener('click', () => {
    const container = document.getElementById('custom-presets');
    if (!container) return;
    const count = (state.settings.customPresets || []).length + 1;
    appendInlinePresetEditor(container, `我的预设 ${count}`, (name) => {
      saveCurrentAsPreset(name);
    });
  });

  // ============ Reset presets button ============
  document.getElementById('btn-reset-presets').addEventListener('click', () => {
    if (!confirm('恢复默认预设将替换所有预设为初始状态，确定继续？')) return;
    state.settings.customPresets = defaultPresets.map(p => ({ ...p }));
    clearActivePreset();
    window.api.saveSettings(state.settings);
    renderCustomPresets();
  });

  // ============ Bottom save bar buttons ============
  document.getElementById('btn-preset-save').addEventListener('click', () => {
    if (state.activePreset != null) {
      updatePreset(state.activePreset);
    }
  });

  document.getElementById('btn-preset-discard').addEventListener('click', () => {
    if (state.activePreset != null) {
      applyPreset(state.activePreset);
    }
  });

  updateWindowSizeDisplay();
  window.addEventListener('resize', updateWindowSizeDisplay);

  // ============ Site Rules ============
  initSiteRulesUI();
}

// ============ Apply Settings ============
export function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--font-size', `${state.settings.fontSize}px`);
  root.style.setProperty('--font-color', state.settings.fontColor);
  root.style.setProperty('--font-opacity', state.settings.fontOpacity);
  root.style.setProperty('--line-height', state.settings.lineHeight);
  root.style.setProperty('--bg-color', state.settings.bgColor);
  root.style.setProperty('--bg-opacity', state.settings.bgOpacity);

  const bgRgb = hexToRgb(state.settings.bgColor);
  if (bgRgb) {
    if (state.settings.hideBg) {
      dom.readerContainer.style.background = 'transparent';
    } else {
      dom.readerContainer.style.background = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${state.settings.bgOpacity})`;
    }
  }

  const isDark = isColorDark(state.settings.bgColor) && state.settings.bgOpacity > 0.3 && !state.settings.hideBg;
  dom.settingsPanel.classList.toggle('dark-theme', isDark);
  dom.app.classList.toggle('dark-theme', isDark);

  const titlebar = document.getElementById('titlebar');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const modeSwitcher = document.getElementById('mode-switcher');
  if (state.settings.hideBg || isDark) {
    titlebar.style.background = state.settings.hideBg ? 'transparent'
      : `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${Math.min(state.settings.bgOpacity + 0.05, 1)})`;
    dom.titleFilename.style.color = 'rgba(255, 255, 255, 0.6)';
    dom.btnCloseFile.style.color = 'rgba(255, 255, 255, 0.4)';
    document.querySelectorAll('#titlebar-buttons button').forEach(b => {
      b.style.color = 'rgba(255, 255, 255, 0.6)';
    });
    modeSwitcher.style.background = 'rgba(255, 255, 255, 0.06)';
    modeBtns.forEach(b => {
      b.style.color = b.classList.contains('active') ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.35)';
      b.style.background = b.classList.contains('active') ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
      b.style.boxShadow = 'none';
    });
    if (state.settings.hideBg) {
      dom.settingsPanel.style.background = 'rgba(248, 249, 250, 0.97)';
      dom.settingsPanel.style.borderColor = 'rgba(0, 0, 0, 0.06)';
    } else {
      dom.settingsPanel.style.background = 'rgba(30, 30, 40, 0.98)';
      dom.settingsPanel.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    }
  } else {
    titlebar.style.background = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${Math.min(state.settings.bgOpacity + 0.05, 1)})`;
    dom.titleFilename.style.color = 'rgba(0, 0, 0, 0.55)';
    dom.btnCloseFile.style.color = 'rgba(0, 0, 0, 0.3)';
    document.querySelectorAll('#titlebar-buttons button').forEach(b => {
      b.style.color = 'rgba(0, 0, 0, 0.55)';
    });
    modeSwitcher.style.background = '';
    modeBtns.forEach(b => {
      b.style.color = '';
      b.style.background = '';
      b.style.boxShadow = '';
    });
    dom.settingsPanel.style.background = 'rgba(248, 249, 250, 0.97)';
    dom.settingsPanel.style.borderColor = 'rgba(0, 0, 0, 0.06)';
  }

  if (state.settings.hideBg) {
    dom.urlBar.style.background = 'transparent';
    dom.urlBar.style.borderColor = 'transparent';
  } else if (isDark) {
    dom.urlBar.style.background = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${Math.min(state.settings.bgOpacity + 0.02, 1)})`;
    dom.urlBar.style.borderColor = 'rgba(255, 255, 255, 0.04)';
  } else {
    dom.urlBar.style.background = '';
    dom.urlBar.style.borderColor = '';
  }

  if (state.settings.hideBg) {
    dom.progressBar.style.background = 'transparent';
  } else {
    dom.progressBar.style.background = '';
  }

  dom.app.classList.toggle('hover-mode', !!state.settings.hoverMode);
  dom.app.classList.toggle('text-only-mode', !!state.settings.textOnly);

  // Inject/remove CSS to hide webview scrollbars in text-only mode
  if (state.settings.textOnly) {
    dom.webview.insertCSS('::-webkit-scrollbar { display: none !important; } html, body { scrollbar-width: none !important; overflow: -moz-scrollbars-none; }')
      .then(key => { state._textOnlyCssKey = key; }).catch(() => {});
  } else if (state._textOnlyCssKey) {
    dom.webview.removeInsertedCSS(state._textOnlyCssKey).catch(() => {});
    state._textOnlyCssKey = null;
  }

  if (!state.settings.hoverMode) {
    dom.webview.style.opacity = state.settings.fontOpacity;
  } else {
    dom.webview.style.opacity = '';
  }

  if (state.readerModeEnabled && state.currentMode === 'web') {
    applyReaderMode();
  }

  dom.app.classList.toggle('auto-hide-enabled', !!state.settings.autoHideOnLeave);
  if (!state.settings.autoHideOnLeave) {
    dom.app.classList.remove('auto-hidden');
  }

  if (state.currentMode === 'file') {
    if (state.settings.visibleLines > 0) {
      dom.singleLineOverlay.classList.remove('hidden');
      dom.readerContent.style.display = 'none';
    } else {
      dom.singleLineOverlay.classList.add('hidden');
      dom.readerContent.style.display = '';
    }
  }

  syncHoverMode();
}

// ============ Sync Controls ============
export function syncControlsToSettings() {
  controls.fontSize.value = state.settings.fontSize;
  valueDisplays.fontSize.textContent = `${state.settings.fontSize}px`;
  controls.fontColor.value = state.settings.fontColor;
  controls.fontOpacity.value = state.settings.fontOpacity;
  valueDisplays.fontOpacity.textContent = `${Math.round(state.settings.fontOpacity * 100)}%`;
  controls.lineHeight.value = state.settings.lineHeight;
  valueDisplays.lineHeight.textContent = state.settings.lineHeight.toFixed(1);
  controls.bgColor.value = state.settings.bgColor;
  controls.bgOpacity.value = state.settings.bgOpacity;
  valueDisplays.bgOpacity.textContent = `${Math.round(state.settings.bgOpacity * 100)}%`;
  controls.hoverMode.checked = state.settings.hoverMode;
  controls.visibleLines.value = state.settings.visibleLines || 0;
  document.getElementById('val-visible-lines').textContent =
    state.settings.visibleLines > 0 ? `${state.settings.visibleLines} 行` : '全部';
  controls.hideBg.checked = state.settings.hideBg;
  controls.textOnly.checked = state.settings.textOnly;
  syncAlwaysOnTopUi();

  const toggleBtn = document.getElementById('set-toggle-hotkey');
  const bossBtn = document.getElementById('set-boss-hotkey');
  if (toggleBtn) toggleBtn.textContent = formatHotkey(state.settings.toggleHotkey);
  if (bossBtn) bossBtn.textContent = formatHotkey(state.settings.bossHotkey);
}

export function debounceSave() {
  // When editing a preset, skip auto-save — only persist on explicit "保存"
  if (state.activePreset != null && state.isPresetDirty) return;
  if (state.saveTimeout) clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(() => {
    window.api.saveSettings(state.settings);
  }, 300);
}

// ============ Hotkey Recording ============
function startRecording(el) {
  if (recordingInput) cancelRecording();
  recordingInput = el;
  el.classList.add('recording');
  el.textContent = '请按下快捷键组合...';
  window.api.unregisterShortcuts();
}

function cancelRecording() {
  if (!recordingInput) return;
  recordingInput.classList.remove('recording');
  recordingInput.textContent = formatHotkey(state.settings[recordingInput.dataset.key]);
  recordingInput = null;
  window.api.registerShortcuts();
}

function finishRecording(hotkey) {
  if (!recordingInput) return;
  const settingKey = recordingInput.dataset.key;
  state.settings[settingKey] = hotkey;
  recordingInput.textContent = formatHotkey(hotkey);
  recordingInput.classList.remove('recording');
  recordingInput = null;
  window.api.saveSettings(state.settings);
}

export function handleHotkeyRecording(e) {
  if (!recordingInput) return false;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    cancelRecording();
    return true;
  }

  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return true;
  if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return true;

  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);

  finishRecording(parts.join('+'));
  return true;
}

export function cancelRecordingIfOutside(e) {
  if (recordingInput && !e.target.closest('.hotkey-input')) {
    cancelRecording();
  }
}

// ============ Presets ============
async function saveCurrentAsPreset(name) {
  const preset = { name };
  presetKeys.forEach(key => preset[key] = state.settings[key]);
  const bounds = await window.api.getWindowBounds();
  if (bounds) { preset.windowWidth = bounds.width; preset.windowHeight = bounds.height; }
  if (!state.settings.customPresets) state.settings.customPresets = [];
  state.settings.customPresets.push(preset);
  const newIndex = state.settings.customPresets.length - 1;
  setActivePreset(newIndex);
  window.api.saveSettings(state.settings);
}

function applyPreset(index) {
  const preset = (state.settings.customPresets || [])[index];
  if (!preset) return;
  const oldVisibleLines = state.settings.visibleLines;
  presetKeys.forEach(key => {
    if (preset[key] !== undefined) state.settings[key] = preset[key];
  });

  if (preset.windowWidth && preset.windowHeight) {
    window.api.setWindowSize({ width: preset.windowWidth, height: preset.windowHeight });
    setTimeout(updateWindowSizeDisplay, 200);
  }

  setActivePreset(index);
  convertReadingPosition(oldVisibleLines, () => {
    applySettings();
    syncControlsToSettings();
    if (state.settings.visibleLines > 0 && state.currentFile) {
      updateVisibleLines();
      updateProgress();
    }
    debounceSave();
  });
}

function deletePreset(index) {
  if (!state.settings.customPresets) return;
  const preset = state.settings.customPresets[index];
  if (!preset) return;
  if (!confirm(`确定删除预设「${preset.name}」？删除后不可恢复。`)) return;
  state.settings.customPresets.splice(index, 1);

  if (state.activePreset != null) {
    if (state.activePreset === index) {
      clearActivePreset();
    } else if (state.activePreset > index) {
      state.activePreset--;
      state.settings.activePresetIndex = state.activePreset;
    }
  }

  window.api.saveSettings(state.settings);
  renderCustomPresets();
}

async function updatePreset(index) {
  const preset = (state.settings.customPresets || [])[index];
  if (!preset) return;
  presetKeys.forEach(key => preset[key] = state.settings[key]);
  const bounds = await window.api.getWindowBounds();
  if (bounds) { preset.windowWidth = bounds.width; preset.windowHeight = bounds.height; }
  state.isPresetDirty = false;
  window.api.saveSettings(state.settings);
  renderCustomPresets();
}

function renamePreset(index, newName) {
  const preset = (state.settings.customPresets || [])[index];
  if (!preset) return;
  preset.name = newName;
  window.api.saveSettings(state.settings);
  renderCustomPresets();
}

// ============ Window Size ============
function updateWindowSizeDisplay() {
  const display = document.getElementById('window-size-display');
  if (!display) return;
  window.api.getWindowBounds().then((bounds) => {
    if (bounds) {
      display.textContent = `当前：${bounds.width} × ${bounds.height}`;
    }
  });
}

// ============ Inline Preset Name Editor ============
function appendInlinePresetEditor(container, defaultName, onConfirm) {
  if (container.querySelector('.preset-inline-editor')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'preset-inline-editor';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'preset-name-input';
  input.value = defaultName;
  input.maxLength = 20;
  input.spellcheck = false;

  const confirm = document.createElement('button');
  confirm.className = 'preset-confirm-btn';
  confirm.textContent = '\u2713';
  confirm.title = '确认';

  const cancel = document.createElement('button');
  cancel.className = 'preset-cancel-btn';
  cancel.textContent = '\u2715';
  cancel.title = '取消';

  wrapper.appendChild(input);
  wrapper.appendChild(confirm);
  wrapper.appendChild(cancel);
  container.appendChild(wrapper);

  input.focus();
  input.select();

  function doConfirm() {
    const name = input.value.trim();
    if (!name) { doCancel(); return; }
    wrapper.remove();
    onConfirm(name);
  }

  function doCancel() {
    wrapper.remove();
  }

  confirm.addEventListener('click', doConfirm);
  cancel.addEventListener('click', doCancel);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
    if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
  });
}

export function renderCustomPresets() {
  const container = document.getElementById('custom-presets');
  if (!container) return;
  container.innerHTML = '';

  const list = state.settings.customPresets || [];
  list.forEach((preset, index) => {
    const isActive = state.activePreset === index;
    const isDirty = isActive && state.isPresetDirty;

    const item = document.createElement('div');
    item.className = 'custom-preset-item' + (isActive ? ' active' : '') + (isDirty ? ' dirty' : '');

    // Header row: name + status/actions
    const header = document.createElement('div');
    header.className = 'custom-preset-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'custom-preset-name';
    nameEl.textContent = preset.name;

    // Double-click to rename
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'preset-name-input preset-rename-input';
      input.value = preset.name;
      input.maxLength = 20;
      input.spellcheck = false;

      nameEl.style.display = 'none';
      header.insertBefore(input, nameEl);
      input.focus();
      input.select();

      function finish(save) {
        if (save) {
          const name = input.value.trim();
          if (name && name !== preset.name) {
            renamePreset(index, name);
            return;
          }
        }
        input.remove();
        nameEl.style.display = '';
      }

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
    });

    const actions = document.createElement('div');
    actions.className = 'custom-preset-actions';

    if (isActive) {
      const badge = document.createElement('span');
      badge.className = 'custom-preset-badge' + (isDirty ? ' dirty' : '');
      badge.textContent = isDirty ? '已修改' : '使用中';
      actions.appendChild(badge);
    }

    const del = document.createElement('button');
    del.className = 'custom-preset-delete';
    del.textContent = '\u00d7';
    del.title = '删除';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePreset(index);
    });
    actions.appendChild(del);

    header.appendChild(nameEl);
    header.appendChild(actions);

    // Summary row
    const summary = document.createElement('div');
    summary.className = 'custom-preset-summary';

    const sizeInfo = preset.windowWidth && preset.windowHeight
      ? `${preset.windowWidth}×${preset.windowHeight}` : '';
    const fontInfo = `${preset.fontSize || 14}px`;
    const opacityInfo = `${Math.round((preset.fontOpacity ?? 1) * 100)}%`;
    const tags = [];
    if (preset.hoverMode) tags.push('悬停');
    if (preset.hideBg) tags.push('无背景');
    if (preset.visibleLines > 0) tags.push(`${preset.visibleLines}行`);

    summary.textContent = [fontInfo, opacityInfo, sizeInfo, ...tags].filter(Boolean).join(' · ');

    item.appendChild(header);
    item.appendChild(summary);

    // Click to apply/enter preset
    item.addEventListener('click', (e) => {
      if (e.target.closest('.custom-preset-delete, .preset-rename-input')) return;
      applyPreset(index);
    });

    container.appendChild(item);
  });

  // Show/hide bottom save bar
  const saveBar = document.getElementById('preset-save-bar');
  const hasDirty = state.activePreset != null && state.isPresetDirty;
  saveBar.classList.toggle('hidden', !hasDirty);
}

// ============ Pro Activation ============
export function updateProStatus() {
  const container = document.getElementById('pro-status');
  if (!container) return;
  container.innerHTML = '';

  if (state.isPro) {
    // Activated state
    const maskedKey = maskLicenseKey(state.settings.proLicenseKey || '');
    container.innerHTML = `
      <div class="pro-activated">
        <div class="pro-activated-info">
          <span class="pro-activated-badge">Pro 已激活</span>
          <span class="pro-activated-key">${maskedKey}</span>
        </div>
        <button class="pro-deactivate-btn" id="btn-deactivate-pro">取消激活</button>
      </div>
    `;
    document.getElementById('btn-deactivate-pro').addEventListener('click', async () => {
      await window.api.deactivatePro();
      state.isPro = false;
      state.settings.proLicenseKey = '';
      updateProStatus();
      updateProFeatureUI();
    });
  } else {
    // Not activated state
    container.innerHTML = `
      <div class="pro-activate">
        <p class="pro-desc">解锁正文提取、场景工作区、高级阅读等功能</p>
        <div class="pro-input-row">
          <input type="text" id="pro-license-input" class="pro-license-input"
            placeholder="HIDER-XXXXX-XXXXX-XXXXX-XXXXX" spellcheck="false" autocomplete="off">
          <button class="pro-activate-btn" id="btn-activate-pro">激活</button>
        </div>
        <p class="pro-error hidden" id="pro-error">无效的许可证密钥</p>
      </div>
    `;
    const input = document.getElementById('pro-license-input');
    const btn = document.getElementById('btn-activate-pro');
    const error = document.getElementById('pro-error');

    async function doActivate() {
      const key = input.value.trim();
      if (!key) return;
      error.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = '验证中...';
      const result = await window.api.activatePro(key);
      if (result.success) {
        state.isPro = true;
        state.settings.proLicenseKey = key.toUpperCase().replace(/\s/g, '');
        updateProStatus();
        updateProFeatureUI();
      } else {
        error.textContent = result.error || '无效的许可证密钥';
        error.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = '激活';
      }
    }

    btn.addEventListener('click', doActivate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doActivate(); }
    });
  }
}

function maskLicenseKey(key) {
  if (!key || key.length < 10) return '****';
  // Show first segment, mask the rest: HIDER-ABCDE-*****-*****-*****
  const parts = key.split('-');
  if (parts.length === 5) {
    return `${parts[0]}-${parts[1]}-*****-*****-*****`;
  }
  return '****';
}

export function updateProFeatureUI() {
  // Toggle pro-locked class on pro-feature buttons
  document.querySelectorAll('.pro-feature').forEach(el => {
    el.classList.toggle('pro-locked', !state.isPro);
  });
  // Toggle pro badge visibility
  document.querySelectorAll('.pro-badge').forEach(el => {
    el.classList.toggle('hidden', state.isPro);
  });
}

// ============ Site Rules UI ============
let siteRulesControls = {};

function initSiteRulesUI() {
  siteRulesControls = {
    autoReader: document.getElementById('set-site-auto-reader'),
    overrideText: document.getElementById('set-site-override-text'),
    textColor: document.getElementById('set-site-text-color'),
    overrideBg: document.getElementById('set-site-override-bg'),
    bgColor: document.getElementById('set-site-bg-color'),
    hideImages: document.getElementById('set-site-hide-images'),
    contentSelector: document.getElementById('set-site-content-selector'),
    removeSelectors: document.getElementById('set-site-remove-selectors'),
    domainBadge: document.getElementById('site-domain'),
  };

  // Hint: click to enable reader mode
  document.getElementById('btn-enable-reader').addEventListener('click', () => {
    if (!state.readerModeEnabled && state.currentMode === 'web') {
      toggleReaderMode();
      updateSiteRulesHint();
    }
  });

  // Help button
  document.getElementById('btn-open-help').addEventListener('click', () => {
    window.api.openHelp();
  });

  // Advanced toggle
  document.getElementById('btn-toggle-advanced').addEventListener('click', () => {
    const body = document.getElementById('site-rules-advanced');
    body.classList.toggle('hidden');
  });

  // Save site rule
  document.getElementById('btn-save-site-rule').addEventListener('click', () => {
    saveSiteRule();
  });

  // Reset site rule
  document.getElementById('btn-reset-site-rule').addEventListener('click', () => {
    resetSiteRule();
  });

  // Auto-reader toggle: immediately enable/disable reader mode
  siteRulesControls.autoReader.addEventListener('change', () => {
    if (state.currentMode !== 'web') return;
    if (!state.isPro) return;
    // If toggling ON and reader mode is off, enable it now
    if (siteRulesControls.autoReader.checked && !state.readerModeEnabled) {
      toggleReaderMode();
    }
    // If toggling OFF and reader mode is on, disable it
    if (!siteRulesControls.autoReader.checked && state.readerModeEnabled) {
      toggleReaderMode();
    }
    updateSiteRulesHint();
  });

  // Live preview: when toggles/colors change, apply immediately (don't persist yet)
  siteRulesControls.overrideText.addEventListener('change', () => liveApplySiteRule());
  siteRulesControls.textColor.addEventListener('input', () => liveApplySiteRule());
  siteRulesControls.overrideBg.addEventListener('change', () => liveApplySiteRule());
  siteRulesControls.bgColor.addEventListener('input', () => liveApplySiteRule());
  siteRulesControls.hideImages.addEventListener('change', () => liveApplySiteRule());

  // Register navigation callback
  state.onSiteNavigated = () => updateSiteRulesUI();
}

export function updateSiteRulesUI() {
  const hostname = getCurrentHostname();
  siteRulesControls.domainBadge.textContent = hostname || '—';

  if (!hostname) return;

  const rule = getSiteRule(hostname);
  const userRule = (state.settings.siteRules || {})[hostname] || {};
  const builtin = isBuiltinSite(hostname);

  // Populate controls with current rule values
  siteRulesControls.autoReader.checked = !!(rule?.autoReaderMode);
  siteRulesControls.overrideText.checked = rule?.overrideTextColor !== false;
  siteRulesControls.textColor.value = rule?.fontColor || state.settings.fontColor;
  siteRulesControls.overrideBg.checked = rule?.overrideBgColor !== false;
  siteRulesControls.bgColor.value = rule?.bgColor || state.settings.bgColor;
  siteRulesControls.hideImages.checked = !!(rule?.hideImages);

  // Advanced: show user overrides, or built-in defaults
  siteRulesControls.contentSelector.value = userRule.contentSelector || '';
  siteRulesControls.contentSelector.placeholder = rule?.contentSelector || '自动检测';
  siteRulesControls.removeSelectors.value = userRule.removeSelectors || '';
  siteRulesControls.removeSelectors.placeholder = builtin ? '已有内置规则' : '额外 CSS 选择器';

  // Show built-in indicator
  siteRulesControls.domainBadge.classList.toggle('has-builtin', builtin);

  updateSiteRulesHint();
}

function updateSiteRulesHint() {
  const hint = document.getElementById('site-rules-hint');
  if (!hint) return;
  const showHint = state.currentMode === 'web' && !state.readerModeEnabled;
  hint.classList.toggle('hidden', !showHint);
}

function liveApplySiteRule() {
  if (!state.readerModeEnabled || state.currentMode !== 'web') return;
  if (!state.isPro) return;

  // Build a temporary rule from current UI values and apply
  const hostname = getCurrentHostname();
  if (!hostname) return;

  // Temporarily patch the user rule for live preview
  if (!state.settings.siteRules) state.settings.siteRules = {};
  const existing = state.settings.siteRules[hostname] || {};
  state.settings.siteRules[hostname] = {
    ...existing,
    overrideTextColor: siteRulesControls.overrideText.checked,
    fontColor: siteRulesControls.textColor.value,
    overrideBgColor: siteRulesControls.overrideBg.checked,
    bgColor: siteRulesControls.bgColor.value,
    hideImages: siteRulesControls.hideImages.checked,
  };

  applyReaderMode();
}

function saveSiteRule() {
  const hostname = getCurrentHostname();
  if (!hostname) return;
  if (!state.isPro) return;

  if (!state.settings.siteRules) state.settings.siteRules = {};

  const rule = {
    autoReaderMode: siteRulesControls.autoReader.checked,
    overrideTextColor: siteRulesControls.overrideText.checked,
    fontColor: siteRulesControls.textColor.value,
    overrideBgColor: siteRulesControls.overrideBg.checked,
    bgColor: siteRulesControls.bgColor.value,
    hideImages: siteRulesControls.hideImages.checked,
  };

  // Advanced selectors (only save if user explicitly provided)
  const contentSel = siteRulesControls.contentSelector.value.trim();
  if (contentSel) rule.contentSelector = contentSel;

  const removeSel = siteRulesControls.removeSelectors.value.trim();
  if (removeSel) rule.removeSelectors = removeSel;

  state.settings.siteRules[hostname] = rule;
  window.api.saveSettings(state.settings);

  // Re-apply reader mode with saved rule
  if (state.readerModeEnabled && state.currentMode === 'web') {
    applyReaderMode();
  }

  showSiteRuleToast('站点设置已保存');
}

function resetSiteRule() {
  const hostname = getCurrentHostname();
  if (!hostname) return;

  if (state.settings.siteRules && state.settings.siteRules[hostname]) {
    delete state.settings.siteRules[hostname];
    window.api.saveSettings(state.settings);
  }

  updateSiteRulesUI();

  if (state.readerModeEnabled && state.currentMode === 'web') {
    applyReaderMode();
  }

  showSiteRuleToast('已恢复默认设置');
}

function showSiteRuleToast(message) {
  const existing = document.querySelector('.site-rule-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'site-rule-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}
