// adapter 注册表
//
// 说明：当前架构下 adapter 的提取逻辑运行在 webview 内部（通过
// executeJavaScript 注入），而非渲染进程直接访问 Document。
// 因此 adapter 需要实现 getInjectedScript() 返回可注入的脚本字符串。

import { qidianAdapter } from './qidian.js';

/** @type {import('./types.js').SiteAdapter[]} */
const adapters = [qidianAdapter];

/** @param {import('./types.js').SiteAdapter} adapter */
export function register(adapter) {
  if (adapters.some(a => a.id === adapter.id)) {
    throw new Error(`Adapter "${adapter.id}" already registered`);
  }
  adapters.push(adapter);
}

/**
 * 按 URL 查找匹配的 adapter。
 * @param {string} url
 * @returns {import('./types.js').SiteAdapter | null}
 */
export function findByUrl(url) {
  for (const a of adapters) {
    try {
      if (a.match(url)) return a;
    } catch {
      // adapter.match 抛错时继续下一个
    }
  }
  return null;
}

export function list() {
  return adapters.slice();
}
