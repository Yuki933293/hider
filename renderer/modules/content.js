// Content display, web mode, bookmarks, reader mode, site rules
import { state, dom, hexToRgb, escapeHtml } from './state.js';

// ============ Built-in Site Rules ============
// Predefined rules for popular reading sites. User overrides merge on top.
const BUILTIN_SITE_RULES = {
  'www.qidian.com': {
    name: '起点中文网',
    contentSelector: '.read-content, .text-wrap, .j_readContent, .main-text-wrap, .content-wrap',
    removeSelectors: '.review-wrap, .chapter-control, .admire-wrap, .j_pleaseLogin, .lang, .chapter-prompt-wrap, .fans-interact, .card-interact, .author-promote, .chapter-end-mark, .recommend-wrap',
    autoReaderMode: true,
  },
  'read.qidian.com': {
    name: '起点读书',
    contentSelector: '.read-content, .text-wrap, .j_readContent',
    removeSelectors: '.review-wrap, .chapter-control, .admire-wrap, .j_pleaseLogin, .lang, .chapter-prompt-wrap, .fans-interact, .card-interact',
    autoReaderMode: true,
  },
  'vipreader.qidian.com': {
    name: '起点 VIP',
    contentSelector: '.read-content, .text-wrap',
    removeSelectors: '.review-wrap, .chapter-control, .admire-wrap',
    autoReaderMode: true,
  },
  'm.qidian.com': {
    name: '起点移动版',
    contentSelector: '.read-section, .j_readContent, .read-content',
    removeSelectors: '.chapter-control, .review-wrap',
    autoReaderMode: true,
  },
  'fanqienovel.com': {
    name: '番茄小说',
    contentSelector: '.muye-reader-content-inner, .muye-reader-content, .reader-content',
    removeSelectors: '.download-guide, .reader-toolbar, .reader-footer, .tt-appbar',
    autoReaderMode: true,
  },
  'b.faloo.com': {
    name: '飞卢小说',
    contentSelector: '#neirong, .neirong_font, .readcontent',
    removeSelectors: '.botad, .topad, .ggbox',
    autoReaderMode: true,
  },
  'www.faloo.com': {
    name: '飞卢小说',
    contentSelector: '#neirong, .neirong_font, .readcontent',
    removeSelectors: '.botad, .topad, .ggbox',
    autoReaderMode: true,
  },
  'book.zongheng.com': {
    name: '纵横中文网',
    contentSelector: '.content, .reader-main-text',
    removeSelectors: '.recommend-wrap, .chapter-nav',
    autoReaderMode: true,
  },
  'read.zongheng.com': {
    name: '纵横中文网',
    contentSelector: '.content, .reader-main-text',
    removeSelectors: '.recommend-wrap, .chapter-nav',
    autoReaderMode: true,
  },
  'www.jjwxc.net': {
    name: '晋江文学城',
    contentSelector: '.noveltext, #oneboolt',
    removeSelectors: '.readsmall, .noveltitle table',
    autoReaderMode: true,
  },
  'm.jjwxc.net': {
    name: '晋江文学城',
    contentSelector: '.noveltext, .content',
    removeSelectors: '.readsmall',
    autoReaderMode: true,
  },
  'mp.weixin.qq.com': {
    name: '微信公众号',
    contentSelector: '#js_content, .rich_media_content',
    removeSelectors: '#js_pc_qr_code, .qr_code_area, .reward_area, .rich_media_tool',
    autoReaderMode: true,
  },
  'zhuanlan.zhihu.com': {
    name: '知乎专栏',
    contentSelector: '.Post-RichText, .RichText',
    removeSelectors: '.FollowButton, .ContentItem-action, .Post-topicsAndReviewer',
    autoReaderMode: true,
  },
  'www.zhihu.com': {
    name: '知乎',
    contentSelector: '.Post-RichText, .RichText, .QuestionRichText',
    removeSelectors: '.FollowButton, .ContentItem-action',
    autoReaderMode: true,
  },
  'www.17k.com': {
    name: '17K 小说',
    contentSelector: '#chapterContent, .readAreaBox .p',
    removeSelectors: '.chapterAd, .barrage',
    autoReaderMode: true,
  },
  'www.ciweimao.com': {
    name: '刺猬猫',
    contentSelector: '#J_BookRead, .chapter-entity',
    removeSelectors: '.interact-wrap',
    autoReaderMode: true,
  },
  'www.69shuba.com': {
    name: '69 书吧',
    contentSelector: '.txtnav, #novelcontent',
    removeSelectors: '.txtad',
    autoReaderMode: true,
  },
};

// Get site rule for a hostname (merge built-in + user override)
export function getSiteRule(hostname) {
  if (!hostname) return null;
  const builtin = BUILTIN_SITE_RULES[hostname] || null;
  const userRules = state.settings.siteRules || {};
  const user = userRules[hostname] || null;
  if (!builtin && !user) return null;
  return { ...(builtin || {}), ...(user || {}) };
}

// Get hostname from current webview URL
export function getCurrentHostname() {
  try {
    const url = dom.webview.getURL();
    if (!url || url === 'about:blank') return '';
    return new URL(url).hostname;
  } catch { return ''; }
}

// Check if a hostname has a built-in rule
export function isBuiltinSite(hostname) {
  return !!BUILTIN_SITE_RULES[hostname];
}

export function isImmersiveFileMode() {
  return state.currentMode === 'file' && !!state.settings.immersiveMode;
}

export function isLineLimitedMode() {
  return state.currentMode === 'file' && state.settings.visibleLines > 0 && !isImmersiveFileMode();
}

export function initContent() {
  // Mode switch buttons
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // URL input
  dom.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateToUrl(dom.urlInput.value.trim());
    }
  });

  // Webview events
  dom.webview.addEventListener('dom-ready', () => {
    state.webviewReady = true;
  });

  // Extract read button
  dom.btnExtractRead.addEventListener('click', () => extractAndRead());

  dom.btnToc.addEventListener('click', () => toggleTocDropdown());

  // Back to web button
  dom.btnBackToWeb.addEventListener('click', () => {
    state.extractedFromWeb = false;
    closeFile();
    switchMode('web');
  });

  dom.webview.addEventListener('new-window', (e) => {
    e.preventDefault();
    dom.webview.src = e.url;
  });

  dom.webview.addEventListener('did-start-loading', () => {
    dom.progressFill.style.width = '30%';
    dom.progressFill.style.transition = 'width 2s ease';
  });

  dom.webview.addEventListener('did-stop-loading', () => {
    dom.progressFill.style.transition = 'width 0.3s ease';
    dom.progressFill.style.width = '100%';
    setTimeout(() => {
      if (state.currentMode === 'web') {
        dom.progressFill.style.width = '0%';
      }
    }, 500);

    if (state.currentMode === 'web') {
      // Check auto reader mode for current site (Pro only)
      if (!state.readerModeEnabled && state.isPro) {
        const hostname = getCurrentHostname();
        const rule = getSiteRule(hostname);
        if (rule?.autoReaderMode) {
          state.readerModeEnabled = true;
          document.getElementById('btn-reader-mode').classList.add('active');
          dom.settingsPanel.classList.add('reader-mode');
        }
      }

      if (state.readerModeEnabled) {
        state.readerCssKey = null;
        applyReaderMode();
      }

      // Notify settings UI to update site rule display
      if (state.onSiteNavigated) state.onSiteNavigated();
    }
  });

  dom.webview.addEventListener('page-title-updated', (e) => {
    if (state.currentMode === 'web') {
      dom.titleFilename.textContent = e.title || 'Hider';
    }
  });

  dom.webview.addEventListener('did-navigate', (e) => {
    if (state.currentMode === 'web') {
      dom.urlInput.value = e.url;
      updateBookmarkButton();
      if (state.onSiteNavigated) state.onSiteNavigated();
    }
  });

  dom.webview.addEventListener('did-navigate-in-page', (e) => {
    if (state.currentMode === 'web' && e.isMainFrame) {
      dom.urlInput.value = e.url;
      updateBookmarkButton();
    }
  });

  // Nav buttons
  document.getElementById('btn-back').addEventListener('click', () => {
    if (state.webviewReady && dom.webview.canGoBack()) dom.webview.goBack();
  });
  document.getElementById('btn-forward').addEventListener('click', () => {
    if (state.webviewReady && dom.webview.canGoForward()) dom.webview.goForward();
  });
  document.getElementById('btn-reload').addEventListener('click', () => {
    if (state.webviewReady) dom.webview.reload();
  });
  document.getElementById('btn-reader-mode').addEventListener('click', () => {
    toggleReaderMode();
  });

  // Bookmark buttons
  dom.btnBookmark.addEventListener('click', () => {
    if (!state.webviewReady || state.currentMode !== 'web') return;
    const url = dom.webview.getURL();
    if (!url || url === 'about:blank') return;

    const idx = state.bookmarks.findIndex((b) => b.url === url);
    if (idx >= 0) {
      state.bookmarks.splice(idx, 1);
    } else {
      state.bookmarks.push({
        title: dom.webview.getTitle() || url,
        url: url,
      });
    }
    window.api.saveBookmarks(state.bookmarks);
    updateBookmarkButton();
    renderBookmarks();
  });

  dom.btnBookmarksList.addEventListener('click', () => {
    const isHidden = dom.bookmarksDropdown.classList.contains('hidden');
    dom.bookmarksDropdown.classList.toggle('hidden', !isHidden);
    dom.btnBookmarksList.classList.toggle('active', isHidden);
    if (isHidden) renderBookmarks();
  });

  // Scroll tracking + auto-load next chapter
  dom.readerContent.addEventListener('scroll', () => {
    if (state.currentMode === 'file') {
      updateProgress();
      debounceSaveProgress();

      // Auto-load next chapter when near bottom (extract mode, normal scroll)
      if (state.extractedFromWeb && state.extractNextChapterUrl && !state.autoLoadingNext
          && !isLineLimitedMode()) {
        const el = dom.readerContent;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 300;
        if (nearBottom) {
          appendNextChapter();
        }
      }
    }
  });

  // Load bookmarks
  window.api.loadBookmarks().then((data) => {
    state.bookmarks = data || [];
  });

  // Load recent files
  renderRecentFiles();
}

// ============ Mode Switching ============
export function switchMode(mode) {
  if (mode === state.currentMode) return;
  state.currentMode = mode;

  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  dom.settingsPanel.classList.toggle('web-mode', mode === 'web');

  if (mode !== 'web' && state.readerModeEnabled) {
    state.readerModeEnabled = false;
    state.readerCssKey = null;
    document.getElementById('btn-reader-mode').classList.remove('active');
    dom.settingsPanel.classList.remove('reader-mode');
  }

  if (mode === 'web') {
    hideTocDropdown();
    dom.btnToc.classList.add('hidden');
    dom.urlBar.classList.remove('hidden');
    dom.readerContent.style.display = 'none';
    dom.singleLineOverlay.classList.add('hidden');
    dom.progressBar.style.display = 'none';
    dom.btnOpen.style.display = 'none';
    dom.webview.classList.remove('hidden');

    if (!dom.webview.getAttribute('src')) {
      dom.webview.src = 'https://www.bing.com';
      dom.urlInput.value = 'https://www.bing.com';
      dom.titleFilename.textContent = 'Hider - 搜索或输入网址';
    }
    dom.urlInput.focus();
  } else {
    dom.urlBar.classList.add('hidden');
    dom.webview.classList.add('hidden');
    dom.bookmarksDropdown.classList.add('hidden');
    dom.btnBookmarksList.classList.remove('active');
    dom.progressBar.style.display = '';
    dom.btnOpen.style.display = '';

    if (state.currentFile) {
      dom.readerContent.style.display = '';
      if (isLineLimitedMode()) {
        dom.singleLineOverlay.classList.remove('hidden');
        dom.readerContent.style.display = 'none';
      } else {
        dom.singleLineOverlay.classList.add('hidden');
      }
      dom.btnToc.classList.toggle('hidden', state.toc.length === 0);
      dom.titleFilename.textContent = state.currentFile.name;
    } else {
      dom.btnToc.classList.add('hidden');
      hideTocDropdown();
      dom.readerContent.style.display = '';
      dom.titleFilename.textContent = 'Hider - 拖入文件或点击文件夹图标打开';
    }
  }
}

// ============ Web Content Extraction ============

// Build extraction script for a given site's selectors
function buildExtractScript(siteSelectors) {
  return `
    (function() {
      function stripAttrs(el) {
        el.querySelectorAll('[style]').forEach(e => e.removeAttribute('style'));
        el.querySelectorAll('[class]').forEach(e => e.removeAttribute('class'));
        el.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
        return el;
      }

      // Find best content container (site-specific selectors first)
      const selectors = [
        ${siteSelectors.map(s => `'${s.replace(/'/g, "\\'")}'`).join(',\n        ')}${siteSelectors.length ? ',' : ''}
        'article', 'main', '[role="main"]',
        '.post-content', '.article-content', '.article-body',
        '.entry-content', '.content-body', '.post-body',
        '#content', '#article', '#main-content'
      ];
      let container = null;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 200) { container = el; break; }
      }
      if (!container) container = document.body;
      const clone = container.cloneNode(true);

      // Remove noise elements
      clone.querySelectorAll(
        'script,style,nav,footer,header,aside,iframe,' +
        '[class*="comment"],[class*="sidebar"],[class*="recommend"],' +
        '[class*="related"],[class*="share"],[class*="social"],' +
        '[class*="ad-"],[class*="-ad"],[class*="advertisement"],' +
        '[class*="banner"],[class*="popup"],[class*="modal"]'
      ).forEach(e => e.remove());

      stripAttrs(clone);

      // Extract blocks
      const blockTags = 'p,h1,h2,h3,h4,h5,h6,pre,blockquote,ul,ol';
      const blocks = Array.from(clone.querySelectorAll(blockTags))
        .filter(el => el.textContent.trim().length > 5)
        .map(el => el.outerHTML);

      // Detect next/previous chapter links
      const chapterKeywords = ['下一章', '下一页', '下章', 'next', '后一章', '下一节'];
      const prevKeywords = ['上一章', '上一页', '上章', 'prev', '前一章', '上一节'];
      function findChapterLink(keywords) {
        const allLinks = document.querySelectorAll('a[href]');
        for (const a of allLinks) {
          const text = a.textContent.trim().toLowerCase();
          for (const kw of keywords) {
            if (text.includes(kw.toLowerCase())) {
              return { url: a.href, text: a.textContent.trim() };
            }
          }
        }
        return null;
      }
      const nextChapter = findChapterLink(chapterKeywords);
      const prevChapter = findChapterLink(prevKeywords);

      const html = blocks.join('\\n');
      return { title: document.title, html: html, blocks: blocks, nextChapter, prevChapter };
    })();
  `;
}

// Get site selectors for current hostname
function getSiteSelectors() {
  const hostname = getCurrentHostname();
  const rule = getSiteRule(hostname);
  return rule?.contentSelector ? rule.contentSelector.split(',').map(s => s.trim()) : [];
}

async function extractAndRead() {
  if (!state.webviewReady) return;

  // Pro gate
  if (!state.isPro) {
    showProRequiredToast();
    return;
  }

  dom.btnExtractRead.disabled = true;
  dom.btnExtractRead.style.opacity = '0.4';

  const extractScript = buildExtractScript(getSiteSelectors());

  try {
    const result = await dom.webview.executeJavaScript(extractScript);
    if (!result || !result.blocks || result.blocks.length === 0) {
      dom.btnExtractRead.disabled = false;
      dom.btnExtractRead.style.opacity = '';
      return;
    }

    state.extractedFromWeb = true;
    state.extractNextChapterUrl = result.nextChapter?.url || null;
    state.autoLoadingNext = false;
    const webUrl = dom.webview.getURL();

    switchMode('file');
    showContent({
      path: `web:${webUrl}`,
      name: result.title || webUrl,
      content: result.html,
      blocks: result.blocks,
      contentType: 'html',
      scrollPosition: 0,
    });

    dom.btnBackToWeb.classList.remove('hidden');
  } catch (e) {
    console.error('提取正文失败:', e);
  }

  dom.btnExtractRead.disabled = false;
  dom.btnExtractRead.style.opacity = '';
}

// Auto-append next chapter when scrolled to bottom (infinite scroll)
async function appendNextChapter() {
  if (state.autoLoadingNext || !state.extractNextChapterUrl) return;
  state.autoLoadingNext = true;

  // Show loading indicator at bottom
  const loader = document.createElement('div');
  loader.className = 'chapter-loading';
  loader.innerHTML = `
    <div class="chapter-loading-spinner"></div>
    <span>正在加载下一章...</span>
  `;
  dom.textContent.appendChild(loader);

  // Scroll loader into view
  loader.scrollIntoView({ behavior: 'smooth', block: 'end' });

  const url = state.extractNextChapterUrl;

  try {
    // Navigate hidden webview to next chapter
    dom.webview.src = url;

    // Wait for page to finish loading
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        dom.webview.removeEventListener('did-stop-loading', onLoad);
        reject(new Error('timeout'));
      }, 15000);
      const onLoad = () => {
        dom.webview.removeEventListener('did-stop-loading', onLoad);
        clearTimeout(timeout);
        // Delay for JS-rendered content
        setTimeout(resolve, 800);
      };
      dom.webview.addEventListener('did-stop-loading', onLoad);
    });

    const extractScript = buildExtractScript(getSiteSelectors());
    const result = await dom.webview.executeJavaScript(extractScript);

    // Remove loader
    loader.remove();

    if (result && result.blocks && result.blocks.length > 0) {
      // Add chapter separator
      const separator = document.createElement('div');
      separator.className = 'chapter-separator';
      separator.innerHTML = `<div class="chapter-separator-line"></div><div class="chapter-separator-title">${escapeHtml(result.title || '')}</div>`;
      dom.textContent.appendChild(separator);

      // Append new content
      const frag = document.createRange().createContextualFragment(result.html);
      dom.textContent.appendChild(frag);

      // Update state
      state.lines.push(...result.blocks);
      state.extractNextChapterUrl = result.nextChapter?.url || null;

      // Update title to current chapter
      dom.titleFilename.textContent = result.title || dom.titleFilename.textContent;
    } else {
      state.extractNextChapterUrl = null;
    }
  } catch (e) {
    console.error('自动加载下一章失败:', e);
    loader.remove();
    // Show error hint, don't block future attempts
    state.extractNextChapterUrl = null;
  }

  state.autoLoadingNext = false;
}

// ============ URL Navigation ============
function navigateToUrl(input) {
  if (!input) return;
  let url;
  if (/^https?:\/\//i.test(input)) {
    url = input;
  } else if (/^[\w-]+(\.[\w-]+)+/.test(input) && !input.includes(' ')) {
    url = 'https://' + input;
  } else {
    url = 'https://www.bing.com/search?q=' + encodeURIComponent(input);
  }
  dom.webview.src = url;
  dom.urlInput.value = url;
  dom.urlInput.blur();
  dom.webview.focus();
}

export function closeFile() {
  saveCurrentProgressNow();
  state.currentFile = null;
  state.lines = [];
  state.toc = [];
  state.currentLineIndex = 0;
  state.pendingScrollLineIndex = null;
  state.extractedFromWeb = false;
  state.extractNextChapterUrl = null;
  state.autoLoadingNext = false;

  dom.textContent.classList.remove('active');
  dom.textContent.classList.remove('html-content');
  dom.textContent.textContent = '';
  dom.textContent.innerHTML = '';
  dom.placeholder.style.display = '';
  dom.singleLineOverlay.classList.add('hidden');
  dom.singleLineText.textContent = '';
  dom.singleLineText.innerHTML = '';
  dom.readerContent.style.display = '';
  dom.readerContent.scrollTop = 0;
  dom.app.classList.toggle('immersive-empty', isImmersiveFileMode());
  dom.btnToc.classList.add('hidden');
  dom.tocDropdown.classList.add('hidden');
  dom.tocList.innerHTML = '';
  dom.tocEmpty.classList.remove('show');
  dom.btnCloseFile.classList.add('hidden');
  dom.btnBackToWeb.classList.add('hidden');
  dom.titleFilename.textContent = 'Hider - 拖入文件或点击文件夹图标打开';
  dom.progressFill.style.width = '0%';
  renderRecentFiles();
}

function afterReaderLayout(callback) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

function clampReadingLineIndex(lineIndex) {
  const maxIndex = Math.max(0, state.lines.length - 1);
  const value = Number(lineIndex) || 0;
  return Math.max(0, Math.min(value, maxIndex));
}

function getScrollLineIndex() {
  const el = dom.readerContent;
  const scrollHeight = el.scrollHeight - el.clientHeight;
  const ratio = scrollHeight > 0 ? el.scrollTop / scrollHeight : 0;
  return Math.round(ratio * Math.max(state.lines.length - 1, 0));
}

export function getCurrentReadingLineIndex() {
  if (Number.isFinite(state.pendingScrollLineIndex)) {
    return clampReadingLineIndex(state.pendingScrollLineIndex);
  }
  if (isLineLimitedMode()) {
    return clampReadingLineIndex(state.currentLineIndex);
  }
  return clampReadingLineIndex(getScrollLineIndex());
}

export function scrollReaderToLineIndex(lineIndex, { save = true } = {}) {
  const targetLineIndex = clampReadingLineIndex(lineIndex);
  state.currentLineIndex = targetLineIndex;
  state.pendingScrollLineIndex = targetLineIndex;

  afterReaderLayout(() => {
    const el = dom.readerContent;
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const ratio = targetLineIndex / Math.max(state.lines.length - 1, 1);
    el.scrollTop = Math.round(ratio * maxScrollTop);
    state.pendingScrollLineIndex = null;
    updateProgress();
    if (save) {
      saveCurrentProgressNow();
    }
  });
}

export function setLineLimitedPosition(lineIndex, { save = true } = {}) {
  const maxIndex = Math.max(0, state.lines.length - (state.settings.visibleLines || 1));
  state.currentLineIndex = Math.max(0, Math.min(clampReadingLineIndex(lineIndex), maxIndex));
  updateVisibleLines();
  updateProgress();
  if (save) {
    saveCurrentProgressNow();
  }
}

function restoreScrollPosition(saved) {
  afterReaderLayout(() => {
    const el = dom.readerContent;
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    let nextScrollTop = 0;

    if (typeof saved === 'number') {
      nextScrollTop = saved;
    } else if (saved?.type === 'scroll') {
      const value = Number(saved.value) || 0;
      const percent = Number(saved.percent);
      if (value > 0) {
        nextScrollTop = value;
      } else if (Number.isFinite(percent) && percent > 0) {
        nextScrollTop = Math.round(percent * maxScrollTop);
      }
    } else if (Number.isFinite(Number(saved?.percent))) {
      nextScrollTop = Math.round(Number(saved.percent) * maxScrollTop);
    }

    el.scrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    updateProgress();
  });
}

function restoreLinePosition(saved) {
  const maxIndex = Math.max(0, state.lines.length - (state.settings.visibleLines || 1));

  if (saved?.type === 'lines') {
    state.currentLineIndex = Math.max(0, Math.min(Number(saved.value) || 0, maxIndex));
    return;
  }

  const percent = Number(saved?.percent);
  if (Number.isFinite(percent)) {
    state.currentLineIndex = Math.max(0, Math.min(Math.round(percent * (state.lines.length - 1)), maxIndex));
  }
}

function normalizeTocTitle(title) {
  return (title || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[\s\-*·•]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
}

function isLikelyChapterTitle(line) {
  const text = normalizeTocTitle(line);
  if (!text || text.length > 80) return false;

  return (
    /^第[\d一二三四五六七八九十百千万零〇两壹贰叁肆伍陆柒捌玖拾佰仟]+[章节卷回部集篇].{0,50}$/.test(text) ||
    /^(正文\s*)?第[\d一二三四五六七八九十百千万零〇两]+[章回].{0,50}$/.test(text) ||
    /^(chapter|section|part|volume|book)\s+[\divxlcdm]+[\s:：.-].{0,60}$/i.test(text) ||
    /^#{1,6}\s+\S+/.test(line)
  );
}

function addTocEntry(entries, title, lineIndex) {
  const normalized = normalizeTocTitle(title);
  if (!normalized) return;
  if (entries.some(item => item.lineIndex === lineIndex || item.title === normalized)) return;
  entries.push({ title: normalized, lineIndex });
}

function buildPlainTextToc(lines) {
  const entries = [];

  lines.forEach((line, index) => {
    const text = String(line || '').trim();
    const next = String(lines[index + 1] || '').trim();

    if (/^[─\-_=]{6,}$/.test(text) && next) {
      addTocEntry(entries, next, index + 1);
      return;
    }

    if (isLikelyChapterTitle(text)) {
      addTocEntry(entries, text, index);
    }
  });

  return entries;
}

function buildHtmlToc(blocks) {
  return (blocks || []).reduce((entries, block, index) => {
    if (typeof block !== 'string') return entries;
    if (/^<h[1-6][\s>]/i.test(block.trim())) {
      addTocEntry(entries, stripHtmlToText(block), index);
    }
    return entries;
  }, []);
}

function buildToc(data) {
  if (data.contentType === 'html') {
    return buildHtmlToc(data.blocks || []);
  }
  return buildPlainTextToc(state.lines);
}

function renderToc() {
  dom.tocList.innerHTML = '';
  dom.tocEmpty.classList.toggle('show', state.toc.length === 0);
  dom.btnToc.classList.toggle('hidden', state.toc.length === 0);
  dom.tocDropdown.classList.add('hidden');

  state.toc.forEach((item, index) => {
    const entry = document.createElement('button');
    entry.className = 'toc-item';
    entry.type = 'button';
    entry.dataset.index = String(index);
    entry.innerHTML = `
      <span class="toc-item-title">${escapeHtml(item.title)}</span>
      <span class="toc-item-pos">${Math.round((item.lineIndex / Math.max(state.lines.length - 1, 1)) * 100)}%</span>
    `;
    entry.addEventListener('click', () => jumpToTocEntry(index));
    dom.tocList.appendChild(entry);
  });
}

function toggleTocDropdown() {
  if (state.toc.length === 0) return;
  const willShow = dom.tocDropdown.classList.contains('hidden');
  dom.tocDropdown.classList.toggle('hidden', !willShow);
  dom.btnToc.classList.toggle('active', willShow);
  if (willShow) updateTocActive();
}

function hideTocDropdown() {
  dom.tocDropdown.classList.add('hidden');
  dom.btnToc.classList.remove('active');
}

function getApproxCurrentLineIndex() {
  return getCurrentReadingLineIndex();
}

function updateTocActive() {
  if (!state.toc.length || !dom.tocList) return;
  const currentLine = getApproxCurrentLineIndex();
  let activeIndex = 0;

  state.toc.forEach((item, index) => {
    if (item.lineIndex <= currentLine) activeIndex = index;
  });

  dom.tocList.querySelectorAll('.toc-item').forEach((item, index) => {
    item.classList.toggle('active', index === activeIndex);
  });
}

function jumpToTocEntry(index) {
  const item = state.toc[index];
  if (!item) return;

  saveCurrentProgressNow();
  const targetLineIndex = clampReadingLineIndex(item.lineIndex);
  state.currentLineIndex = targetLineIndex;

  if (isLineLimitedMode()) {
    setLineLimitedPosition(targetLineIndex);
    hideTocDropdown();
    return;
  }

  scrollReaderToLineIndex(targetLineIndex);
  hideTocDropdown();
}

export function closeTocDropdown() {
  hideTocDropdown();
}

// ============ Content Display ============
export function showContent(data) {
  dom.placeholder.style.display = 'none';
  dom.textContent.classList.add('active');

  if (data.contentType === 'html') {
    dom.textContent.innerHTML = data.content;
    dom.textContent.classList.add('html-content');
    state.lines = data.blocks || [];
  } else {
    dom.textContent.textContent = data.content;
    dom.textContent.classList.remove('html-content');
    state.lines = data.content.split('\n').filter(l => l.trim().length > 0);
  }

  dom.titleFilename.textContent = data.name;
  dom.btnCloseFile.classList.remove('hidden');
  dom.app.classList.remove('immersive-empty');
  state.currentLineIndex = 0;
  state.toc = buildToc(data);
  renderToc();

  const saved = data.scrollPosition;
  if (saved) {
    if (isLineLimitedMode()) {
      restoreLinePosition(saved);
    } else {
      restoreScrollPosition(saved);
    }
  }

  if (isLineLimitedMode()) {
    updateVisibleLines();
    updateProgress();
  }
  updateTocActive();
}

export function navigateLine(direction) {
  const maxIndex = Math.max(0, state.lines.length - (state.settings.visibleLines || 1));
  state.currentLineIndex = Math.max(0, Math.min(maxIndex, state.currentLineIndex + direction));
  updateVisibleLines();
  updateProgress();
  debounceSaveProgress();
  updateTocActive();

  // Auto-load next chapter when near end (extract mode, single-line mode)
  if (state.extractedFromWeb && state.extractNextChapterUrl && !state.autoLoadingNext) {
    const remaining = state.lines.length - (state.currentLineIndex + (state.settings.visibleLines || 1));
    if (remaining <= 3) {
      appendNextChapter();
    }
  }
}

export function updateVisibleLines() {
  if (state.lines.length === 0) return;
  const count = state.settings.visibleLines || 1;
  const endIndex = Math.min(state.currentLineIndex + count, state.lines.length);
  const slice = state.lines.slice(state.currentLineIndex, endIndex);

  if (state.currentFile?.contentType === 'html') {
    dom.singleLineText.classList.add('html-content');
    dom.singleLineText.innerHTML = slice.join('');
  } else {
    dom.singleLineText.classList.remove('html-content');
    dom.singleLineText.textContent = slice.join('\n');
  }
}

export function updateProgress() {
  let progress = 0;
  if (isLineLimitedMode() && state.lines.length > 1) {
    progress = (state.currentLineIndex / (state.lines.length - 1)) * 100;
  } else {
    const el = dom.readerContent;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    progress = scrollHeight > 0 ? (el.scrollTop / scrollHeight) * 100 : 0;
  }
  dom.progressFill.style.width = `${progress}%`;
  updateTocActive();
}

export function convertReadingPosition(oldVisibleLines, callback) {
  if (!state.currentFile || state.lines.length === 0) { callback(); return; }
  if (oldVisibleLines === state.settings.visibleLines) { callback(); return; }

  if (!isImmersiveFileMode() && oldVisibleLines === 0 && state.settings.visibleLines > 0) {
    const scrollHeight = dom.readerContent.scrollHeight - dom.readerContent.clientHeight;
    if (scrollHeight > 0) {
      const ratio = dom.readerContent.scrollTop / scrollHeight;
      const maxIndex = Math.max(0, state.lines.length - state.settings.visibleLines);
      state.currentLineIndex = Math.min(Math.round(ratio * (state.lines.length - 1)), maxIndex);
    }
    callback();
  } else if (!isImmersiveFileMode() && oldVisibleLines > 0 && state.settings.visibleLines === 0) {
    const ratio = state.lines.length > 1 ? state.currentLineIndex / (state.lines.length - 1) : 0;
    callback();
    requestAnimationFrame(() => {
      const scrollHeight = dom.readerContent.scrollHeight - dom.readerContent.clientHeight;
      dom.readerContent.scrollTop = Math.round(ratio * scrollHeight);
      updateProgress();
    });
  } else {
    if (isLineLimitedMode()) {
      const maxIndex = Math.max(0, state.lines.length - state.settings.visibleLines);
      if (state.currentLineIndex > maxIndex) state.currentLineIndex = maxIndex;
    }
    callback();
  }
}

function getCurrentProgressEntry() {
  if (!state.currentFile) return;
  if (state.currentMode !== 'file') return;

  if (isLineLimitedMode()) {
    const percent = state.lines.length > 1 ? state.currentLineIndex / (state.lines.length - 1) : 0;
    return { type: 'lines', value: state.currentLineIndex, percent, updatedAt: Date.now() };
  }

  const scrollHeight = dom.readerContent.scrollHeight - dom.readerContent.clientHeight;
  const percent = scrollHeight > 0 ? dom.readerContent.scrollTop / scrollHeight : 0;
  return { type: 'scroll', value: dom.readerContent.scrollTop, percent, updatedAt: Date.now() };
}

export function saveCurrentProgressNow({ sync = false } = {}) {
  const entry = getCurrentProgressEntry();
  if (!entry || !state.currentFile?.path) return false;

  if (state.progressSaveTimeout) {
    clearTimeout(state.progressSaveTimeout);
    state.progressSaveTimeout = null;
  }

  const progress = { [state.currentFile.path]: entry };

  if (sync && typeof window.api.saveProgressSync === 'function') {
    try {
      window.api.saveProgressSync(progress);
      return true;
    } catch (error) {
      console.error('同步保存阅读进度失败:', error);
    }
  }

  window.api.saveProgress(progress);
  return true;
}

function debounceSaveProgress() {
  if (!state.currentFile) return;
  if (state.progressSaveTimeout) clearTimeout(state.progressSaveTimeout);
  state.progressSaveTimeout = setTimeout(() => {
    state.progressSaveTimeout = null;
    saveCurrentProgressNow();
  }, 500);
}

// ============ Bookmarks ============
function updateBookmarkButton() {
  if (!state.webviewReady || state.currentMode !== 'web') {
    dom.btnBookmark.classList.remove('bookmarked');
    return;
  }
  const url = dom.webview.getURL();
  const isBookmarked = state.bookmarks.some((b) => b.url === url);
  dom.btnBookmark.classList.toggle('bookmarked', isBookmarked);
}

function renderBookmarks() {
  dom.bookmarksList.innerHTML = '';
  dom.bookmarksEmpty.classList.toggle('show', state.bookmarks.length === 0);

  state.bookmarks.forEach((bm, index) => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.innerHTML = `
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(bm.title)}</div>
        <div class="bookmark-url">${escapeHtml(bm.url)}</div>
      </div>
      <button class="bookmark-delete" title="删除">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    item.querySelector('.bookmark-info').addEventListener('click', () => {
      navigateToUrl(bm.url);
      dom.bookmarksDropdown.classList.add('hidden');
      dom.btnBookmarksList.classList.remove('active');
    });

    item.querySelector('.bookmark-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      state.bookmarks.splice(index, 1);
      window.api.saveBookmarks(state.bookmarks);
      renderBookmarks();
      updateBookmarkButton();
    });

    dom.bookmarksList.appendChild(item);
  });
}

// ============ Reader Mode (web) ============
export async function toggleReaderMode() {
  if (!state.webviewReady || state.currentMode !== 'web') return;
  state.readerModeEnabled = !state.readerModeEnabled;

  if (state.readerModeEnabled) {
    await applyReaderMode();
  } else {
    await removeReaderMode();
  }

  document.getElementById('btn-reader-mode').classList.toggle('active', state.readerModeEnabled);
  dom.settingsPanel.classList.toggle('reader-mode', state.readerModeEnabled);
}

export async function applyReaderMode() {
  if (state.readerCssKey) {
    try { await dom.webview.removeInsertedCSS(state.readerCssKey); } catch (e) {}
    state.readerCssKey = null;
  }

  const hostname = getCurrentHostname();
  const rule = getSiteRule(hostname);

  // Determine effective display settings (per-site override > global)
  const fontSize = rule?.fontSize ?? state.settings.fontSize;
  const fontColor = rule?.fontColor ?? state.settings.fontColor;
  const lineHeight = rule?.lineHeight ?? state.settings.lineHeight;
  const bgColor = rule?.bgColor ?? state.settings.bgColor;
  const bgOpacity = rule?.bgOpacity ?? state.settings.bgOpacity;
  const overrideText = rule?.overrideTextColor !== false; // default true
  const overrideBg = rule?.overrideBgColor !== false;     // default true
  const hideImages = rule?.hideImages === true;

  // Site-specific selectors
  const extraRemoveSelectors = rule?.removeSelectors || '';
  const contentSelector = rule?.contentSelector || '';

  // Text color
  const textColorCss = overrideText ? `color: ${fontColor} !important;` : '';

  // Background color
  const bgRgb = hexToRgb(bgColor);
  const bgColorCss = overrideBg && bgRgb && !state.settings.hideBg
    ? `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${bgOpacity})`
    : '';

  const css = `
    /* === Hider Reader Mode === */

    /* 1. Remove fixed/sticky overlays (only with site rule) */
    ${contentSelector ? `
    *[style*="position: fixed"],
    *[style*="position:fixed"],
    *[style*="position: sticky"],
    *[style*="position:sticky"] {
      display: none !important;
    }
    ` : ''}

    /* 2. Remove common non-content elements (only with site rule) */
    ${contentSelector ? `
    header, footer, nav, aside,
    [role="banner"], [role="navigation"], [role="complementary"],
    iframe:not([src*="youtube"]):not([src*="bilibili"]),
    [class*="advert" i], [id*="advert" i],
    [class*="banner" i]:not(main *):not(article *),
    [class*="sidebar" i], [id*="sidebar" i],
    [class*="recommend" i], [id*="recommend" i],
    [class*="popup" i], [class*="modal" i],
    [class*="download-app" i], [class*="app-download" i],
    [class*="qrcode" i],
    [class*="comment" i]:not(main [class*="comment" i]),
    [class*="footer" i]:not(article [class*="footer" i]),
    [class*="toolbar" i]:not(main *):not(article *),
    [class*="toast" i], [class*="mask" i], [class*="overlay" i] {
      display: none !important;
    }
    ` : ''}

    /* 3. Site-specific element removal */
    ${extraRemoveSelectors ? `${extraRemoveSelectors} { display: none !important; }` : ''}

    /* 4. Page-level background & layout */
    html {
      ${bgColorCss ? `background: ${bgColorCss} !important;` : ''}
    }

    body {
      ${contentSelector ? `
      max-width: 800px !important;
      margin: 0 auto !important;
      padding: 20px 24px !important;
      ` : ''}
      ${bgColorCss ? `background: ${bgColorCss} !important;` : ''}
      ${textColorCss}
    }

    /* 5. Force reading styles on ALL text elements (key fix) */
    body, body p, body div, body span, body li, body td, body th,
    body dd, body dt, body blockquote, body pre, body a,
    body section, body article, body main, body label, body em, body strong {
      font-size: ${fontSize}px !important;
      line-height: ${lineHeight} !important;
      ${textColorCss}
    }

    /* Headings: keep slightly larger */
    body h1, body h2, body h3, body h4, body h5, body h6 {
      line-height: ${lineHeight} !important;
      ${textColorCss}
    }
    body h1 { font-size: ${Math.round(fontSize * 1.6)}px !important; }
    body h2 { font-size: ${Math.round(fontSize * 1.4)}px !important; }
    body h3 { font-size: ${Math.round(fontSize * 1.2)}px !important; }

    /* 6. Clear backgrounds on all inner elements */
    ${bgColorCss ? `
    body * {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    ` : ''}

    /* 7. Content scoping: make content area prominent */
    ${contentSelector ? `
    ${contentSelector} {
      display: block !important;
      visibility: visible !important;
      max-width: 800px !important;
      margin: 0 auto !important;
      padding: 0 !important;
      float: none !important;
      width: 100% !important;
      position: relative !important;
    }
    ` : ''}

    /* 8. Links readable but subtle */
    a { text-decoration: none !important; }
    a:hover { text-decoration: underline !important; }

    /* 9. Images */
    ${hideImages ? 'img, picture, video, figure, svg:not([class*="icon"]) { display: none !important; }' : ''}
    img { max-width: 100% !important; height: auto !important; }

  `;

  try {
    state.readerCssKey = await dom.webview.insertCSS(css);
  } catch (e) {
    console.error('Failed to inject reader mode CSS:', e);
  }
}

async function removeReaderMode() {
  if (state.readerCssKey) {
    try { await dom.webview.removeInsertedCSS(state.readerCssKey); } catch (e) {}
    state.readerCssKey = null;
  }
}

// ============ Recent Files ============
function renderRecentFiles() {
  window.api.loadRecentFiles().then((list) => {
    dom.recentFiles.innerHTML = '';
    if (!list || list.length === 0) return;

    const header = document.createElement('div');
    header.className = 'recent-header';
    header.textContent = '最近打开';
    dom.recentFiles.appendChild(header);

    list.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'recent-item';

      // File icon
      const ext = file.name.split('.').pop().toLowerCase();
      const iconSvg = ext === 'epub'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

      // Path: show parent directory
      const dir = file.path.replace(/[/\\][^/\\]+$/, '');

      item.innerHTML = `
        <div class="recent-item-icon">${iconSvg}</div>
        <div class="recent-item-info">
          <div class="recent-item-name">${escapeHtml(file.name)}</div>
          <div class="recent-item-path">${escapeHtml(dir)}</div>
        </div>
        <button class="recent-item-delete" title="移除">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      item.querySelector('.recent-item-info').addEventListener('click', () => {
        window.api.loadFilePath(file.path);
      });

      item.querySelector('.recent-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        window.api.removeRecentFile(file.path).then(() => renderRecentFiles());
      });

      dom.recentFiles.appendChild(item);
    });
  });
}

// ============ Pro Required Toast ============
function showProRequiredToast() {
  // Remove existing toast
  const existing = document.querySelector('.pro-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'pro-toast';
  toast.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
    <span>此功能需要 Pro 版 — 在设置 → 帮助中激活</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
