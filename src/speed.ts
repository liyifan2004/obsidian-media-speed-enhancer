/**
 * 倍速相关纯逻辑。
 *
 * 本文件**不 import obsidian、不碰 DOM**，因此可以被单测直接验证。
 *
 * 为什么要单独抽出来：插件主体 main.ts 有 1,500 行，其中绝大多数是
 * DOM 操作（注入工具栏、绑定事件、MutationObserver），可测面很薄。
 * 但倍速这块的规则——取值范围、去重、排序、归一化、显示格式——恰恰是
 * **有明确输入输出、能出错、且出错后用户会看到错值**的部分，留在
 * DOM 混杂的代码里就只能靠人工点击验证。
 *
 * 这里把规则集中成纯函数，主流程与设置页都改为调用同一份实现。
 */

// ----------------------------------------------------------------------------
// 常量
// ----------------------------------------------------------------------------

/** 倍速允许的最小值 */
export const SPEED_MIN = 0.25;

/** 倍速允许的最大值 */
export const SPEED_MAX = 4.0;

/** 跳转秒数的取值范围 */
export const SKIP_MIN = 1;
export const SKIP_MAX = 60;

/** 默认的永久倍速列表 */
export const DEFAULT_CUSTOM_SPEEDS: readonly number[] = Object.freeze([
  0.5, 0.75,
  1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
  2.5, 3.0,
]);

/** 倍速显示时的比较容差：浮点相等判断留一点余量 */
export const RATE_EPSILON = 0.005;

// ----------------------------------------------------------------------------
// 纯函数
// ----------------------------------------------------------------------------

/**
 * 判断一个数值是否是合法的倍速。
 * @param v 待检查的数值
 * @returns 是否在 [SPEED_MIN, SPEED_MAX] 区间内且是有限数
 */
export function isValidSpeed(v: number): boolean {
  return Number.isFinite(v) && v >= SPEED_MIN && v <= SPEED_MAX;
}

/**
 * 把倍速归一到 3 位小数（与 parseCustomSpeeds 的去重精度一致）。
 * 非法值返回 null。
 */
export function normalizeSpeed(v: number): number | null {
  if (!isValidSpeed(v)) return null;
  return Number(v.toFixed(3));
}

/**
 * 解析用户输入的 customSpeeds 文本。
 * - 每行一个数字
 * - 自动去重 + 过滤非法值（NaN、越界）
 * - 升序排序
 * - 若解析结果为空，回退到 DEFAULT_CUSTOM_SPEEDS
 *
 * @param input 用户在设置页输入的多行文本
 * @returns 归一化后的倍速列表
 */
export function parseCustomSpeeds(input: string): number[] {
  const parsed: number[] = [];
  for (const lineRaw of input.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const v = Number(line);
    if (!isValidSpeed(v)) continue;
    parsed.push(v);
  }
  const unique = Array.from(new Set(parsed.map((x) => Number(x.toFixed(3)))));
  unique.sort((a, b) => a - b);
  if (unique.length === 0) {
    return [...DEFAULT_CUSTOM_SPEEDS];
  }
  return unique;
}

/**
 * 把倍速列表格式化为多行文本（parseCustomSpeeds 的逆操作）。
 */
export function formatCustomSpeeds(speeds: readonly number[]): string {
  return speeds.map((s) => s.toString()).join('\n');
}

/**
 * 倍速格式化 — 保留至少 1 位小数，让 1.0 显示为 "1.0"（与 "×" 组合为 "1.0×"）。
 * 例如：1.0 → "1.0"，1.25 → "1.25"，0.5 → "0.5"，3 → "3.0"
 *
 * @param rate 倍速值
 * @returns 显示用的文本
 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '1.0';
  const rounded = Math.round(rate * 1000) / 1000;
  // 用 toFixed(2) 保留两位，然后去掉末尾的 0 但至少保留 1 位小数
  const s = rounded.toFixed(2);
  if (s.endsWith('0')) {
    return s.slice(0, -1); // "1.00" → "1.0", "0.50" → "0.5"
  }
  return s;
}

/**
 * 判断某个倍速是否等于当前的播放速率。
 * 用固定容差而不是严格相等，避免 1.1 这类值因浮点误差判不出来。
 */
export function isCurrentRate(currentRate: number, speed: number): boolean {
  return Math.abs(currentRate - speed) < RATE_EPSILON;
}

/**
 * 归一化按钮显示顺序：过滤非法 id、去重、补齐缺失的默认按钮。
 *
 * @param order 待归一化的顺序（可能来自旧版本磁盘数据，结构不可信）
 * @param defaultOrder 默认顺序（来自 DEFAULT_SETTINGS.buttonOrder）
 * @returns 归一化后的顺序
 */
export function normalizeButtonOrder<T extends string>(
  order: unknown,
  validIds: readonly T[],
  defaultOrder: readonly T[],
): T[] {
  const valid = new Set<T>(validIds);
  const seen = new Set<T>();
  const normalized: T[] = [];

  if (Array.isArray(order)) {
    for (const id of order) {
      if (typeof id !== 'string') continue;
      if (!valid.has(id as T)) continue;
      if (seen.has(id as T)) continue;
      seen.add(id as T);
      normalized.push(id as T);
    }
  }
  for (const id of defaultOrder) {
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }
  return normalized;
}

/**
 * 归一化跳转秒数：非法值回退到默认 5 秒，并夹到 [SKIP_MIN, SKIP_MAX]。
 */
export function normalizeSkipSeconds(value: unknown, fallback = 5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < SKIP_MIN) return SKIP_MIN;
  if (rounded > SKIP_MAX) return SKIP_MAX;
  return rounded;
}

/**
 * 归一化透明度设置（0-100 的整数百分比）。
 */
export function normalizeOpacity(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}
