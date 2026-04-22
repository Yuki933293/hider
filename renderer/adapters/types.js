// Phase 0 — 协议定义
//
// 本文件只定义 adapter 协议和 ReadingSession 数据结构，不含任何实现。
// Phase 1 起会有具体 adapter（如 qidian.js）按此协议实现。

/**
 * Block — 正文的最小显示单位。
 * 文件模式和网页模式提取后都输出成 Block 数组。
 * @typedef {Object} Block
 * @property {'paragraph'|'heading'|'separator'} type
 * @property {string} content 纯文本，不含 HTML 标签
 */

/**
 * ReadingSession — 工作台和浮层共享的阅读状态。
 * 存在主进程，通过 IPC 广播到两个 renderer。
 * 只存业务状态，不存 UI 状态（不存"设置面板开没开""按钮高亮"等）。
 *
 * @typedef {Object} ReadingSession
 * @property {'web'|'file'|null} sourceType 内容来源
 * @property {string|null} sourceUrl 网页来源 URL
 * @property {string|null} sourceFilePath 本地文件路径
 * @property {string} chapterTitle 当前章节标题
 * @property {Block[]} blocks 正文块数组
 * @property {string|null} nextChapterUrl 下一章链接
 * @property {{lineIndex?: number, scrollPosition?: number}} progress 阅读进度
 * @property {DisplaySettings} displaySettings 显示相关设置（字体、行高、颜色）
 * @property {boolean} textModeEnabled 浮层是否激活
 */

/**
 * DisplaySettings — 两窗口共享的显示设置（仅影响文字呈现）。
 * @typedef {Object} DisplaySettings
 * @property {number} fontSize
 * @property {string} fontColor
 * @property {number} fontOpacity
 * @property {number} lineHeight
 */

/**
 * ExtractResult — adapter.extractChapter 的返回值。
 * @typedef {Object} ExtractResult
 * @property {string} title 章节标题
 * @property {Block[]} blocks 标准化后的正文块
 */

/**
 * NextChapterResult — adapter.findNextChapter 的返回值。
 * @typedef {Object|null} NextChapterResult
 * @property {string} url 下一章绝对 URL
 * @property {string} [title] 下一章标题（可选）
 */

/**
 * SiteAdapter — 站点适配器协议。
 *
 * 每个站点实现一个 adapter 对象，通过 registry 注册。
 * adapter 只管 DOM 结构与内容抽取，不管视觉呈现。
 *
 * 所有方法都在 webview 内部的 document 上执行，
 * 通过 webview.executeJavaScript 注入 adapter 脚本后调用。
 *
 * @typedef {Object} SiteAdapter
 * @property {string} id 唯一标识，如 'qidian'
 * @property {string} name 用户可见名称，如 '起点中文网'
 *
 * @property {(url: string) => boolean} match
 *   判断当前 URL 是否属于该 adapter。
 *   例：qidian adapter 匹配 qidian.com 的所有子域。
 *
 * @property {(document: Document) => ExtractResult} extractChapter
 *   从当前页面 DOM 中提取章节标题和正文。
 *   blocks 必须已经是标准化的（段落、标题、分隔符），不含站点特有结构。
 *
 * @property {(document: Document) => NextChapterResult} findNextChapter
 *   在当前页面 DOM 中寻找"下一章"链接。
 *   返回 null 表示已是最后一章或无法识别。
 *
 * @property {(document: Document) => boolean} shouldShowEnterTextMode
 *   判断当前页面是否处于"章节阅读状态"，是否应显示"进入纯文字模式"入口。
 *   例：起点书籍详情页返回 false，章节页返回 true。
 *
 * @property {(blocks: Block[]) => Block[]} [postProcessBlocks]
 *   可选。站点特有的块清洗，如去广告块、合并断句、去除尾注。
 *   默认为 identity 函数。
 */

export const BLOCK_TYPES = Object.freeze({
  PARAGRAPH: 'paragraph',
  HEADING: 'heading',
  SEPARATOR: 'separator',
});
