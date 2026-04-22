// Phase 1 — 起点 adapter
//
// 覆盖：www.qidian.com / read.qidian.com / vipreader.qidian.com / m.qidian.com
//
// 结构说明：
// - hostPart（在渲染进程侧运行）：id / name / match / getInjectedScript
// - injected（序列化后在 webview 内运行）：提取逻辑
//
// 现阶段 injected 部分不直接依赖 types.js 的 BLOCK_TYPES 常量，因为
// 序列化后常量会丢失。用字面量 'paragraph' / 'heading' / 'separator'。

function buildInjectedScript() {
  // 这个 IIFE 会被字符串化后通过 webview.executeJavaScript 执行。
  // 返回值通过 Promise resolve 回渲染进程。
  // 约束：不能引用外部变量，不能用 import，所有工具函数就地定义。
  return `
    (function() {
      function absUrl(href) {
        try { return new URL(href, location.href).href; } catch { return href; }
      }

      function normalizeText(t) {
        return (t || '').replace(/\\u3000/g, ' ').replace(/\\s+/g, ' ').trim();
      }

      // --- 章节容器定位 ---
      // 起点三个站点 DOM 各异，按优先级尝试
      const containerSelectors = [
        '.j_readContent',         // read.qidian.com / vipreader
        '.read-content',          // www.qidian.com 章节页
        '.text-wrap',             // 备用
        '.main-text-wrap',        // 章节页新版
        '#readerFrame .content',  // 部分版本
        '.read-section',          // m.qidian.com
      ];
      let container = null;
      for (const sel of containerSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 100) { container = el; break; }
      }

      // --- shouldShowEnterTextMode 判定 ---
      // 起点章节页 URL 通常是 /chapter/数字/数字 或 /book/数字/数字
      // 详情页、书架页、搜索页等不具备章节容器
      const isChapterPage = !!container;

      if (!isChapterPage) {
        return {
          ok: false,
          reason: 'not-chapter-page',
          isChapterPage: false,
        };
      }

      // --- 章节标题 ---
      const titleSelectors = [
        '.j_chapterName',
        '.text-head h1',
        '.chapter-title',
        'h1.title',
        '.main-text-wrap h1',
      ];
      let title = '';
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          title = normalizeText(el.textContent);
          break;
        }
      }
      if (!title) title = normalizeText(document.title);

      // --- 噪声清理 ---
      const clone = container.cloneNode(true);
      const noiseSelectors = [
        'script', 'style', 'iframe',
        '.review-wrap', '.chapter-control', '.admire-wrap',
        '.j_pleaseLogin', '.lang', '.chapter-prompt-wrap',
        '.fans-interact', '.card-interact', '.author-promote',
        '.chapter-end-mark', '.recommend-wrap',
        '.dashang', '.pinglun', '.cd-wrap',
      ];
      clone.querySelectorAll(noiseSelectors.join(',')).forEach(n => n.remove());

      // --- blocks 抽取 ---
      // 起点章节以 <p> 为主，偶有 <div> 裸段落。
      const blocks = [];
      const paragraphs = clone.querySelectorAll('p, h1, h2, h3, h4');
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const text = normalizeText(p.textContent);
          if (!text || text.length < 2) return;
          const tag = p.tagName.toLowerCase();
          const type = /^h[1-4]$/.test(tag) ? 'heading' : 'paragraph';
          blocks.push({ type, content: text });
        });
      } else {
        // fallback：按换行拆 textContent
        const raw = normalizeText(clone.textContent);
        raw.split(/\\n+/).forEach(line => {
          const t = line.trim();
          if (t.length > 2) blocks.push({ type: 'paragraph', content: t });
        });
      }

      // --- 下一章链接 ---
      // 起点的下一章按钮通常带 class 或明确文本
      const nextSelectors = [
        '#j_chapterNext',
        '.j_chapterNext',
        'a.chapter-next',
        '[data-chapter-next]',
      ];
      let nextUrl = null;
      for (const sel of nextSelectors) {
        const a = document.querySelector(sel);
        if (a && a.href && !a.classList.contains('disabled')) {
          nextUrl = absUrl(a.getAttribute('href'));
          break;
        }
      }
      // 再 fallback：文本匹配
      if (!nextUrl) {
        const links = document.querySelectorAll('a[href]');
        for (const a of links) {
          const t = normalizeText(a.textContent);
          if (t === '下一章' || t === '下一页' || t === '下一节') {
            if (!a.classList.contains('disabled')) {
              nextUrl = absUrl(a.getAttribute('href'));
              break;
            }
          }
        }
      }

      return {
        ok: true,
        isChapterPage: true,
        title,
        blocks,
        nextChapter: nextUrl ? { url: nextUrl } : null,
      };
    })();
  `;
}

/** @type {import('./types.js').SiteAdapter} */
export const qidianAdapter = {
  id: 'qidian',
  name: '起点中文网',

  match(url) {
    try {
      const h = new URL(url).hostname;
      return /(^|\.)qidian\.com$/i.test(h);
    } catch {
      return false;
    }
  },

  // 注意：extractChapter / findNextChapter / shouldShowEnterTextMode 在当前架构下
  // 不直接在渲染进程调用 Document，而是通过 getInjectedScript() 注入到 webview。
  // 这些 stub 存在是为了符合协议类型；调用方应该用 runExtraction() 便捷方法。
  extractChapter() {
    throw new Error('Use runExtraction(webview) instead — adapter runs inside webview');
  },
  findNextChapter() {
    throw new Error('Use runExtraction(webview) instead');
  },
  shouldShowEnterTextMode() {
    throw new Error('Use runExtraction(webview) instead');
  },

  /**
   * 在渲染进程侧调用，返回可注入 webview 的脚本字符串。
   * Phase 2 会统一由 content.js 调用 webview.executeJavaScript(script)。
   */
  getInjectedScript: buildInjectedScript,
};
