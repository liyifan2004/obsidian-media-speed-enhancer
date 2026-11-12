/**
 * 按钮外观（透明度）的 CSS 变量写入。
 *
 * ## 为什么单独抽出来
 *
 * 这段逻辑原先写在设置页里（`display()` 的末尾 + 滑块的 onChange），
 * 有一个结构性问题：**CSS 变量是插件渲染层的东西，不该由设置页负责**。
 *
 * 后果是 2026-11-12 实测发现的两个缺陷：
 *
 * 1. **用户没打开过设置页，按钮透明度就是错的。**
 *    变量只在设置页渲染时才写入，而设置页是用户主动打开才渲染的。
 *    插件加载完、用户直接去听音频时，变量还没写 —— 按钮一律用
 *    CSS 里的 fallback 值（0.06 / 0.16）。
 * 2. **Obsidian 1.13+ 上永远写不进去。**
 *    1.13+ 完全不调用 `display()`，写变量的那行代码根本不执行。
 *
 * 正解：变量由插件在 `onload` 时写一次，之后由设置页在值变化时更新。
 * 「谁拥有这个状态，谁负责把它写出去」—— 外观设置归插件管。
 *
 * ## 为什么是纯函数
 *
 * 本文件不 import obsidian、不碰 DOM，
 * 因此可以直接被单测验证「写出去的数值对不对」。
 */

/** CSS 变量的最小接口 —— 真实 DOM 与测试桩都满足它。 */
export interface StyleTarget {
  setProperty(name: string, value: string): void;
}

/** 按钮背景透明度对应的 CSS 变量名 */
export const CSS_VAR_BG_OPACITY = "--mse-btn-opacity";
/** 按钮 hover 背景透明度对应的 CSS 变量名 */
export const CSS_VAR_HOVER_OPACITY = "--mse-btn-hover-opacity";

/**
 * 把透明度设置换算成 CSS 变量的值。
 *
 * 设置里存的是 0–100 的整数百分比，CSS 变量要的是 0–1 的小数。
 * 换算在这里做一次，别在两处各写一遍（漂移的经典来源）。
 */
export function opacityToCssValue(percent: number): string {
  const safe = Number.isFinite(percent) ? percent : 0;
  const clamped = Math.max(0, Math.min(100, safe));
  return String(clamped / 100);
}

/**
 * 把当前透明度设置写进 CSS 变量。
 *
 * @param style 目标 style 对象（通常是 `document.documentElement.style`）
 * @param buttonOpacity 按钮背景透明度（0–100）
 * @param buttonHoverOpacity 按钮 hover 背景透明度（0–100）
 */
export function applyOpacityVariables(
  style: StyleTarget,
  buttonOpacity: number,
  buttonHoverOpacity: number
): void {
  style.setProperty(
    CSS_VAR_BG_OPACITY,
    opacityToCssValue(buttonOpacity)
  );
  style.setProperty(
    CSS_VAR_HOVER_OPACITY,
    opacityToCssValue(buttonHoverOpacity)
  );
}
