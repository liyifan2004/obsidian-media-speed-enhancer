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
    // 复用 normalizeSpeed：它是「倍速合法性 + 3 位小数精度」的唯一定义处。
    // 此前这里内联了同一套判断（isValidSpeed + toFixed(3)），
    // 导致 normalizeSpeed 的生产引用数为 0 —— 被单测覆盖的函数根本没跑在生产上，
    // 规则一旦改动就会漂移（第八轮「两套实现」模式的第三波）。
    const v = normalizeSpeed(Number(line));
    if (v === null) continue;
    parsed.push(v);
  }
  const unique = Array.from(new Set(parsed));
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
 * 把「用户输入」转成数值，区分「没有值」与「值是 0」。
 *
 * 为什么不能直接用 `Number(value)`：
 *   Number(null) === 0、Number("") === 0、Number([]) === 0
 * —— 这些「空输入」会被当成合法的 0，然后被夹到区间下界。
 * 结果：用户清空输入框时，临时倍速会变成 0.25×、跳转秒数变成 1 秒，
 * 而调用方以为「非法输入会被拒绝、保留旧值」。
 *
 * @returns 数值；没有值时返回 null
 */
function toNumberOrNull(value: unknown): number | null {
	if (value == null) return null;
	if (typeof value === "string") {
		const t = value.trim();
		if (t === "") return null;
		const n = Number(t);
		return Number.isFinite(n) ? n : null;
	}
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	// 其它类型（boolean / 对象 / 数组）一律视为「没有值」
	return null;
}

/**
 * 归一化跳转秒数：非法值回退到默认 5 秒，并夹到 [SKIP_MIN, SKIP_MAX]。
 */
export function normalizeSkipSeconds(value: unknown, fallback = 5): number {
	const n = toNumberOrNull(value);
	if (n === null) return fallback;
	const rounded = Math.round(n);
	if (rounded < SKIP_MIN) return SKIP_MIN;
	if (rounded > SKIP_MAX) return SKIP_MAX;
	return rounded;
}

/**
 * 归一化临时倍速：非法值回退到 fallback，并夹到 [SPEED_MIN, SPEED_MAX]。
 *
 * 与 {@link normalizeSkipSeconds} 同构 —— 两个都是「设置页文本框 → 合法数值」
 * 的同一类归一化，所以放在一起，行为契约也一致。
 */
export function normalizeTempSpeed(value: unknown, fallback = 2): number {
	const n = toNumberOrNull(value);
	if (n === null) return fallback;
	const clamped = Math.max(SPEED_MIN, Math.min(SPEED_MAX, n));
	// 保留 3 位小数，与 normalizeSpeed 的精度一致
	return Number(clamped.toFixed(3));
}

/** 最短时长过滤的取值范围（秒） */
export const MIN_DURATION_MIN = 1;
export const MIN_DURATION_MAX = 3600;

/**
 * 归一化最短时长阈值（秒）：非法值回退到 fallback，并夹到 [1, 3600]。
 * 与另外两个归一化同构。
 */
export function normalizeMinDurationSeconds(value: unknown, fallback = 30): number {
	const n = toNumberOrNull(value);
	if (n === null) return fallback;
	const rounded = Math.round(n);
	if (rounded < MIN_DURATION_MIN) return MIN_DURATION_MIN;
	if (rounded > MIN_DURATION_MAX) return MIN_DURATION_MAX;
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

/* ============================================================================
 * 磁盘设置的归一化
 * ==========================================================================*/

/**
 * 从磁盘读到的原始设置（data.json）。
 *
 * **全部字段都按「不可信输入」处理**：
 *   - data.json 是用户可以手改的；
 *   - 插件升级会带来自上个版本的字段；
 *   - 跨版本迁移可能留下半个结构。
 * 因此任何字段都可能是缺失的、类型不对的、越界的。
 */
export interface RawSettings {
	[key: string]: unknown;
}

/**
 * 归一化「倍速相关的」磁盘设置。
 *
 * ## 为什么必须有这一步
 *
 * `playbackRate` 是有硬约束的 —— 实测 Chromium（145）行为：
 *
 *   el.playbackRate = -1     → 抛 NotSupportedError（不在支持区间）
 *   el.playbackRate = NaN    → 抛 TypeError（非有限数）
 *   el.playbackRate = 0     → **允许**（值是 0，媒体直接停住）
 *
 * 也就是说：**未经校验的磁盘值会让插件在用户按住倍速按钮时抛异常**，
 * 而 `loadSettings` 之前只归一化了 `customSpeeds`，
 * `tempSpeed` / `skipSeconds` / `minDurationSeconds` 全都是「读到就信」。
 *
 * ## 为什么放在 src/speed.ts 而不是 settings.ts
 *
 * settings.ts 依赖 `obsidian`（Setting / PluginSettingTab），
 * 无法在无 DOM 环境下被单测直接 import。src/speed.ts 不 import obsidian，
 * 所以这份归一化逻辑可以像其他纯函数一样被 vitest 直接覆盖。
 */
export interface NormalizedSpeedSettings {
	tempSpeed: number;
	customSpeeds: number[];
	skipSeconds: number;
	minDurationSeconds: number;
	buttonOpacity: number;
	buttonHoverOpacity: number;
	/** 允许把归一化结果再喂回归一化（幂等性测试用） */
	[key: string]: unknown;
}

/**
 * 把磁盘上的倍速相关设置归一化成一份可安全使用的值。
 *
 * @param raw 磁盘上读到的原始对象（不可信）
 * @param defaults 出厂默认值（用来说明每个字段的回退目标）
 */
export function normalizeSpeedSettings(
	raw: RawSettings | null | undefined,
	defaults: {
		tempSpeed: number;
		customSpeeds: readonly number[];
		skipSeconds: number;
		minDurationSeconds: number;
		buttonOpacity: number;
		buttonHoverOpacity: number;
	}
): NormalizedSpeedSettings {
	// 用类型标注而不是 `as` 断言：raw 的类型已经是 RawSettings | null | undefined，
	// `?? {}` 之后断言是多余的（不改变表达式类型），商店审查会列为 Warning。
	const source: RawSettings = raw ?? {};

	// customSpeeds：磁盘上可能是 null / 字符串 / 数字（旧版本存的是数组，
	// 但手改过就什么都可能）。旧代码直接 `stored.customSpeeds.join("\n")`
	// —— null 与非数组会抛 TypeError，整个插件起不来。
	// 这里先判类型再走解析，解析失败回退出厂列表。
	let customSpeeds: number[];
	if (Array.isArray(source.customSpeeds)) {
		customSpeeds = parseCustomSpeeds(
			source.customSpeeds.map((x) => String(x)).join("\n")
		);
	} else {
		customSpeeds = [...defaults.customSpeeds];
	}

	return {
		tempSpeed: normalizeTempSpeed(source.tempSpeed, defaults.tempSpeed),
		customSpeeds,
		skipSeconds: normalizeSkipSeconds(source.skipSeconds, defaults.skipSeconds),
		minDurationSeconds: normalizeMinDurationSeconds(
			source.minDurationSeconds,
			defaults.minDurationSeconds
		),
		buttonOpacity: normalizeOpacity(source.buttonOpacity, defaults.buttonOpacity),
		buttonHoverOpacity: normalizeOpacity(
			source.buttonHoverOpacity,
			defaults.buttonHoverOpacity
		),
	};
}
