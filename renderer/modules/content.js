// Content display, web mode, bookmarks, reader mode, site rules
import { state, dom, hexToRgb, escapeHtml } from './state.js';
import { getFallbackSearchUrl, getResultSourceLabel, getSearchTypeLabel } from './search.js';

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
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === state.currentMode && btn.dataset.mode === 'web') {
        showSearchHome();
        return;
      }
      switchMode(btn.dataset.mode);
    });
  });

  // URL input
  dom.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideSearchHistoryDropdown();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateToUrl(dom.urlInput.value.trim());
    }
  });
  dom.urlInput.addEventListener('focus', () => renderSearchHistoryDropdown());
  dom.urlInput.addEventListener('input', () => renderSearchHistoryDropdown());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#url-input-wrapper')) hideSearchHistoryDropdown();
  });

  window.api.loadSearchHistory?.().then((items) => {
    state.searchHistory = Array.isArray(items) ? items : [];
    renderSearchHistoryDropdown();
  }).catch(() => {});

  renderWebSearchPanel('');

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

  dom.readerContent.addEventListener('wheel', handleImmersiveWheel, { passive: false });
  dom.singleLineOverlay.addEventListener('wheel', handleLineLimitedWheel, { passive: false });
  document.addEventListener('mousemove', handleImmersivePointerMove, true);
  document.addEventListener('mouseleave', handleImmersivePointerLeave, true);
  window.addEventListener('blur', handleImmersivePointerLeave);

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
    dom.app.classList.add('search-mode');
    showSearchHome();
    dom.urlInput.focus();
  } else {
    dom.urlBar.classList.add('hidden');
    dom.webview.classList.add('hidden');
    dom.app.classList.remove('search-mode', 'search-home');
    hideWebSearchPanel();
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
      renderRecentFiles();
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
function isProbablyUrl(input) {
  return /^https?:\/\//i.test(input) || (/^[\w-]+(\.[\w-]+)+/.test(input) && !input.includes(' '));
}

function normalizeUrl(input) {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}


function showSearchHome() {
  dom.app.classList.add('search-home');
  dom.webview.classList.add('hidden');
  dom.urlInput.value = '';
  dom.urlInput.placeholder = '输入关键词搜索全网资源...';
  dom.titleFilename.textContent = 'Hider - 资源搜索';
  showWebSearchPanel('');
}

function showWebSearchPanel(query = dom.urlInput.value.trim()) {
  dom.app.classList.add('search-home');
  renderWebSearchPanel(isProbablyUrl(query) ? '' : query);
  dom.webSearchPanel?.classList.remove('hidden');
}

function hideWebSearchPanel() {
  dom.webSearchPanel?.classList.add('hidden');
  dom.app.classList.remove('search-home');
  hideSearchHistoryDropdown();
}

let webSearchRequestId = 0;

function normalizeSearchHistoryQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function isSearchInputActive() {
  return document.activeElement === dom.urlInput && state.currentMode === 'web';
}

function hideSearchHistoryDropdown() {
  dom.searchHistoryDropdown?.classList.add('hidden');
}

function renderSearchHistoryDropdown({ force = false } = {}) {
  if (!dom.searchHistoryDropdown || (!force && !isSearchInputActive())) return;
  const filter = normalizeSearchHistoryQuery(dom.urlInput.value).toLowerCase();
  const items = (state.searchHistory || [])
    .filter((item) => !filter || item.query.toLowerCase().includes(filter))
    .slice(0, 8);

  if (!items.length) {
    dom.searchHistoryDropdown.classList.add('hidden');
    dom.searchHistoryDropdown.innerHTML = '';
    return;
  }

  dom.searchHistoryDropdown.innerHTML = `
    <div class="search-history-header">
      <span>最近搜索</span>
      <button type="button" class="search-history-clear">清空</button>
    </div>
    ${items.map((item, index) => `
      <div class="search-history-item" data-history-index="${index}">
        <button type="button" class="search-history-query" title="重新搜索 ${escapeHtml(item.query)}">
          <span class="search-history-clock" aria-hidden="true">↺</span>
          <span class="search-history-text">${escapeHtml(item.query)}</span>
        </button>
        <button type="button" class="search-history-remove" title="删除这条历史" aria-label="删除搜索历史">×</button>
      </div>`).join('')}`;

  dom.searchHistoryDropdown.classList.remove('hidden');
  dom.searchHistoryDropdown.querySelector('.search-history-clear')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.searchHistory = await window.api.clearSearchHistory();
    renderSearchHistoryDropdown({ force: true });
  });
  dom.searchHistoryDropdown.querySelectorAll('.search-history-item').forEach((row) => {
    const item = items[Number(row.dataset.historyIndex)];
    row.querySelector('.search-history-query')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.urlInput.value = item.query;
      hideSearchHistoryDropdown();
      navigateToUrl(item.query);
    });
    row.querySelector('.search-history-remove')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.searchHistory = await window.api.removeSearchHistoryQuery(item.query);
      renderSearchHistoryDropdown({ force: true });
    });
  });
}

async function rememberSearchQuery(query) {
  const normalized = normalizeSearchHistoryQuery(query);
  if (!normalized || isProbablyUrl(normalized)) return;
  const key = normalized.toLowerCase();
  state.searchHistory = [
    { query: normalized, updatedAt: Date.now() },
    ...(state.searchHistory || []).filter((item) => item.query.toLowerCase() !== key),
  ].slice(0, 50);
  renderSearchHistoryDropdown({ force: true });
  try {
    state.searchHistory = await window.api.addSearchHistoryQuery(normalized);
  } catch (e) {}
}

async function renderWebSearchPanel(query = '') {
  if (!dom.webSourceList) return;
  const normalized = query.trim();
  const requestId = ++webSearchRequestId;

  if (!normalized) {
    dom.webSourceList.innerHTML = `
      <div class="web-search-empty">
        <span class="web-search-empty-title">输入关键词</span>
        <span class="web-search-empty-desc">Hider 会直接返回相关网页链接，不再展示搜索源入口。</span>
      </div>`;
    return;
  }

  dom.webSourceList.innerHTML = `
    <div class="web-search-empty web-search-loading">
      <span class="web-search-empty-title">正在搜索</span>
      <span class="web-search-empty-desc">正在从本机请求搜索结果并整理真实链接...</span>
    </div>`;

  try {
    const payload = await window.api.searchResources(normalized);
    if (requestId !== webSearchRequestId) return;
    const results = Array.isArray(payload?.results) ? payload.results : [];

    if (!payload?.ok || !results.length) {
      renderSearchFallback(normalized, payload?.error || '暂时没有解析到结果');
      return;
    }

    dom.webSourceList.innerHTML = results.map((result) => renderSearchResult(result)).join('');
    bindSearchResultClicks();
  } catch (error) {
    if (requestId !== webSearchRequestId) return;
    renderSearchFallback(normalized, error?.message || '搜索失败');
  }
}

function renderSearchResult(result) {
  const sourceLabel = getResultSourceLabel(result);
  const typeLabel = getSearchTypeLabel(result.type);
  const url = result.url || '';
  return `
    <button class="web-result-item" data-result-url="${escapeHtml(url)}">
      <span class="web-result-main">
        <span class="web-result-title">${escapeHtml(result.title || url)}</span>
        <span class="web-result-source">${escapeHtml(sourceLabel)}</span>
      </span>
      <span class="web-result-meta">
        <span>${escapeHtml(typeLabel)}</span>
        <span>${escapeHtml(result.engine || '搜索')}</span>
        <span>${escapeHtml(result.categoryLabel || '')}</span>
      </span>
      <span class="web-result-url">${escapeHtml(url)}</span>
      <span class="web-result-desc">${escapeHtml(result.snippet || result.description || '')}</span>
      <span class="web-result-action">打开链接</span>
    </button>`;
}

function renderSearchFallback(query, reason) {
  const fallbackUrl = getFallbackSearchUrl(query);
  dom.webSourceList.innerHTML = `
    <div class="web-search-empty">
      <span class="web-search-empty-title">没有解析到结果</span>
      <span class="web-search-empty-desc">${escapeHtml(reason)}，可以先打开搜索页查看。</span>
    </div>
    <button class="web-result-item" data-result-url="${escapeHtml(fallbackUrl)}">
      <span class="web-result-main">
        <span class="web-result-title">${escapeHtml(query)}</span>
        <span class="web-result-source">Bing 全网</span>
      </span>
      <span class="web-result-meta"><span>备用</span><span>搜索结果页</span></span>
      <span class="web-result-url">${escapeHtml(fallbackUrl)}</span>
      <span class="web-result-desc">解析失败时打开搜索引擎结果页。</span>
      <span class="web-result-action">打开搜索页</span>
    </button>`;
  bindSearchResultClicks();
}

function bindSearchResultClicks() {
  dom.webSourceList.querySelectorAll('.web-result-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.resultUrl;
      if (!url) return;
      openWebUrl(url);
    });
  });
}

function openWebUrl(url) {
  hideWebSearchPanel();
  dom.webview.classList.remove('hidden');
  dom.webview.src = url;
  dom.urlInput.value = url;
  dom.urlInput.blur();
  dom.webview.focus();
}

function navigateToUrl(input) {
  if (!input) {
    showSearchHome();
    return;
  }
  if (/^https?:\/\//i.test(input)) {
    openWebUrl(normalizeUrl(input));
    return;
  }

  rememberSearchQuery(input);
  hideSearchHistoryDropdown();
  dom.webview.classList.add('hidden');
  showWebSearchPanel(input);
  dom.titleFilename.textContent = `Hider - 资源搜索：${input}`;
}

const IMMERSIVE_DEFAULT_LINES = 1;
const IMMERSIVE_WHEEL_ANIMATION_MS = 190;
const IMMERSIVE_WHEEL_GESTURE_IDLE_MS = 180;
const LINE_LIMITED_WHEEL_THRESHOLD_PX = 80;
const LINE_LIMITED_WHEEL_IDLE_MS = 160;

let immersiveWheelFrame = null;
let immersiveScrollAnimationFrame = null;
let immersiveWheelGestureTimer = null;
let immersiveWheelGestureLocked = false;
let lineLimitedWheelDelta = 0;
let lineLimitedWheelTimer = null;
let immersiveLayoutFrame = null;
let immersiveMouseRegion = {
  enabled: false,
  interactive: true,
};
let lastImmersivePointer = null;
let immersiveLineMetrics = {
  lineStep: 1,
  paddingY: 0,
};

function cancelImmersiveScrollAnimation() {
  if (immersiveScrollAnimationFrame !== null) {
    window.cancelAnimationFrame(immersiveScrollAnimationFrame);
    immersiveScrollAnimationFrame = null;
  }
}

function resetImmersiveWheelGesture() {
  immersiveWheelGestureLocked = false;
  if (immersiveWheelGestureTimer !== null) {
    window.clearTimeout(immersiveWheelGestureTimer);
    immersiveWheelGestureTimer = null;
  }
  if (immersiveWheelFrame !== null) {
    window.cancelAnimationFrame(immersiveWheelFrame);
    immersiveWheelFrame = null;
  }
  cancelImmersiveScrollAnimation();
}

function getImmersiveVisibleLines() {
  return Math.max(1, Math.min(8, Number(state.settings.immersiveLines) || IMMERSIVE_DEFAULT_LINES));
}

function getImmersiveFallbackLineHeightPx() {
  const fontSize = state.settings.immersiveFontSize || state.settings.fontSize || 16;
  const lineHeight = state.settings.immersiveLineHeight || state.settings.lineHeight || 1.8;
  return Math.max(1, fontSize * lineHeight);
}

function alignImmersivePx(value) {
  return Math.max(1, Math.ceil(Number(value) || getImmersiveFallbackLineHeightPx()));
}

function getImmersiveLineHeightPx() {
  return Math.max(1, immersiveLineMetrics.lineStep || alignImmersivePx(getImmersiveFallbackLineHeightPx()));
}

function measureImmersiveLineStep() {
  const source = dom.textContent?.classList.contains('active')
    ? dom.textContent
    : dom.placeholder?.querySelector('p') || dom.textContent;
  if (!source || !document.body) {
    return alignImmersivePx(getImmersiveFallbackLineHeightPx());
  }

  const computed = window.getComputedStyle(source);
  const probe = document.createElement('div');
  const width = Math.max(1, Math.floor(dom.readerContent?.clientWidth || source.clientWidth || 300) - 16);

  Object.assign(probe.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    left: '-9999px',
    top: '-9999px',
    width: `${width}px`,
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontStyle: computed.fontStyle,
    fontWeight: computed.fontWeight,
    letterSpacing: computed.letterSpacing,
    lineHeight: computed.lineHeight === 'normal'
      ? String(state.settings.immersiveLineHeight || state.settings.lineHeight || 1.8)
      : computed.lineHeight,
    whiteSpace: 'pre-wrap',
    wordBreak: computed.wordBreak,
    overflowWrap: computed.overflowWrap,
    wordWrap: computed.wordWrap,
  });

  probe.innerHTML = '<span data-line-a>国M</span><br><span data-line-b>国M</span>';
  document.body.appendChild(probe);

  const first = probe.querySelector('[data-line-a]');
  const second = probe.querySelector('[data-line-b]');
  const firstRect = first?.getBoundingClientRect();
  const secondRect = second?.getBoundingClientRect();
  const measured = firstRect && secondRect ? secondRect.top - firstRect.top : 0;
  const parsed = Number.parseFloat(computed.lineHeight);

  probe.remove();
  return alignImmersivePx(measured || parsed || getImmersiveFallbackLineHeightPx());
}

function measureImmersiveLineMetrics() {
  const lineStep = measureImmersiveLineStep();
  return { lineStep, paddingY: 0 };
}

function applyImmersiveLineMetrics(metrics) {
  immersiveLineMetrics = metrics;
  const lines = getImmersiveVisibleLines();
  const height = metrics.lineStep * lines;
  const root = document.documentElement;
  root.style.setProperty('--immersive-line-height-px', `${metrics.lineStep}px`);
  root.style.setProperty('--immersive-padding-y', '0px');
  root.style.setProperty('--immersive-height', `${height}px`);
}

function getSnappedImmersiveTop(rawTop) {
  const lineHeight = getImmersiveLineHeightPx();
  const el = dom.readerContent;
  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  const maxSnappedTop = Math.floor(maxScrollTop / lineHeight) * lineHeight;
  const snapped = Math.round(rawTop / lineHeight) * lineHeight;
  return Math.max(0, Math.min(snapped, maxSnappedTop));
}

function snapImmersiveScrollToLine({ save = true } = {}) {
  if (!isImmersiveFileMode()) return;
  const el = dom.readerContent;
  el.scrollTop = getSnappedImmersiveTop(el.scrollTop);
  updateProgress();
  if (save) debounceSaveProgress();
}

function releaseImmersiveWheelGesture() {
  immersiveWheelGestureLocked = false;
  immersiveWheelGestureTimer = null;
}

function holdImmersiveWheelGesture() {
  if (immersiveWheelGestureTimer !== null) {
    window.clearTimeout(immersiveWheelGestureTimer);
  }
  immersiveWheelGestureTimer = window.setTimeout(
    releaseImmersiveWheelGesture,
    IMMERSIVE_WHEEL_GESTURE_IDLE_MS,
  );
}

function animateImmersiveScrollTo(targetTop, { save = true } = {}) {
  const el = dom.readerContent;
  const snappedTarget = getSnappedImmersiveTop(targetTop);
  const startTop = el.scrollTop;
  const distance = snappedTarget - startTop;

  cancelImmersiveScrollAnimation();

  if (Math.abs(distance) < 0.5) {
    el.scrollTop = snappedTarget;
    updateProgress();
    if (save) debounceSaveProgress();
    return true;
  }

  const startAt = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const tick = (now) => {
    const progress = Math.min(1, (now - startAt) / IMMERSIVE_WHEEL_ANIMATION_MS);
    el.scrollTop = startTop + distance * easeOutCubic(progress);
    updateProgress();

    if (progress < 1) {
      immersiveScrollAnimationFrame = window.requestAnimationFrame(tick);
      return;
    }

    el.scrollTop = snappedTarget;
    immersiveScrollAnimationFrame = null;
    updateProgress();
    if (save) debounceSaveProgress();
  };

  immersiveScrollAnimationFrame = window.requestAnimationFrame(tick);
  return true;
}

export function navigateImmersiveLines(deltaLines, { save = true, animate = false } = {}) {
  if (!isImmersiveFileMode() || !state.currentFile) return false;

  const el = dom.readerContent;
  const lineHeight = getImmersiveLineHeightPx();
  const currentLine = Math.round(el.scrollTop / lineHeight);
  const nextTop = getSnappedImmersiveTop((currentLine + deltaLines) * lineHeight);

  if (animate) {
    return animateImmersiveScrollTo(nextTop, { save });
  }

  cancelImmersiveScrollAnimation();
  el.scrollTop = nextTop;
  updateProgress();
  if (save) debounceSaveProgress();
  return true;
}

function normalizeWheelDeltaY(e) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * getImmersiveLineHeightPx();
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * dom.readerContent.clientHeight;
  return e.deltaY;
}

function normalizeLineLimitedWheelDeltaY(e) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * LINE_LIMITED_WHEEL_THRESHOLD_PX;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * dom.singleLineOverlay.clientHeight;
  return e.deltaY;
}

function resetLineLimitedWheelGesture() {
  lineLimitedWheelDelta = 0;
  if (lineLimitedWheelTimer !== null) {
    window.clearTimeout(lineLimitedWheelTimer);
    lineLimitedWheelTimer = null;
  }
}

function handleLineLimitedWheel(e) {
  if (!isLineLimitedMode() || !state.currentFile) return;
  e.preventDefault();

  const deltaY = normalizeLineLimitedWheelDeltaY(e);
  if (!deltaY) return;

  lineLimitedWheelDelta += deltaY;
  if (lineLimitedWheelTimer !== null) {
    window.clearTimeout(lineLimitedWheelTimer);
  }
  lineLimitedWheelTimer = window.setTimeout(resetLineLimitedWheelGesture, LINE_LIMITED_WHEEL_IDLE_MS);

  if (Math.abs(lineLimitedWheelDelta) < LINE_LIMITED_WHEEL_THRESHOLD_PX) return;

  const direction = Math.sign(lineLimitedWheelDelta);
  resetLineLimitedWheelGesture();
  navigateLine(direction);
}

function handleImmersiveWheel(e) {
  if (!isImmersiveFileMode() || !state.currentFile) return;
  e.preventDefault();

  const deltaY = normalizeWheelDeltaY(e);
  const direction = Math.sign(deltaY);
  if (!direction) return;

  holdImmersiveWheelGesture();

  if (immersiveWheelGestureLocked || immersiveWheelFrame !== null) return;
  immersiveWheelGestureLocked = true;

  immersiveWheelFrame = window.requestAnimationFrame(() => {
    immersiveWheelFrame = null;
    const stepLines = e.shiftKey ? getImmersiveVisibleLines() : 1;
    const moved = navigateImmersiveLines(direction * stepLines, { animate: true });
    if (!moved) resetImmersiveWheelGesture();
  });
}

function setImmersiveMouseRegion(enabled, interactive) {
  const next = { enabled: !!enabled, interactive: interactive !== false };
  if (
    immersiveMouseRegion.enabled === next.enabled &&
    immersiveMouseRegion.interactive === next.interactive
  ) {
    return;
  }

  immersiveMouseRegion = next;
  const updatePromise = window.api?.setImmersiveMouseRegion?.(next);
  if (updatePromise?.catch) {
    updatePromise.catch((error) => {
      console.warn('Failed to update immersive mouse region:', error);
    });
  }
}

function isPointerInsideImmersiveRegion(point) {
  if (!point || !dom.readerContent) return true;
  const rect = dom.readerContent.getBoundingClientRect();
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

export function syncImmersiveMouseRegionFromEvent(event) {
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    lastImmersivePointer = { x: event.clientX, y: event.clientY };
  }

  if (!isImmersiveFileMode()) {
    setImmersiveMouseRegion(false, true);
    return;
  }

  setImmersiveMouseRegion(true, isPointerInsideImmersiveRegion(lastImmersivePointer));
}

function handleImmersivePointerMove(event) {
  syncImmersiveMouseRegionFromEvent(event);
}

function handleImmersivePointerLeave() {
  if (isImmersiveFileMode()) {
    setImmersiveMouseRegion(true, false);
  } else {
    setImmersiveMouseRegion(false, true);
  }
}

function refreshImmersiveLayoutNow({ snap = false } = {}) {
  if (!isImmersiveFileMode()) {
    setImmersiveMouseRegion(false, true);
    return;
  }

  applyImmersiveLineMetrics(measureImmersiveLineMetrics());
  if (snap) {
    snapImmersiveScrollToLine({ save: false });
  }
  syncImmersiveMouseRegionFromEvent();
}

export function scheduleImmersiveLayoutRefresh({ snap = false } = {}) {
  if (immersiveLayoutFrame !== null) {
    window.cancelAnimationFrame(immersiveLayoutFrame);
  }

  immersiveLayoutFrame = window.requestAnimationFrame(() => {
    immersiveLayoutFrame = window.requestAnimationFrame(() => {
      immersiveLayoutFrame = null;
      refreshImmersiveLayoutNow({ snap });
    });
  });
}

export function closeFile() {
  resetImmersiveWheelGesture();
  resetLineLimitedWheelGesture();
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

export function captureReaderScrollAnchor() {
  if (!state.currentFile) return null;

  const el = dom.readerContent;
  const scrollHeight = Math.max(0, el.scrollHeight - el.clientHeight);
  const scrollTop = Math.max(0, el.scrollTop);

  return {
    scrollTop,
    percent: scrollHeight > 0 ? scrollTop / scrollHeight : 0,
  };
}

export function restoreReaderScrollAnchor(anchor, { save = true } = {}) {
  if (!anchor) return false;

  afterReaderLayout(() => {
    const el = dom.readerContent;
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const percent = Number(anchor.percent);
    const fallbackTop = Number(anchor.scrollTop) || 0;
    const targetTop = Number.isFinite(percent)
      ? Math.max(0, Math.min(percent, 1)) * maxScrollTop
      : fallbackTop;

    el.scrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));
    if (isImmersiveFileMode()) {
      el.scrollTop = getSnappedImmersiveTop(el.scrollTop);
    }
    state.pendingScrollLineIndex = null;
    updateProgress();
    if (save) {
      saveCurrentProgressNow();
    }
  });

  return true;
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
    const targetTop = Math.round(ratio * maxScrollTop);
    el.scrollTop = isImmersiveFileMode() ? getSnappedImmersiveTop(targetTop) : targetTop;
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

    const clampedTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    el.scrollTop = isImmersiveFileMode() ? getSnappedImmersiveTop(clampedTop) : clampedTop;
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
  resetLineLimitedWheelGesture();
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
  if (isImmersiveFileMode()) {
    scheduleImmersiveLayoutRefresh({ snap: false });
  }

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
export function renderRecentFiles() {
  if (!dom.recentFiles) return Promise.resolve([]);

  return window.api.loadRecentFiles().then((list) => {
    dom.recentFiles.innerHTML = '';
    if (!list || list.length === 0) return [];

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

    return list;
  }).catch((error) => {
    console.warn('Failed to render recent files:', error);
    dom.recentFiles.innerHTML = '';
    return [];
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
    <span>此功能暂未开放</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
