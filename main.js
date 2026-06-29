const { app, BrowserWindow, globalShortcut, ipcMain, dialog, Tray, Menu, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fileURLToPath } = require('url');
const AdmZip = require('adm-zip');
const packageJson = require('./package.json');

let mainWindow = null;
let tray = null;
let isVisible = true;
let settingsPath;
let progressPath;
let bookmarksPath;
let recentFilesPath;
let updateDownloadDir;
let hoverWindowState = {
  hoverMode: false,
  forceInteractive: false,
  interactive: true,
};
let hoverPollTimer = null;
let shortcutRegistrationStatus = {
  ok: true,
  registered: [],
  failed: [],
};

let settings = {
  fontSize: 16,
  fontColor: '#333333',
  recentTextColors: [],
  fontOpacity: 1.0,
  bgColor: '#ffffff',
  bgOpacity: 0.95,
  lineHeight: 1.8,
  hoverMode: false,
  alwaysOnTop: false,
  visibleLines: 0,
  autoHideOnLeave: false,
  hideBg: false,
  textOnly: false,
  immersiveMode: false,
  immersiveLines: 3,
  immersiveFontSize: 16,
  immersiveFontColor: '#333333',
  immersiveFontOpacity: 1.0,
  immersiveLineHeight: 1.8,
  toggleHotkey: 'CommandOrControl+Shift+H',
  bossHotkey: 'CommandOrControl+Shift+X',
  settingsHotkey: 'CommandOrControl+Shift+S',
  immersiveHotkey: 'CommandOrControl+Shift+F',
  updateAutoCheck: true,
  proLicenseKey: '',
  siteRules: {},
};

// ============ Pro License Validation ============
const LICENSE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LICENSE_SALT = 'HiderPro2026';

function computeLicenseChecksum(payload) {
  let hash = 5381;
  const str = LICENSE_SALT + payload;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
  }
  hash = hash >>> 0;
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += LICENSE_CHARS[hash % LICENSE_CHARS.length];
    hash = Math.floor(hash / LICENSE_CHARS.length);
  }
  return result;
}

function validateLicenseKey(key) {
  if (!key) return false;
  const clean = key.trim().toUpperCase().replace(/\s/g, '');
  const match = clean.match(/^HIDER-([A-Z2-9]{5})-([A-Z2-9]{5})-([A-Z2-9]{5})-([A-Z2-9]{5})$/);
  if (!match) return false;
  const payload = match[1] + match[2] + match[3];
  const checksum = computeLicenseChecksum(payload);
  return match[4] === checksum;
}

function isProActivated() {
  return validateLicenseKey(settings.proLicenseKey);
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // Backward compat: convert old singleLineMode to visibleLines
      if (data.singleLineMode !== undefined) {
        if (data.singleLineMode && data.visibleLines === undefined) {
          data.visibleLines = 1;
        }
        delete data.singleLineMode;
      }
      settings = { ...settings, ...data };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function loadProgress() {
  try {
    if (fs.existsSync(progressPath)) {
      return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load progress:', e);
  }
  return {};
}

function saveProgress(data) {
  try {
    const existing = loadProgress();
    const merged = { ...existing, ...data };
    fs.writeFileSync(progressPath, JSON.stringify(merged, null, 2));
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

function normalizeFilePath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').replace(/[+].*$/, '').replace(/-.+$/, '');
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split('.').map(n => parseInt(n, 10) || 0);
  const right = normalizeVersion(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

function getUpdateConfig() {
  const local = packageJson.hider?.update || {};
  return {
    provider: local.provider || 'github',
    owner: process.env.HIDER_UPDATE_OWNER || local.owner || 'Yuki933293',
    repo: process.env.HIDER_UPDATE_REPO || local.repo || 'hider',
    manifest: process.env.HIDER_UPDATE_MANIFEST ||
      process.env.HIDER_UPDATE_MANIFEST_URL ||
      process.env.HIDER_UPDATE_MANIFEST_FILE ||
      '',
  };
}

function getAppInfo() {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    updateAutoCheck: settings.updateAutoCheck !== false,
    updateSource: getUpdateConfig().manifest ? 'manifest' : 'github',
  };
}

function cleanReleaseLine(line) {
  return String(line || '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

function extractReleaseNotes(body) {
  const notes = [];
  String(body || '').split(/\r?\n/).forEach((line) => {
    const text = cleanReleaseLine(line);
    if (!text || /^https?:\/\//i.test(text)) return;
    if (/^(changes|changelog|full changelog|更新日志|what'?s changed)$/i.test(text)) return;
    notes.push(text.slice(0, 160));
  });
  return notes.slice(0, 8);
}

function updateAssetNameFromUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return path.basename(decodeURIComponent(u.pathname || ''));
  } catch {
    return path.basename(String(value || '').split('?')[0]);
  }
}

function normalizeDigest(value, algorithm = 'sha256') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(new RegExp(`^${algorithm}:`, 'i'), '').trim().replace(/^['"]|['"]$/g, '');
}

function normalizeReleaseAsset(asset = {}) {
  const downloadUrl = asset.downloadUrl || asset.browser_download_url || asset.url || '';
  const digest = String(asset.digest || '');
  return {
    name: asset.name || updateAssetNameFromUrl(downloadUrl),
    size: Number(asset.size || 0) || 0,
    contentType: asset.contentType || asset.content_type || '',
    downloadUrl,
    sha256: normalizeDigest(asset.sha256 || (/^sha256:/i.test(digest) ? digest : ''), 'sha256').toLowerCase(),
    sha512: normalizeDigest(asset.sha512 || (/^sha512:/i.test(digest) ? digest : ''), 'sha512'),
  };
}

function isUpdateAssetForPlatform(asset) {
  const name = String(asset?.name || '').toLowerCase();
  if (!name || /\.(blockmap|ya?ml|json|txt|sha256|sha512)$/i.test(name)) return false;
  if (process.platform === 'darwin') return /\.(dmg|zip)$/i.test(name);
  if (process.platform === 'win32') return /\.(exe|msi)$/i.test(name);
  return /\.(appimage|deb|rpm|tar\.gz)$/i.test(name);
}

function platformAssetScore(asset) {
  const name = String(asset?.name || '').toLowerCase();
  const arch = process.arch.toLowerCase();
  let score = 0;
  if (process.platform === 'darwin') {
    if (name.endsWith('.dmg')) score += 30;
    if (name.endsWith('.zip')) score += 20;
    if (arch === 'arm64' && /arm64|aarch64/.test(name)) score += 10;
    if (arch === 'x64' && /(x64|x86_64|amd64)/.test(name)) score += 10;
  } else if (process.platform === 'win32') {
    if (name.endsWith('.exe')) score += 30;
    if (name.endsWith('.msi')) score += 20;
    if (/(setup|installer)/.test(name)) score += 10;
    if (arch === 'x64' && /(x64|x86_64|amd64)/.test(name)) score += 8;
  }
  if (/hider/i.test(name)) score += 5;
  return score;
}

function pickPlatformAsset(assets) {
  return (Array.isArray(assets) ? assets : [])
    .map(normalizeReleaseAsset)
    .filter(asset => asset.downloadUrl && isUpdateAssetForPlatform(asset))
    .sort((a, b) => platformAssetScore(b) - platformAssetScore(a))[0] || null;
}

function normalizeManifestUpdateInfo(data) {
  const release = data?.release || {};
  const latestVersion = normalizeVersion(
    data?.latestVersion || data?.version || release.version || release.tagName || release.tag_name || release.name
  ) || app.getVersion();
  const asset = release.asset || data?.asset || pickPlatformAsset(data?.assets || release.assets || []);
  const normalizedAsset = asset ? normalizeReleaseAsset(asset) : null;
  const notes = Array.isArray(release.notes) ? release.notes.map(cleanReleaseLine).filter(Boolean)
    : extractReleaseNotes(release.body || data?.body);
  return {
    ok: true,
    configured: true,
    source: 'manifest',
    currentVersion: app.getVersion(),
    latestVersion,
    updateAvailable: data?.updateAvailable != null
      ? !!data.updateAvailable
      : compareVersions(latestVersion, app.getVersion()) > 0,
    release: {
      tagName: release.tagName || release.tag_name || data?.tagName || `v${latestVersion}`,
      name: release.name || data?.name || `Hider v${latestVersion}`,
      version: latestVersion,
      publishedAt: release.publishedAt || release.published_at || data?.publishedAt || '',
      htmlUrl: release.htmlUrl || release.html_url || data?.htmlUrl || '',
      summary: release.summary || data?.summary || notes[0] || '发现新版本。',
      notes: notes.slice(0, 8),
      asset: normalizedAsset,
      downloadUrl: normalizedAsset?.downloadUrl || '',
    },
  };
}

async function readUpdateManifest(ref) {
  const value = String(ref || '').trim();
  if (!value) throw new Error('HIDER_UPDATE_MANIFEST 未配置');
  if (/^https?:\/\//i.test(value)) {
    const resp = await fetch(value, { headers: { 'User-Agent': `Hider/${app.getVersion()}` } });
    if (!resp.ok) throw new Error(`Manifest 请求失败：HTTP ${resp.status}`);
    return resp.json();
  }
  const file = /^file:/i.test(value) ? fileURLToPath(value) : path.resolve(value);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function checkForUpdates() {
  const config = getUpdateConfig();
  if (config.manifest) {
    return normalizeManifestUpdateInfo(await readUpdateManifest(config.manifest));
  }

  if (!config.owner || !config.repo || config.provider !== 'github') {
    return {
      ok: false,
      configured: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      updateAvailable: false,
      error: '更新仓库未配置',
    };
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/releases/latest`;
  const resp = await fetch(apiUrl, {
    headers: {
      'User-Agent': `Hider/${app.getVersion()}`,
      'Accept': 'application/vnd.github+json',
    },
  });
  if (!resp.ok) {
    return {
      ok: false,
      configured: true,
      source: 'github',
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      updateAvailable: false,
      error: resp.status === 404 ? '还没有可用的 GitHub Release' : `GitHub Release 请求失败：HTTP ${resp.status}`,
    };
  }

  const data = await resp.json();
  const latestVersion = normalizeVersion(data.tag_name || data.name || app.getVersion()) || app.getVersion();
  const asset = pickPlatformAsset(data.assets);
  const notes = extractReleaseNotes(data.body);
  return {
    ok: true,
    configured: true,
    source: 'github',
    currentVersion: app.getVersion(),
    latestVersion,
    updateAvailable: compareVersions(latestVersion, app.getVersion()) > 0,
    release: {
      tagName: data.tag_name || `v${latestVersion}`,
      name: data.name || `Hider v${latestVersion}`,
      version: latestVersion,
      publishedAt: data.published_at || '',
      htmlUrl: data.html_url || '',
      summary: notes[0] || (compareVersions(latestVersion, app.getVersion()) > 0 ? '发现新版本。' : '当前已经是最新版本。'),
      notes,
      asset,
      downloadUrl: asset?.downloadUrl || '',
    },
  };
}

function safeUpdateFileName(name, version) {
  const raw = String(name || '').trim() || `Hider-${version || app.getVersion()}-${process.platform}.${process.platform === 'win32' ? 'exe' : 'dmg'}`;
  return raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function sha256Hex(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyDownloadedUpdate(filePath, asset) {
  const stat = fs.statSync(filePath);
  if (asset.size && stat.size !== asset.size) {
    throw new Error(`下载文件大小不一致：期望 ${asset.size}，实际 ${stat.size}`);
  }
  if (asset.sha256) {
    const actual = sha256Hex(filePath);
    if (actual !== asset.sha256) {
      throw new Error('下载文件 SHA256 校验失败');
    }
  }
}

function sendUpdateProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', payload);
  }
}

async function downloadUpdate() {
  const info = await checkForUpdates();
  const asset = info.release?.asset;
  if (!info.ok) throw new Error(info.error || '更新检测失败');
  if (!info.updateAvailable) throw new Error('当前已经是最新版本');
  if (!asset?.downloadUrl) throw new Error('这个版本没有适合当前系统的安装包');

  fs.mkdirSync(updateDownloadDir, { recursive: true });
  const fileName = safeUpdateFileName(asset.name, info.latestVersion);
  const filePath = path.join(updateDownloadDir, fileName);
  const tmpPath = `${filePath}.download`;

  try {
    const cached = fs.existsSync(filePath);
    if (cached && (asset.size || asset.sha256)) {
      verifyDownloadedUpdate(filePath, asset);
      sendUpdateProgress({ status: 'ready', progress: 100, fileName, filePath, cached: true });
      return { ok: true, status: 'ready', progress: 100, fileName, filePath, cached: true, update: info };
    } else if (cached) {
      fs.unlinkSync(filePath);
    }
  } catch {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }

  try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  sendUpdateProgress({ status: 'downloading', progress: 0, received: 0, total: asset.size || 0, fileName });

  const resp = await fetch(asset.downloadUrl, {
    headers: { 'User-Agent': `Hider/${app.getVersion()}` },
  });
  if (!resp.ok) throw new Error(`安装包下载失败：HTTP ${resp.status}`);

  const total = parseInt(resp.headers.get('content-length') || '0', 10) || asset.size || 0;
  const writer = fs.createWriteStream(tmpPath);
  let received = 0;

  if (!resp.body) throw new Error('下载响应为空');
  const reader = resp.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const buf = Buffer.from(chunk.value);
      received += buf.length;
      if (!writer.write(buf)) {
        await new Promise(resolve => writer.once('drain', resolve));
      }
      const progress = total > 0 ? Math.max(1, Math.min(99, Math.round((received / total) * 100))) : 0;
      sendUpdateProgress({ status: 'downloading', progress, received, total, fileName });
    }
  } finally {
    writer.end();
    await new Promise((resolve, reject) => {
      writer.once('finish', resolve);
      writer.once('error', reject);
    });
  }

  verifyDownloadedUpdate(tmpPath, { ...asset, size: asset.size || total });
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  fs.renameSync(tmpPath, filePath);
  sendUpdateProgress({ status: 'ready', progress: 100, received, total, fileName, filePath, cached: false });
  return { ok: true, status: 'ready', progress: 100, fileName, filePath, cached: false, update: info };
}

async function openUpdateInstaller(filePath) {
  const target = path.resolve(String(filePath || ''));
  const updateDir = path.resolve(updateDownloadDir);
  if (!target || !target.startsWith(updateDir + path.sep)) {
    return { ok: false, error: '更新安装包路径无效' };
  }
  if (!fs.existsSync(target)) {
    return { ok: false, error: '更新安装包不存在' };
  }
  const error = await shell.openPath(target);
  return error ? { ok: false, error } : { ok: true };
}

function loadBookmarks() {
  try {
    if (fs.existsSync(bookmarksPath)) {
      return JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
  }
  return [];
}

function saveBookmarks(data) {
  try {
    fs.writeFileSync(bookmarksPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save bookmarks:', e);
  }
}

function loadRecentFiles() {
  try {
    if (fs.existsSync(recentFilesPath)) {
      return JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load recent files:', e);
  }
  return [];
}

function addRecentFile(filePath, fileName) {
  const list = loadRecentFiles();
  // Remove duplicate
  const filtered = list.filter(f => f.path !== filePath);
  // Prepend new entry
  filtered.unshift({ path: filePath, name: fileName, time: Date.now() });
  // Keep max 10
  const trimmed = filtered.slice(0, 10);
  try {
    fs.writeFileSync(recentFilesPath, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.error('Failed to save recent files:', e);
  }
}

// EPUB parsing: extract text from EPUB zip
function parseEpub(filePath) {
  let zip, entries;
  try {
    zip = new AdmZip(filePath);
    entries = zip.getEntries();
  } catch (e) {
    throw new Error(`无法读取 EPUB 文件：${e.message}`);
  }

  // Find container.xml to get the root file
  const containerEntry = entries.find(e => e.entryName === 'META-INF/container.xml');
  let opfPath = '';
  if (containerEntry) {
    const containerXml = containerEntry.getData().toString('utf-8');
    const rootMatch = containerXml.match(/full-path=["']([^"']+)["']/);
    if (rootMatch) opfPath = rootMatch[1];
  }

  // Compute OPF directory for resolving relative hrefs
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfEntry = opfPath ? entries.find(e => e.entryName === opfPath) : null;
  let spineItems = [];

  if (opfEntry) {
    const opfXml = opfEntry.getData().toString('utf-8');

    // Parse manifest: extract each <item> tag individually (handles any attribute order)
    const manifest = {};
    const itemTags = opfXml.match(/<item\s[^>]*\/?>/gi) || [];
    for (const tag of itemTags) {
      const id = (tag.match(/\bid=["']([^"']+)["']/) || [])[1];
      const href = (tag.match(/\bhref=["']([^"']+)["']/) || [])[1];
      const type = (tag.match(/\bmedia-type=["']([^"']+)["']/) || [])[1];
      if (id && href && type) {
        manifest[id] = { href: decodeURIComponent(href), mediaType: type };
      }
    }

    // Parse spine: get reading order
    const spineRegex = /<itemref\s[^>]*idref=["']([^"']+)["']/gi;
    let match;
    while ((match = spineRegex.exec(opfXml)) !== null) {
      if (manifest[match[1]] && manifest[match[1]].mediaType.includes('html')) {
        spineItems.push(manifest[match[1]].href);
      }
    }
  }

  // Fallback: if spine is empty, find all HTML files sorted by name
  if (spineItems.length === 0) {
    spineItems = entries
      .filter(e => /\.(x?html?|htm)$/i.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName))
      .map(e => e.entryName);
  }

  // Extract text from each chapter
  const chapters = [];
  for (const href of spineItems) {
    const fullPath = resolveEpubPath(opfDir, href);
    const entry = entries.find(e =>
      e.entryName === fullPath ||
      e.entryName === href ||
      decodeURIComponent(e.entryName) === fullPath
    );
    if (!entry) continue;

    try {
      const html = entry.getData().toString('utf-8');
      const title = extractChapterTitle(html);
      const text = htmlToText(html);
      if (text.trim()) {
        chapters.push({ title, text: text.trim() });
      }
    } catch (e) {
      console.error(`Failed to parse chapter ${href}:`, e.message);
    }
  }

  if (chapters.length === 0) {
    throw new Error('未能从 EPUB 文件中提取到任何文本内容');
  }

  // Join chapters with separator (include title if not already in text)
  return chapters.map((ch, i) => {
    const firstLine = ch.text.split('\n')[0].trim();
    const titleAlreadyInText = ch.title && firstLine === ch.title;

    if (i === 0) {
      return titleAlreadyInText || !ch.title ? ch.text : `${ch.title}\n\n${ch.text}`;
    }
    const sep = '─'.repeat(40);
    if (titleAlreadyInText || !ch.title) {
      return `${sep}\n\n${ch.text}`;
    }
    return `${sep}\n\n${ch.title}\n\n${ch.text}`;
  }).join('\n\n');
}

// Resolve a relative path against a base directory (forward-slash paths for ZIP entries)
function resolveEpubPath(base, href) {
  if (!base || href.startsWith('/')) return href.replace(/^\//, '');
  const parts = (base + href).split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

// Extract chapter title from HTML heading tags
function extractChapterTitle(html) {
  for (const tag of ['h1', 'h2', 'h3']) {
    const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (match) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      if (title && title.length < 100) return title;
    }
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (title && title.length < 100) return title;
  }
  return '';
}

// HTML to text converter
function htmlToText(html) {
  return html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert headings
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, '\n$2\n')
    // Convert list items
    .replace(/<li[^>]*>/gi, '\n  · ')
    // Convert common block elements to newlines
    .replace(/<\/?(p|div|br|blockquote|ul|ol|tr|section|article|header|footer)[^>]*>/gi, '\n')
    // Remove all other tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyWindowZOrder({ alwaysOnTop = settings.alwaysOnTop, hoverMode = hoverWindowState.hoverMode, interactive = hoverWindowState.interactive } = {}) {
  if (!mainWindow) return;

  const clickThrough = hoverMode && !interactive;

  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  mainWindow.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? 'screen-saver' : 'normal');
}

function emitHoverStateChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('hover-state-changed', {
    interactive: hoverWindowState.interactive,
  });
}

function emitAlwaysOnTopChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('always-on-top-changed', settings.alwaysOnTop);
}

function getHoverWindowSnapshot() {
  return {
    hoverMode: hoverWindowState.hoverMode,
    forceInteractive: hoverWindowState.forceInteractive,
    interactive: hoverWindowState.interactive,
  };
}

function isCursorInsideWindow() {
  if (!mainWindow) return false;
  const { x, y } = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  return x >= bounds.x && x <= bounds.x + bounds.width &&
         y >= bounds.y && y <= bounds.y + bounds.height;
}

function computeHoverInteractive() {
  if (!hoverWindowState.hoverMode || !isVisible) return true;
  if (hoverWindowState.forceInteractive) return true;
  return isCursorInsideWindow();
}

function stopHoverTracking() {
  if (!hoverPollTimer) return;
  clearInterval(hoverPollTimer);
  hoverPollTimer = null;
}

function syncHoverWindowState() {
  if (!mainWindow) return getHoverWindowSnapshot();

  const nextInteractive = computeHoverInteractive();
  const interactiveChanged = nextInteractive !== hoverWindowState.interactive;
  hoverWindowState.interactive = nextInteractive;

  applyWindowZOrder({
    alwaysOnTop: settings.alwaysOnTop,
    hoverMode: hoverWindowState.hoverMode,
    interactive: hoverWindowState.interactive,
  });

  if (interactiveChanged) {
    emitHoverStateChanged();
  }

  return getHoverWindowSnapshot();
}

function startHoverTracking() {
  if (hoverPollTimer || !hoverWindowState.hoverMode) return;
  hoverPollTimer = setInterval(() => {
    syncHoverWindowState();
  }, 150);
}

function setAlwaysOnTopSetting(enabled) {
  const nextValue = !!enabled;
  if (settings.alwaysOnTop === nextValue) return settings.alwaysOnTop;

  settings.alwaysOnTop = nextValue;
  applyWindowZOrder({
    alwaysOnTop: settings.alwaysOnTop,
    hoverMode: hoverWindowState.hoverMode,
    interactive: hoverWindowState.interactive,
  });
  saveSettings();
  refreshTrayMenu();
  emitAlwaysOnTopChanged();
  return settings.alwaysOnTop;
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  let winWidth = 800, winHeight = 600, winX, winY;

  // Restore saved window bounds
  if (settings.windowBounds) {
    const b = settings.windowBounds;
    winWidth = b.width || 800;
    winHeight = b.height || 600;
    // Validate position is within any visible display
    const displays = screen.getAllDisplays();
    const onScreen = displays.some(d => {
      const wa = d.workArea;
      return b.x >= wa.x - 50 && b.x < wa.x + wa.width &&
             b.y >= wa.y - 50 && b.y < wa.y + wa.height;
    });
    if (onScreen) {
      winX = b.x;
      winY = b.y;
    }
  }

  if (winX === undefined) winX = Math.floor((workArea.width - winWidth) / 2);
  if (winY === undefined) winY = Math.floor((workArea.height - winHeight) / 2);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    transparent: true,
    frame: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    hasShadow: false,
    resizable: true,
    minimizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  applyWindowZOrder({
    alwaysOnTop: settings.alwaysOnTop,
    hoverMode: hoverWindowState.hoverMode,
    interactive: hoverWindowState.interactive,
  });
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Intercept new windows from webview: navigate in-place instead of opening new window
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.setWindowOpenHandler(({ url }) => {
      webContents.loadURL(url);
      return { action: 'deny' };
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Auto-save window bounds on resize/move (debounced)
  let saveBoundsTimeout;
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isMinimized()) return;
    settings.windowBounds = mainWindow.getBounds();
    if (saveBoundsTimeout) clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = setTimeout(() => saveSettings(), 500);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('closed', () => {
    stopHoverTracking();
    mainWindow = null;
  });
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示/隐藏', click: () => toggleVisibility() },
    { label: '打开文件', click: () => openFile() },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => {
        setAlwaysOnTopSetting(item.checked);
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'img/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(process.platform === 'darwin' ? icon.resize({ width: 16, height: 16 }) : icon);
  tray.setToolTip('Hider - 摸鱼阅读器');
  refreshTrayMenu();
  tray.on('click', () => toggleVisibility());
}

function restoreWindow() {
  if (!mainWindow) return;
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  isVisible = true;
  if (!tray || tray.isDestroyed()) {
    createTray();
  }
}

function toggleVisibility() {
  if (!mainWindow) return;
  if (isVisible) {
    mainWindow.hide();
    isVisible = false;
  } else {
    restoreWindow();
  }
}

function bossKey() {
  if (!mainWindow) return;
  mainWindow.hide();
  isVisible = false;
  // Hide from Dock (macOS) / Taskbar (Windows)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  mainWindow.setSkipTaskbar(true);
  // Hide tray / menu bar icon
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

async function openFile() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '支持的文件', extensions: ['txt', 'md', 'text', 'epub'] },
      { name: '文本文件', extensions: ['txt', 'md', 'text'] },
      { name: 'EPUB 电子书', extensions: ['epub'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    loadFileContent(result.filePaths[0]);
  }
}

function loadFileContent(filePath) {
  try {
    const normalizedPath = normalizeFilePath(filePath);
    const ext = path.extname(normalizedPath).toLowerCase();
    let content;

    if (ext === '.epub') {
      content = parseEpub(normalizedPath);
    } else {
      content = fs.readFileSync(normalizedPath, 'utf-8');
    }

    const progress = loadProgress();
    const scrollPos = progress[normalizedPath] || progress[filePath] || 0;
    const fileName = path.basename(normalizedPath);
    addRecentFile(normalizedPath, fileName);
    mainWindow.webContents.send('file-loaded', {
      path: normalizedPath,
      name: fileName,
      content,
      scrollPosition: scrollPos,
    });
  } catch (e) {
    dialog.showErrorBox('错误', `文件读取失败：${e.message}`);
  }
}

function getShortcutDefinitions() {
  return [
    {
      settingKey: 'toggleHotkey',
      label: '显隐切换',
      accelerator: settings.toggleHotkey,
      handler: () => toggleVisibility(),
    },
    {
      settingKey: 'bossHotkey',
      label: '老板键',
      accelerator: settings.bossHotkey,
      handler: () => bossKey(),
    },
    {
      settingKey: 'settingsHotkey',
      label: '打开设置',
      accelerator: settings.settingsHotkey,
      handler: () => {
        if (mainWindow) {
          mainWindow.webContents.send('toggle-settings');
        }
      },
    },
    {
      settingKey: 'immersiveHotkey',
      label: '沉浸模式',
      accelerator: settings.immersiveHotkey,
      handler: () => {
        if (mainWindow) {
          mainWindow.webContents.send('toggle-immersive-mode');
        }
      },
    },
  ];
}

function notifyShortcutRegistrationStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('shortcuts-registration-result', shortcutRegistrationStatus);
}

function registerShortcuts({ notify = true } = {}) {
  globalShortcut.unregisterAll();

  const definitions = getShortcutDefinitions().filter(def => !!def.accelerator);
  const acceleratorCounts = definitions.reduce((acc, def) => {
    const key = def.accelerator.trim().toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const registered = [];
  const failed = [];

  definitions.forEach((def) => {
    const normalizedAccelerator = def.accelerator.trim().toLowerCase();
    if (acceleratorCounts[normalizedAccelerator] > 1) {
      failed.push({
        settingKey: def.settingKey,
        label: def.label,
        accelerator: def.accelerator,
        reason: '与 Hider 内其他快捷键重复',
      });
      return;
    }

    try {
      const ok = globalShortcut.register(def.accelerator, def.handler);
      if (ok) {
        registered.push({
          settingKey: def.settingKey,
          label: def.label,
          accelerator: def.accelerator,
        });
      } else {
        failed.push({
          settingKey: def.settingKey,
          label: def.label,
          accelerator: def.accelerator,
          reason: '已被系统限制或其他应用占用',
        });
      }
    } catch (e) {
      failed.push({
        settingKey: def.settingKey,
        label: def.label,
        accelerator: def.accelerator,
        reason: e.message || '快捷键格式无效或不受支持',
      });
      console.error(`Failed to register ${def.settingKey}:`, e);
    }
  });

  shortcutRegistrationStatus = {
    ok: failed.length === 0,
    registered,
    failed,
  };

  if (notify) {
    notifyShortcutRegistrationStatus();
  }

  return shortcutRegistrationStatus;
}

// Single instance lock: clicking the icon again restores instead of launching a second instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (!isVisible) {
      restoreWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    progressPath = path.join(app.getPath('userData'), 'progress.json');
    bookmarksPath = path.join(app.getPath('userData'), 'bookmarks.json');
    recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
    updateDownloadDir = path.join(app.getPath('userData'), 'updates');
    loadSettings();
    createWindow();
    createTray();
    registerShortcuts();

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('settings-loaded', {
        ...settings,
        proActivated: isProActivated(),
      });
      notifyShortcutRegistrationStatus();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        if (!isVisible) restoreWindow();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

app.on('will-quit', () => {
  stopHoverTracking();
  globalShortcut.unregisterAll();
});

// IPC Handlers
ipcMain.handle('open-file', async () => {
  await openFile();
});

ipcMain.handle('get-settings', () => settings);

ipcMain.handle('get-app-info', () => getAppInfo());

ipcMain.handle('check-for-updates', async () => {
  try {
    return await checkForUpdates();
  } catch (e) {
    return {
      ok: false,
      configured: true,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      updateAvailable: false,
      error: e.message || '更新检测失败',
    };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    return await downloadUpdate();
  } catch (e) {
    sendUpdateProgress({ status: 'error', error: e.message || '更新下载失败' });
    return { ok: false, error: e.message || '更新下载失败' };
  }
});

ipcMain.handle('open-update-installer', async (event, filePath) => {
  try {
    return await openUpdateInstaller(filePath);
  } catch (e) {
    return { ok: false, error: e.message || '打开安装包失败' };
  }
});

ipcMain.handle('save-settings', (event, newSettings) => {
  const previousAlwaysOnTop = settings.alwaysOnTop;
  settings = { ...settings, ...newSettings };
  saveSettings();
  applyWindowZOrder({
    alwaysOnTop: settings.alwaysOnTop,
    hoverMode: hoverWindowState.hoverMode,
    interactive: hoverWindowState.interactive,
  });
  if (previousAlwaysOnTop !== settings.alwaysOnTop) {
    refreshTrayMenu();
    emitAlwaysOnTopChanged();
  }
  const shortcuts = registerShortcuts();
  return { ...settings, shortcutStatus: shortcuts };
});

ipcMain.handle('save-progress', (event, data) => {
  saveProgress(data);
});

ipcMain.on('save-progress-sync', (event, data) => {
  saveProgress(data);
  event.returnValue = true;
});

ipcMain.handle('toggle-visibility', () => toggleVisibility());

ipcMain.handle('minimize-window', () => mainWindow?.minimize());

ipcMain.handle('close-window', () => mainWindow?.close());

ipcMain.handle('set-window-size', (event, { width, height }) => {
  mainWindow?.setSize(width, height);
});

ipcMain.handle('get-window-bounds', () => {
  return mainWindow?.getBounds();
});

ipcMain.handle('set-always-on-top', (event, enabled) => {
  return setAlwaysOnTopSetting(enabled);
});

ipcMain.handle('update-hover-window', (event, nextState) => {
  hoverWindowState = { ...hoverWindowState, ...nextState };
  if (hoverWindowState.hoverMode) {
    startHoverTracking();
  } else {
    stopHoverTracking();
  }
  return syncHoverWindowState();
});

ipcMain.handle('is-mouse-in-window', () => {
  if (!mainWindow) return false;
  const { x, y } = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  return x >= bounds.x && x <= bounds.x + bounds.width &&
         y >= bounds.y && y <= bounds.y + bounds.height;
});

ipcMain.handle('start-drag', () => {
  if (!mainWindow) return;
  const [winX, winY] = mainWindow.getPosition();
  const { x: mouseX, y: mouseY } = screen.getCursorScreenPoint();
  return { winX, winY, mouseX, mouseY };
});

ipcMain.handle('move-window', (event, { offsetX, offsetY }) => {
  if (!mainWindow) return;
  const { x: mouseX, y: mouseY } = screen.getCursorScreenPoint();
  mainWindow.setPosition(mouseX - offsetX, mouseY - offsetY);
});

ipcMain.handle('load-file-path', (event, filePath) => {
  loadFileContent(filePath);
});

ipcMain.handle('unregister-shortcuts', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('register-shortcuts', () => {
  return registerShortcuts();
});

ipcMain.handle('load-bookmarks', () => {
  return loadBookmarks();
});

ipcMain.handle('save-bookmarks', (event, data) => {
  saveBookmarks(data);
});

ipcMain.handle('load-recent-files', () => {
  return loadRecentFiles();
});

ipcMain.handle('remove-recent-file', (event, filePath) => {
  const list = loadRecentFiles().filter(f => f.path !== filePath);
  try {
    fs.writeFileSync(recentFilesPath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('Failed to save recent files:', e);
  }
  return list;
});

ipcMain.handle('activate-pro', (event, key) => {
  if (validateLicenseKey(key)) {
    settings.proLicenseKey = key.trim().toUpperCase().replace(/\s/g, '');
    saveSettings();
    return { success: true };
  }
  return { success: false, error: '无效的许可证密钥' };
});

ipcMain.handle('deactivate-pro', () => {
  settings.proLicenseKey = '';
  saveSettings();
  return { success: true };
});

ipcMain.handle('get-pro-status', () => {
  return { proActivated: isProActivated() };
});

ipcMain.handle('open-help', () => {
  const helpWin = new BrowserWindow({
    width: 720,
    height: 640,
    title: 'Hider 使用帮助',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  helpWin.loadFile(path.join(__dirname, 'renderer', 'help.html'));
});
