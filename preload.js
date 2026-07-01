const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('open-file'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  openUpdateInstaller: (filePath) => ipcRenderer.invoke('open-update-installer', filePath),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  saveProgress: (data) => ipcRenderer.invoke('save-progress', data),
  saveProgressSync: (data) => ipcRenderer.sendSync('save-progress-sync', data),
  toggleVisibility: () => ipcRenderer.invoke('toggle-visibility'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
  setHideTaskbarIcon: (enabled) => ipcRenderer.invoke('set-hide-taskbar-icon', enabled),
  setTextInputActive: (active) => ipcRenderer.invoke('set-text-input-active', active),
  searchResources: (query) => ipcRenderer.invoke('search-resources', query),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  setWindowSize: (size) => ipcRenderer.invoke('set-window-size', size),
  updateHoverWindow: (state) => ipcRenderer.invoke('update-hover-window', state),
  isMouseInWindow: () => ipcRenderer.invoke('is-mouse-in-window'),
  startDrag: () => ipcRenderer.invoke('start-drag'),
  moveWindow: (offset) => ipcRenderer.invoke('move-window', offset),
  loadFilePath: (filePath) => ipcRenderer.invoke('load-file-path', filePath),
  unregisterShortcuts: () => ipcRenderer.invoke('unregister-shortcuts'),
  registerShortcuts: () => ipcRenderer.invoke('register-shortcuts'),
  loadBookmarks: () => ipcRenderer.invoke('load-bookmarks'),
  saveBookmarks: (data) => ipcRenderer.invoke('save-bookmarks', data),
  loadRecentFiles: () => ipcRenderer.invoke('load-recent-files'),
  removeRecentFile: (filePath) => ipcRenderer.invoke('remove-recent-file', filePath),
  loadSearchHistory: () => ipcRenderer.invoke('load-search-history'),
  addSearchHistoryQuery: (query) => ipcRenderer.invoke('add-search-history-query', query),
  removeSearchHistoryQuery: (query) => ipcRenderer.invoke('remove-search-history-query', query),
  clearSearchHistory: () => ipcRenderer.invoke('clear-search-history'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  activatePro: (key) => ipcRenderer.invoke('activate-pro', key),
  deactivatePro: () => ipcRenderer.invoke('deactivate-pro'),
  getProStatus: () => ipcRenderer.invoke('get-pro-status'),
  openHelp: () => ipcRenderer.invoke('open-help'),
  platform: process.platform,

  onFileLoaded: (callback) => {
    ipcRenderer.on('file-loaded', (event, data) => callback(data));
  },
  onSettingsLoaded: (callback) => {
    ipcRenderer.on('settings-loaded', (event, data) => callback(data));
  },
  onHoverStateChanged: (callback) => {
    ipcRenderer.on('hover-state-changed', (event, data) => callback(data));
  },
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (event, enabled) => callback(enabled));
  },
  onHideTaskbarIconChanged: (callback) => {
    ipcRenderer.on('hide-taskbar-icon-changed', (event, enabled) => callback(enabled));
  },
  onToggleSettings: (callback) => {
    ipcRenderer.on('toggle-settings', () => callback());
  },
  onToggleImmersiveMode: (callback) => {
    ipcRenderer.on('toggle-immersive-mode', () => callback());
  },
  onShortcutRegistrationResult: (callback) => {
    ipcRenderer.on('shortcuts-registration-result', (event, data) => callback(data));
  },
  onUpdateDownloadProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
});
