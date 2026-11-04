/**
 * 磁盘设置归一化的单测。
 *
 * ## 背景
 *
 * `loadSettings` 此前只归一化了 `customSpeeds`，
 * `tempSpeed` / `skipSeconds` / `minDurationSeconds` 全是「读到就信」。
 * 而 data.json 是用户可以手改的 —— 字段可能缺失、类型不对、越界。
 *
 * 这些值不是装饰性的：`tempSpeed` 会被直接赋给 `mediaEl.playbackRate`。
 * 实测 Chromium（145）的行为：
 *
 *   el.playbackRate = -1   → 抛 NotSupportedError
 *   el.playbackRate = NaN  → 抛 TypeError
 *   el.playbackRate = 0    → 允许（媒体停住，但值确实是 0）
 *
 * 也就是说，未经校验的磁盘值会让插件在「按住倍速」时抛异常。
 *
 * 另外 `customSpeeds` 为 null / 非数组时，旧代码的
 * `stored.customSpeeds.join("\n")` 直接抛 TypeError → 插件整个起不来。
 */
import { describe, it, expect } from "vitest";
import {
	DEFAULT_CUSTOM_SPEEDS,
	MIN_DURATION_MAX,
	MIN_DURATION_MIN,
	SPEED_MAX,
	SPEED_MIN,
	SKIP_MAX,
	SKIP_MIN,
	normalizeSpeedSettings,
} from "../src/speed";

const DEFAULTS = {
	tempSpeed: 2.0,
	customSpeeds: DEFAULT_CUSTOM_SPEEDS,
	skipSeconds: 5,
	minDurationSeconds: 30,
	buttonOpacity: 6,
	buttonHoverOpacity: 16,
};

describe("normalizeSpeedSettings / 缺失与非法输入", () => {
	it("磁盘上没有设置时全部回退出厂值", () => {
		const out = normalizeSpeedSettings(null, DEFAULTS);
		expect(out.tempSpeed).toBe(DEFAULTS.tempSpeed);
		expect(out.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
		expect(out.skipSeconds).toBe(DEFAULTS.skipSeconds);
		expect(out.minDurationSeconds).toBe(DEFAULTS.minDurationSeconds);
		expect(out.buttonOpacity).toBe(DEFAULTS.buttonOpacity);
		expect(out.buttonHoverOpacity).toBe(DEFAULTS.buttonHoverOpacity);
	});

	it("空对象同样全部回退出厂值", () => {
		const out = normalizeSpeedSettings({}, DEFAULTS);
		expect(out.tempSpeed).toBe(DEFAULTS.tempSpeed);
		expect(out.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});

	it("tempSpeed 越界时夹回区间（不会把 -1 递给 playbackRate）", () => {
		expect(normalizeSpeedSettings({ tempSpeed: -1 }, DEFAULTS).tempSpeed).toBe(SPEED_MIN);
		expect(normalizeSpeedSettings({ tempSpeed: 99 }, DEFAULTS).tempSpeed).toBe(SPEED_MAX);
	});

	it("tempSpeed 是 NaN / 字符串 / null 时回退出厂值", () => {
		expect(normalizeSpeedSettings({ tempSpeed: Number.NaN }, DEFAULTS).tempSpeed).toBe(2.0);
		expect(normalizeSpeedSettings({ tempSpeed: "abc" }, DEFAULTS).tempSpeed).toBe(2.0);
		expect(normalizeSpeedSettings({ tempSpeed: null }, DEFAULTS).tempSpeed).toBe(2.0);
	});

	it("skipSeconds / minDurationSeconds 越界时夹回区间", () => {
		expect(normalizeSpeedSettings({ skipSeconds: 0 }, DEFAULTS).skipSeconds).toBe(SKIP_MIN);
		expect(normalizeSpeedSettings({ skipSeconds: 9999 }, DEFAULTS).skipSeconds).toBe(SKIP_MAX);
		expect(normalizeSpeedSettings({ minDurationSeconds: 0 }, DEFAULTS).minDurationSeconds).toBe(
			MIN_DURATION_MIN
		);
		expect(
			normalizeSpeedSettings({ minDurationSeconds: 999999 }, DEFAULTS).minDurationSeconds
		).toBe(MIN_DURATION_MAX);
	});

	it("透明度夹到 0-100", () => {
		expect(normalizeSpeedSettings({ buttonOpacity: -5 }, DEFAULTS).buttonOpacity).toBe(0);
		expect(normalizeSpeedSettings({ buttonOpacity: 500 }, DEFAULTS).buttonOpacity).toBe(100);
	});
});

describe("normalizeSpeedSettings / customSpeeds 的结构不耐受", () => {
	it("customSpeeds 为 null 时回退出厂列表（旧代码在这里抛 TypeError）", () => {
		const out = normalizeSpeedSettings({ customSpeeds: null }, DEFAULTS);
		expect(out.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});

	it("customSpeeds 是字符串 / 数字时回退出厂列表（旧代码 v.join is not a function）", () => {
		expect(normalizeSpeedSettings({ customSpeeds: "abc" }, DEFAULTS).customSpeeds).toEqual([
			...DEFAULT_CUSTOM_SPEEDS,
		]);
		expect(normalizeSpeedSettings({ customSpeeds: 5 }, DEFAULTS).customSpeeds).toEqual([
			...DEFAULT_CUSTOM_SPEEDS,
		]);
	});

	it("customSpeeds 数组里混入非法值时过滤掉", () => {
		const out = normalizeSpeedSettings(
			{ customSpeeds: [1.5, -2, 99, "x", 2] },
			DEFAULTS
		);
		expect(out.customSpeeds).toEqual([1.5, 2]);
	});

	it("customSpeeds 全是非法值时回退出厂列表", () => {
		const out = normalizeSpeedSettings({ customSpeeds: [-1, 99, "abc"] }, DEFAULTS);
		expect(out.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});

	it("customSpeeds 为空数组时回退出厂列表（而不是留空数组）", () => {
		const out = normalizeSpeedSettings({ customSpeeds: [] }, DEFAULTS);
		expect(out.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});
});

describe("normalizeSpeedSettings / 合法值原样保留", () => {
	it("磁盘上的合法值不被改动", () => {
		const out = normalizeSpeedSettings(
			{
				tempSpeed: 1.5,
				customSpeeds: [1, 1.5, 2],
				skipSeconds: 10,
				minDurationSeconds: 60,
				buttonOpacity: 30,
				buttonHoverOpacity: 40,
			},
			DEFAULTS
		);
		expect(out.tempSpeed).toBe(1.5);
		expect(out.customSpeeds).toEqual([1, 1.5, 2]);
		expect(out.skipSeconds).toBe(10);
		expect(out.minDurationSeconds).toBe(60);
		expect(out.buttonOpacity).toBe(30);
		expect(out.buttonHoverOpacity).toBe(40);
	});

	it("归一化后的 customSpeeds 一定落在合法区间内（可安全赋给 playbackRate）", () => {
		const out = normalizeSpeedSettings({ customSpeeds: [0.01, 100, -3, 1.5] }, DEFAULTS);
		for (const s of out.customSpeeds) {
			expect(s).toBeGreaterThanOrEqual(SPEED_MIN);
			expect(s).toBeLessThanOrEqual(SPEED_MAX);
		}
	});

	it("归一化后的 tempSpeed 一定落在合法区间内", () => {
		for (const raw of [-1, 0, 0.1, 1e9, Number.NaN, null, "abc", undefined]) {
			const out = normalizeSpeedSettings({ tempSpeed: raw }, DEFAULTS);
			expect(out.tempSpeed).toBeGreaterThanOrEqual(SPEED_MIN);
			expect(out.tempSpeed).toBeLessThanOrEqual(SPEED_MAX);
			expect(Number.isFinite(out.tempSpeed)).toBe(true);
		}
	});
});

describe("normalizeSpeedSettings / 幂等性", () => {
	it("归一化两次的结果相同（不会来回漂移）", () => {
		const once = normalizeSpeedSettings({ tempSpeed: 99, customSpeeds: [0.3, 1.7] }, DEFAULTS);
		const twice = normalizeSpeedSettings(once, DEFAULTS);
		expect(twice).toEqual(once);
	});
});
