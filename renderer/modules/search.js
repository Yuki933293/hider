// Result helpers for Hider resource search. Real search fetching runs in main.js.
const TYPE_LABELS = {
  official: '官方',
  web: '网页',
  'cloud-resource': '网盘',
  forum: '社区',
  telegram: 'TG',
  'text-resource': '文本',
};

export function getSearchTypeLabel(type) {
  return TYPE_LABELS[type] || '资源';
}

export function getResultSourceLabel(result) {
  if (!result) return '未知来源';
  return result.sourceName || result.domain || '未知来源';
}

export function getFallbackSearchUrl(query) {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
}
