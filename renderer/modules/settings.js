// Settings panel, presets, hotkeys, applySettings
import { state, dom, hexToRgb, isColorDark, formatHotkey } from './state.js';
import { updateVisibleLines, updateProgress, convertReadingPosition, applyReaderMode, toggleReaderMode, getSiteRule, getCurrentHostname, isBuiltinSite, isLineLimitedMode, isImmersiveFileMode, switchMode, getCurrentReadingLineIndex, scrollReaderToLineIndex, setLineLimitedPosition, scheduleImmersiveLayoutRefresh, syncImmersiveMouseRegionFromEvent, captureReaderScrollAnchor, restoreReaderScrollAnchor } from './content.js';
import { syncHoverMode } from './hover.js';

let controls = {};
let valueDisplays = {};
let recordingInput = null;
let updateUiState = {
  latestInfo: null,
  installerPath: '',
  checking: false,
  downloading: false,
};
let updateAutoCheckScheduled = false;

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

const presetKeys = ['fontSize', 'fontColor', 'fontOpacity', 'lineHeight', 'bgColor', 'bgOpacity', 'hoverMode', 'visibleLines', 'autoHideOnLeave', 'hideBg', 'textOnly', 'immersiveMode', 'immersiveLines', 'immersiveFontSize', 'immersiveFontColor', 'immersiveFontOpacity', 'immersiveLineHeight'];
const maxRecentTextColors = 8;
let shortcutRegistrationStatus = { ok: true, registered: [], failed: [] };

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

function normalizeHexColor(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim();
  const shortMatch = value.match(/^#([0-9a-fA-F]{3})$/);
  if (shortMatch) {
    return `#${shortMatch[1].split('').map(ch => ch + ch).join('')}`.toLowerCase();
  }
  const longMatch = value.match(/^#([0-9a-fA-F]{6})$/);
  return longMatch ? `#${longMatch[1].toLowerCase()}` : null;
}

function getRecentTextColors() {
  const colors = Array.isArray(state.settings.recentTextColors) ? state.settings.recentTextColors : [];
  const normalized = [];
  colors.forEach((color) => {
    const value = normalizeHexColor(color);
    if (value && !normalized.includes(value)) {
      normalized.push(value);
    }
  });
  return normalized.slice(0, maxRecentTextColors);
}

function rememberRecentTextColor(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;
  const colors = getRecentTextColors().filter(item => item !== normalized);
  state.settings.recentTextColors = [normalized, ...colors].slice(0, maxRecentTextColors);
  renderRecentTextColors();
}

function renderRecentTextColorRow(container, colors, activeColor, onSelect) {
  if (!container) return;
  container.replaceChildren();
  const active = normalizeHexColor(activeColor);

  colors.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recent-color-swatch';
    btn.style.backgroundColor = color;
    btn.title = `使用最近颜色 ${color}`;
    btn.setAttribute('aria-label', `使用最近颜色 ${color}`);
    btn.classList.toggle('active', color === active);
    btn.addEventListener('click', () => onSelect(color));
    container.appendChild(btn);
  });
}

function renderRecentTextColors() {
  const colors = getRecentTextColors();
  state.settings.recentTextColors = colors;

  renderRecentTextColorRow(
    document.getElementById('recent-font-colors'),
    colors,
    state.settings.fontColor,
    (color) => updateTextColor('fontColor', controls.fontColor, color, { remember: true })
  );

  renderRecentTextColorRow(
    document.getElementById('recent-immersive-font-colors'),
    colors,
    state.settings.immersiveFontColor || state.settings.fontColor,
    (color) => updateTextColor('immersiveFontColor', controls.immersiveFontColor, color, { remember: true })
  );
}

function updateTextColor(settingKey, control, color, { remember = false } = {}) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;
  state.settings[settingKey] = normalized;
  if (control) {
    control.value = normalized;
  }
  if (remember) {
    rememberRecentTextColor(normalized);
  } else {
    renderRecentTextColors();
  }
  markPresetDirty();
  applySettings();
  debounceSave();
}

export function applyShortcutRegistrationStatus(status = { ok: true, registered: [], failed: [] }) {
  shortcutRegistrationStatus = {
    ok: !!status.ok,
    registered: Array.isArray(status.registered) ? status.registered : [],
    failed: Array.isArray(status.failed) ? status.failed : [],
  };

  document.querySelectorAll('.hotkey-input').forEach((el) => {
    el.classList.remove('conflict');
    el.removeAttribute('title');
  });

  const warning = document.getElementById('hotkey-warning');
  if (!warning) return;

  if (shortcutRegistrationStatus.failed.length === 0) {
    warning.classList.add('hidden');
    warning.textContent = '';
    return;
  }

  const messages = shortcutRegistrationStatus.failed.map((item) => {
    const input = document.querySelector(`.hotkey-input[data-key="${item.settingKey}"]`);
    const label = item.label || input?.closest('.setting-row')?.querySelector('label')?.textContent || '快捷键';
    const accelerator = formatHotkey(item.accelerator);
    const reason = item.reason || '注册失败';
    if (input) {
      input.classList.add('conflict');
      input.title = `${label}：${accelerator} ${reason}`;
    }
    return `${label} ${accelerator}：${reason}`;
  });

  warning.textContent = `以下快捷键未生效：${messages.join('；')}。请更换组合键后重试。`;
  warning.classList.remove('hidden');
}

function getUpdateEls() {
  return {
    version: document.getElementById('app-version'),
    status: document.getElementById('update-status'),
    release: document.getElementById('update-release'),
    releaseTitle: document.getElementById('update-release-title'),
    releaseNotes: document.getElementById('update-release-notes'),
    progress: document.getElementById('update-progress'),
    progressFill: document.getElementById('update-progress-fill'),
    progressText: document.getElementById('update-progress-text'),
    checkBtn: document.getElementById('btn-check-update'),
    downloadBtn: document.getElementById('btn-download-update'),
    openBtn: document.getElementById('btn-open-update-installer'),
  };
}

function setUpdateStatus(message, tone = '') {
  const { status } = getUpdateEls();
  if (!status) return;
  status.textContent = message;
  status.classList.remove('ok', 'warn', 'error');
  if (tone) status.classList.add(tone);
}

function setUpdateBusy({ checking = false, downloading = false } = {}) {
  updateUiState.checking = checking;
  updateUiState.downloading = downloading;
  const { checkBtn, downloadBtn, openBtn } = getUpdateEls();
  if (checkBtn) {
    checkBtn.disabled = checking || downloading;
    checkBtn.textContent = checking ? '检查中...' : '检查更新';
  }
  if (downloadBtn) {
    downloadBtn.disabled = checking || downloading;
    if (downloading) downloadBtn.textContent = '下载中...';
    else downloadBtn.textContent = '下载新版';
  }
  if (openBtn) openBtn.disabled = checking || downloading;
}

function renderUpdateProgress(payload = {}) {
  const { progress, progressFill, progressText } = getUpdateEls();
  if (!progress || !progressFill || !progressText) return;
  if (payload.status === 'downloading' || payload.status === 'ready') {
    progress.classList.remove('hidden');
  }
  const percent = Math.max(0, Math.min(100, Math.round(Number(payload.progress || 0))));
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

function renderReleaseInfo(info) {
  const { release, releaseTitle, releaseNotes, downloadBtn, openBtn } = getUpdateEls();
  const releaseData = info?.release || {};
  const notes = Array.isArray(releaseData.notes) ? releaseData.notes.filter(Boolean) : [];

  if (release && releaseTitle && releaseNotes && info?.updateAvailable) {
    release.classList.remove('hidden');
    releaseTitle.textContent = releaseData.name || `Hider v${info.latestVersion}`;
    releaseNotes.replaceChildren();
    const list = document.createElement('ul');
    (notes.length ? notes.slice(0, 5) : ['发现新版本，建议更新。']).forEach((note) => {
      const item = document.createElement('li');
      item.textContent = note;
      list.appendChild(item);
    });
    releaseNotes.appendChild(list);
  } else if (release) {
    release.classList.add('hidden');
  }

  if (downloadBtn) {
    downloadBtn.classList.toggle('hidden', !info?.updateAvailable || !releaseData.downloadUrl || !!updateUiState.installerPath);
  }
  if (openBtn) {
    openBtn.classList.toggle('hidden', !updateUiState.installerPath);
  }
}

async function refreshAppInfo() {
  try {
    const info = await window.api.getAppInfo();
    const { version } = getUpdateEls();
    if (version) version.textContent = `v${info.version || '—'}`;
  } catch (_) {
    const { version } = getUpdateEls();
    if (version) version.textContent = 'v—';
  }
}

async function checkForUpdates({ manual = false } = {}) {
  if (updateUiState.checking || updateUiState.downloading) return;
  setUpdateBusy({ checking: true });
  if (manual) setUpdateStatus('正在检查更新...');
  try {
    const info = await window.api.checkForUpdates();
    updateUiState.latestInfo = info;
    updateUiState.installerPath = '';
    if (!info.ok) {
      setUpdateStatus(info.error || '更新检测失败', info.error ? 'error' : 'warn');
    } else if (info.updateAvailable) {
      const assetName = info.release?.asset?.name ? ` · ${info.release.asset.name}` : '';
      setUpdateStatus(`发现新版本 v${info.latestVersion}${assetName}`, 'ok');
    } else {
      setUpdateStatus(`当前已是最新版本 v${info.currentVersion}`, 'ok');
    }
    renderReleaseInfo(info);
  } catch (e) {
    setUpdateStatus(e.message || '更新检测失败', 'error');
  } finally {
    setUpdateBusy({ checking: false });
  }
}

async function downloadLatestUpdate() {
  if (updateUiState.downloading) return;
  setUpdateBusy({ downloading: true });
  setUpdateStatus('正在下载新版安装包...');
  renderUpdateProgress({ status: 'downloading', progress: 0 });
  try {
    const result = await window.api.downloadUpdate();
    if (!result || result.ok === false) {
      throw new Error(result?.error || '更新下载失败');
    }
    updateUiState.installerPath = result.filePath || '';
    setUpdateStatus(result.cached ? '已复用本地安装包，准备打开安装。' : '安装包已下载，准备打开安装。', 'ok');
    renderUpdateProgress({ status: 'ready', progress: 100 });
    renderReleaseInfo(updateUiState.latestInfo || result.update);
  } catch (e) {
    setUpdateStatus(e.message || '更新下载失败', 'error');
  } finally {
    setUpdateBusy({ downloading: false });
  }
}

async function openDownloadedInstaller() {
  if (!updateUiState.installerPath) return;
  const result = await window.api.openUpdateInstaller(updateUiState.installerPath);
  if (!result || result.ok === false) {
    setUpdateStatus(result?.error || '无法打开安装包', 'error');
    return;
  }
  setUpdateStatus('安装包已打开，请按系统提示完成安装。', 'ok');
}

function initUpdateUi() {
  refreshAppInfo();
  if (controls.updateAutoCheck) {
    controls.updateAutoCheck.checked = state.settings.updateAutoCheck !== false;
    controls.updateAutoCheck.addEventListener('change', (e) => {
      state.settings.updateAutoCheck = e.target.checked;
      window.api.saveSettings(state.settings);
    });
  }

  const { checkBtn, downloadBtn, openBtn } = getUpdateEls();
  if (checkBtn) checkBtn.addEventListener('click', () => checkForUpdates({ manual: true }));
  if (downloadBtn) downloadBtn.addEventListener('click', downloadLatestUpdate);
  if (openBtn) openBtn.addEventListener('click', openDownloadedInstaller);

  if (window.api.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((payload) => {
      renderUpdateProgress(payload);
      if (payload.status === 'downloading') {
        const percent = Math.round(Number(payload.progress || 0));
        setUpdateStatus(`正在下载新版安装包 ${percent}%`);
      } else if (payload.status === 'ready') {
        updateUiState.installerPath = payload.filePath || updateUiState.installerPath;
        setUpdateStatus(payload.cached ? '已复用本地安装包，准备打开安装。' : '安装包已下载，准备打开安装。', 'ok');
        renderReleaseInfo(updateUiState.latestInfo);
      } else if (payload.status === 'error') {
        setUpdateStatus(payload.error || '更新下载失败', 'error');
      }
    });
  }

}

function scheduleAutoUpdateCheck() {
  if (updateAutoCheckScheduled || state.settings.updateAutoCheck === false) return;
  updateAutoCheckScheduled = true;
  if (getUpdateEls().status?.textContent === '尚未检查更新') {
    setTimeout(() => checkForUpdates({ manual: false }), 1800);
  }
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

function syncImmersiveUi() {
  const immersiveFontSize = state.settings.immersiveFontSize || state.settings.fontSize || 16;
  const immersiveFontColor = state.settings.immersiveFontColor || state.settings.fontColor || '#333333';
  const immersiveFontOpacity = state.settings.immersiveFontOpacity ?? state.settings.fontOpacity ?? 1;
  const immersiveLineHeight = state.settings.immersiveLineHeight || state.settings.lineHeight || 1.8;

  if (controls.immersiveMode) {
    controls.immersiveMode.checked = !!state.settings.immersiveMode;
  }
  if (controls.rememberImmersiveMode) {
    controls.rememberImmersiveMode.checked = !!state.settings.rememberImmersiveMode;
  }
  if (controls.immersiveLines) {
    controls.immersiveLines.value = state.settings.immersiveLines || 1;
  }
  if (controls.immersiveFontSize) {
    controls.immersiveFontSize.value = immersiveFontSize;
  }
  if (controls.immersiveFontColor) {
    controls.immersiveFontColor.value = immersiveFontColor;
  }
  if (controls.immersiveFontOpacity) {
    controls.immersiveFontOpacity.value = immersiveFontOpacity;
  }
  if (controls.immersiveLineHeight) {
    controls.immersiveLineHeight.value = immersiveLineHeight;
  }
  const display = document.getElementById('val-immersive-lines');
  if (display) {
    display.textContent = `${state.settings.immersiveLines || 1} 行`;
  }
  if (valueDisplays.immersiveFontSize) {
    valueDisplays.immersiveFontSize.textContent = `${immersiveFontSize}px`;
  }
  if (valueDisplays.immersiveFontOpacity) {
    valueDisplays.immersiveFontOpacity.textContent = `${Math.round(immersiveFontOpacity * 100)}%`;
  }
  if (valueDisplays.immersiveLineHeight) {
    valueDisplays.immersiveLineHeight.textContent = Number(immersiveLineHeight).toFixed(1);
  }
  if (dom.btnImmersive) {
    dom.btnImmersive.classList.toggle('active', !!state.settings.immersiveMode);
    dom.btnImmersive.setAttribute('aria-pressed', state.settings.immersiveMode ? 'true' : 'false');
    dom.btnImmersive.title = state.settings.immersiveMode ? '退出沉浸模式' : '沉浸模式';
  }
}

export function setImmersiveMode(enabled, { persist = true } = {}) {
  const nextEnabled = !!enabled;
  const preserveAnchor = state.currentMode === 'file' && state.currentFile
    ? captureReaderScrollAnchor()
    : null;
  const preserveLineIndex = !preserveAnchor && state.currentMode === 'file' && state.currentFile
    ? getCurrentReadingLineIndex()
    : null;

  state.settings.immersiveMode = nextEnabled;

  if (state.settings.immersiveMode && state.currentMode !== 'file') {
    switchMode('file');
  }

  if (!state.settings.immersiveMode) {
    dom.app.classList.remove('immersive-empty');
  }

  syncImmersiveUi();
  applySettings();

  if (preserveAnchor) {
    restoreReaderScrollAnchor(preserveAnchor);
  } else if (preserveLineIndex != null) {
    if (state.settings.immersiveMode || !isLineLimitedMode()) {
      scrollReaderToLineIndex(preserveLineIndex);
    } else {
      setLineLimitedPosition(preserveLineIndex);
    }
  }

  if (persist) {
    window.api.saveSettings(state.settings);
  }

  return state.settings.immersiveMode;
}

export function toggleImmersiveMode() {
  return setImmersiveMode(!state.settings.immersiveMode);
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
    immersiveMode: document.getElementById('set-immersive-mode'),
    rememberImmersiveMode: document.getElementById('set-remember-immersive-mode'),
    immersiveLines: document.getElementById('set-immersive-lines'),
    immersiveFontSize: document.getElementById('set-immersive-font-size'),
    immersiveFontColor: document.getElementById('set-immersive-font-color'),
    immersiveFontOpacity: document.getElementById('set-immersive-font-opacity'),
    immersiveLineHeight: document.getElementById('set-immersive-line-height'),
    alwaysOnTop: document.getElementById('set-always-on-top'),
    hideAppIcon: document.getElementById('set-hide-app-icon'),
    updateAutoCheck: document.getElementById('set-update-auto-check'),
  };

  valueDisplays = {
    fontSize: document.getElementById('val-font-size'),
    fontOpacity: document.getElementById('val-font-opacity'),
    lineHeight: document.getElementById('val-line-height'),
    bgOpacity: document.getElementById('val-bg-opacity'),
    immersiveLines: document.getElementById('val-immersive-lines'),
    immersiveFontSize: document.getElementById('val-immersive-font-size'),
    immersiveFontOpacity: document.getElementById('val-immersive-font-opacity'),
    immersiveLineHeight: document.getElementById('val-immersive-line-height'),
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
    updateTextColor('fontColor', controls.fontColor, e.target.value);
  });

  controls.fontColor.addEventListener('change', (e) => {
    rememberRecentTextColor(e.target.value);
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
      if (isLineLimitedMode() && state.currentFile) {
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

  controls.immersiveMode.addEventListener('change', (e) => {
    markPresetDirty();
    setImmersiveMode(e.target.checked);
  });

  if (controls.rememberImmersiveMode) {
    controls.rememberImmersiveMode.addEventListener('change', (e) => {
      state.settings.rememberImmersiveMode = e.target.checked;
      window.api.saveSettings(state.settings);
    });
  }

  controls.immersiveLines.addEventListener('input', (e) => {
    state.settings.immersiveLines = parseInt(e.target.value);
    valueDisplays.immersiveLines.textContent = `${state.settings.immersiveLines} 行`;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.immersiveFontSize.addEventListener('input', (e) => {
    state.settings.immersiveFontSize = parseInt(e.target.value);
    valueDisplays.immersiveFontSize.textContent = `${state.settings.immersiveFontSize}px`;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.immersiveFontColor.addEventListener('input', (e) => {
    updateTextColor('immersiveFontColor', controls.immersiveFontColor, e.target.value);
  });

  controls.immersiveFontColor.addEventListener('change', (e) => {
    rememberRecentTextColor(e.target.value);
    debounceSave();
  });

  controls.immersiveFontOpacity.addEventListener('input', (e) => {
    state.settings.immersiveFontOpacity = parseFloat(e.target.value);
    valueDisplays.immersiveFontOpacity.textContent = `${Math.round(state.settings.immersiveFontOpacity * 100)}%`;
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.immersiveLineHeight.addEventListener('input', (e) => {
    state.settings.immersiveLineHeight = parseFloat(e.target.value);
    valueDisplays.immersiveLineHeight.textContent = state.settings.immersiveLineHeight.toFixed(1);
    markPresetDirty();
    applySettings();
    debounceSave();
  });

  controls.alwaysOnTop.addEventListener('change', (e) => {
    setAlwaysOnTop(e.target.checked);
  });

  if (controls.hideAppIcon) {
    controls.hideAppIcon.addEventListener('change', (e) => {
      state.settings.hideAppIcon = e.target.checked;
      window.api.saveSettings(state.settings);
    });
  }

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
    state.settings.settingsHotkey = 'CommandOrControl+Shift+S';
    state.settings.immersiveHotkey = 'CommandOrControl+Shift+F';
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
  initUpdateUi();
}

// ============ Apply Settings ============
export function applySettings() {
  const root = document.documentElement;
  const immersiveLines = Math.max(1, Math.min(8, state.settings.immersiveLines || 1));
  const immersiveFontSize = state.settings.immersiveFontSize || state.settings.fontSize || 16;
  const immersiveFontColor = state.settings.immersiveFontColor || state.settings.fontColor || '#333333';
  const immersiveFontOpacity = state.settings.immersiveFontOpacity ?? state.settings.fontOpacity ?? 1;
  const immersiveLineHeight = state.settings.immersiveLineHeight || state.settings.lineHeight || 1.8;
  const computedLineHeight = Math.ceil(immersiveFontSize * immersiveLineHeight);
  root.style.setProperty('--font-size', `${state.settings.fontSize}px`);
  root.style.setProperty('--font-color', state.settings.fontColor);
  root.style.setProperty('--font-opacity', state.settings.fontOpacity);
  root.style.setProperty('--line-height', state.settings.lineHeight);
  root.style.setProperty('--bg-color', state.settings.bgColor);
  root.style.setProperty('--bg-opacity', state.settings.bgOpacity);
  root.style.setProperty('--immersive-lines', immersiveLines);
  root.style.setProperty('--immersive-font-size', `${immersiveFontSize}px`);
  root.style.setProperty('--immersive-font-color', immersiveFontColor);
  root.style.setProperty('--immersive-font-opacity', immersiveFontOpacity);
  root.style.setProperty('--immersive-line-height', immersiveLineHeight);
  root.style.setProperty('--immersive-line-height-px', `${computedLineHeight}px`);
  const immersiveHeight = Math.ceil(computedLineHeight * immersiveLines);
  root.style.setProperty('--immersive-padding-y', '0px');
  root.style.setProperty('--immersive-height', `${immersiveHeight}px`);

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
  dom.app.classList.toggle('immersive-mode', isImmersiveFileMode());
  dom.app.classList.toggle('immersive-empty', isImmersiveFileMode() && !state.currentFile);
  if (isImmersiveFileMode()) {
    scheduleImmersiveLayoutRefresh({ snap: true });
  } else {
    syncImmersiveMouseRegionFromEvent();
  }
  syncImmersiveUi();

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
    if (isImmersiveFileMode()) {
      dom.singleLineOverlay.classList.add('hidden');
      dom.readerContent.style.display = '';
    } else if (state.currentFile && isLineLimitedMode()) {
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
  if (controls.rememberImmersiveMode) {
    controls.rememberImmersiveMode.checked = !!state.settings.rememberImmersiveMode;
  }
  if (controls.updateAutoCheck) {
    controls.updateAutoCheck.checked = state.settings.updateAutoCheck !== false;
  }
  if (controls.hideAppIcon) {
    controls.hideAppIcon.checked = !!state.settings.hideAppIcon;
  }
  state.settings.immersiveFontSize = state.settings.immersiveFontSize || state.settings.fontSize || 16;
  state.settings.immersiveFontColor = state.settings.immersiveFontColor || state.settings.fontColor || '#333333';
  state.settings.immersiveFontOpacity = state.settings.immersiveFontOpacity ?? state.settings.fontOpacity ?? 1;
  state.settings.immersiveLineHeight = state.settings.immersiveLineHeight || state.settings.lineHeight || 1.8;
  state.settings.recentTextColors = getRecentTextColors();
  renderRecentTextColors();
  syncImmersiveUi();
  syncAlwaysOnTopUi();

  const toggleBtn = document.getElementById('set-toggle-hotkey');
  const settingsBtn = document.getElementById('set-settings-hotkey');
  const immersiveBtn = document.getElementById('set-immersive-hotkey');
  const helpToggleHotkey = document.getElementById('help-toggle-hotkey');
  const helpImmersiveHotkey = document.getElementById('help-immersive-hotkey');
  if (toggleBtn) toggleBtn.textContent = formatHotkey(state.settings.toggleHotkey);
  if (settingsBtn) settingsBtn.textContent = formatHotkey(state.settings.settingsHotkey);
  if (immersiveBtn) immersiveBtn.textContent = formatHotkey(state.settings.immersiveHotkey);
  if (helpToggleHotkey) helpToggleHotkey.textContent = formatHotkey(state.settings.toggleHotkey);
  if (helpImmersiveHotkey) helpImmersiveHotkey.textContent = formatHotkey(state.settings.immersiveHotkey);
  applyShortcutRegistrationStatus(shortcutRegistrationStatus);
  scheduleAutoUpdateCheck();
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
  applyShortcutRegistrationStatus({ ok: true, registered: [], failed: [] });
  window.api.unregisterShortcuts();
}

function cancelRecording() {
  if (!recordingInput) return;
  recordingInput.classList.remove('recording');
  recordingInput.textContent = formatHotkey(state.settings[recordingInput.dataset.key]);
  recordingInput = null;
  window.api.registerShortcuts()
    .then(applyShortcutRegistrationStatus)
    .catch(() => {});
}

function finishRecording(hotkey) {
  if (!recordingInput) return;
  const settingKey = recordingInput.dataset.key;
  state.settings[settingKey] = hotkey;
  recordingInput.textContent = formatHotkey(hotkey);
  recordingInput.classList.remove('recording');
  recordingInput = null;
  syncControlsToSettings();
  window.api.saveSettings(state.settings)
    .then((result) => {
      if (result?.shortcutStatus) {
        applyShortcutRegistrationStatus(result.shortcutStatus);
      }
    })
    .catch(() => {});
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
function saveCurrentAsPreset(name) {
  const preset = { name };
  presetKeys.forEach(key => preset[key] = state.settings[key]);
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

function updatePreset(index) {
  const preset = (state.settings.customPresets || [])[index];
  if (!preset) return;
  presetKeys.forEach(key => preset[key] = state.settings[key]);
  delete preset.windowWidth;
  delete preset.windowHeight;
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

    const fontInfo = `${preset.fontSize || 14}px`;
    const opacityInfo = `${Math.round((preset.fontOpacity ?? 1) * 100)}%`;
    const tags = [];
    if (preset.hoverMode) tags.push('悬停');
    if (preset.immersiveMode) tags.push(`沉浸${preset.immersiveLines || 1}行`);
    if (preset.hideBg) tags.push('无背景');
    if (preset.visibleLines > 0) tags.push(`${preset.visibleLines}行`);

    summary.textContent = [fontInfo, opacityInfo, ...tags].filter(Boolean).join(' · ');

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
