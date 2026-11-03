/**
 * 倍速纯逻辑单测。
 *
 * 被测模块 src/speed.ts 不 import obsidian、不碰 DOM，因此可以直接跑。
 */
import { describe, it, expect } from "vitest";
import {
	DEFAULT_CUSTOM_SPEEDS,
	RATE_EPSILON,
	SKIP_MAX,
	SKIP_MIN,
	SPEED_MAX,
	SPEED_MIN,
	formatCustomSpeeds,
	formatRate,
	isCurrentRate,
	isValidSpeed,
	normalizeButtonOrder,
	normalizeOpacity,
	normalizeSkipSeconds,
	normalizeSpeed,
	parseCustomSpeeds,
} from "../src/speed";

describe("isValidSpeed", () => {
	it("接受区间内的值", () => {
		expect(isValidSpeed(SPEED_MIN)).toBe(true);
		expect(isValidSpeed(SPEED_MAX)).toBe(true);
		expect(isValidSpeed(1)).toBe(true);
		expect(isValidSpeed(1.25)).toBe(true);
	});

	it("拒绝越界与非有限值", () => {
		expect(isValidSpeed(SPEED_MIN - 0.01)).toBe(false);
		expect(isValidSpeed(SPEED_MAX + 0.01)).toBe(false);
		expect(isValidSpeed(0)).toBe(false);
		expect(isValidSpeed(-1)).toBe(false);
		expect(isValidSpeed(Number.NaN)).toBe(false);
		expect(isValidSpeed(Number.POSITIVE_INFINITY)).toBe(false);
	});
});

describe("normalizeSpeed", () => {
	it("归一到 3 位小数", () => {
		expect(normalizeSpeed(1.0001)).toBe(1);
		expect(normalizeSpeed(1.23456)).toBe(1.235);
		expect(normalizeSpeed(0.5)).toBe(0.5);
	});

	it("非法值返回 null", () => {
		expect(normalizeSpeed(0.1)).toBeNull();
		expect(normalizeSpeed(Number.NaN)).toBeNull();
	});
});

describe("parseCustomSpeeds", () => {
	it("解析多行数字", () => {
		expect(parseCustomSpeeds("0.5\n1.0\n2.0")).toEqual([0.5, 1, 2]);
	});

	it("去重并升序排序", () => {
		expect(parseCustomSpeeds("2.0\n1.0\n2.0\n0.5")).toEqual([0.5, 1, 2]);
	});

	it("过滤越界值", () => {
		expect(parseCustomSpeeds("0.1\n0.5\n5.0")).toEqual([0.5]);
	});

	it("过滤非数字行", () => {
		expect(parseCustomSpeeds("abc\n\n0.5\n   \n1x")).toEqual([0.5]);
	});

	it("处理 Windows 换行", () => {
		expect(parseCustomSpeeds("0.5\r\n1.0\r\n2.0")).toEqual([0.5, 1, 2]);
	});

	it("结果为空时回退到默认列表", () => {
		expect(parseCustomSpeeds("")).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
		expect(parseCustomSpeeds("garbage")).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
		expect(parseCustomSpeeds("0.1\n9.9")).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});

	it("按 3 位小数去重（1.0001 与 1.0 视为同一个）", () => {
		expect(parseCustomSpeeds("1.0001\n1.0")).toEqual([1]);
	});

	it("不会修改返回的默认数组", () => {
		const a = parseCustomSpeeds("");
		a.push(99);
		expect(parseCustomSpeeds("")).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});
});

describe("formatCustomSpeeds", () => {
	it("是 parseCustomSpeeds 的逆操作", () => {
		const speeds = [0.5, 1, 2];
		expect(parseCustomSpeeds(formatCustomSpeeds(speeds))).toEqual(speeds);
	});

	it("接受只读数组", () => {
		expect(formatCustomSpeeds(DEFAULT_CUSTOM_SPEEDS)).toContain("0.5");
	});
});

describe("formatRate", () => {
	it("保留至少一位小数", () => {
		expect(formatRate(1)).toBe("1.0");
		expect(formatRate(1.25)).toBe("1.25");
		expect(formatRate(0.5)).toBe("0.5");
		expect(formatRate(3)).toBe("3.0");
		expect(formatRate(2.5)).toBe("2.5");
	});

	it("非法值回退到 1.0", () => {
		expect(formatRate(Number.NaN)).toBe("1.0");
		expect(formatRate(Number.POSITIVE_INFINITY)).toBe("1.0");
	});

	it("先按 3 位小数取整再显示", () => {
		// 1.23456 → 3 位小数取整得 1.235 → toFixed(2) 得 "1.24"
		expect(formatRate(1.23456)).toBe("1.24");
		expect(formatRate(1.999)).toBe("2.0");
	});
});

describe("isCurrentRate", () => {
	it("容差内视为相等", () => {
		expect(isCurrentRate(1, 1)).toBe(true);
		expect(isCurrentRate(1.0001, 1)).toBe(true);
		expect(isCurrentRate(1, 1 + RATE_EPSILON / 2)).toBe(true);
	});

	it("容差外视为不等", () => {
		expect(isCurrentRate(1, 1.1)).toBe(false);
		expect(isCurrentRate(1, 1 + RATE_EPSILON * 2)).toBe(false);
	});
});

describe("normalizeButtonOrder", () => {
	const valid = ["skipBack", "skipForward", "holdSpeed", "playPause"] as const;
	const defaults = ["skipBack", "skipForward", "holdSpeed", "playPause"] as const;

	it("保留合法顺序", () => {
		const order = ["playPause", "skipBack"];
		expect(normalizeButtonOrder(order, valid, defaults)).toEqual([
			"playPause",
			"skipBack",
			"skipForward",
			"holdSpeed",
		]);
	});

	it("过滤非法 id", () => {
		const result = normalizeButtonOrder(
			["skipBack", "bogus", 42],
			valid,
			defaults
		);
		expect(result).not.toContain("bogus");
		expect(result).not.toContain(42);
		expect(result).toContain("skipBack");
	});

	it("去重", () => {
		// 回归：旧实现只过滤非法 id、不去重，重复 id 会让注入循环创建出
		// 两个相同的按钮（settings.buttonOrder 渲染时逐项 create）。
		const result = normalizeButtonOrder(
			["skipBack", "skipBack", "skipForward"],
			valid,
			defaults
		);
		expect(result.filter((id) => id === "skipBack")).toHaveLength(1);
		expect(result).toHaveLength(4);
	});

	it("补齐缺失的默认按钮", () => {
		const result = normalizeButtonOrder(["skipBack"], valid, defaults);
		expect(result).toHaveLength(4);
		for (const id of defaults) expect(result).toContain(id);
	});

	it("非数组输入回退到默认顺序", () => {
		expect(normalizeButtonOrder(undefined, valid, defaults)).toEqual([
			...defaults,
		]);
		expect(normalizeButtonOrder("nope", valid, defaults)).toEqual([
			...defaults,
		]);
	});
});

describe("normalizeSkipSeconds", () => {
	it("保留合法值", () => {
		expect(normalizeSkipSeconds(5)).toBe(5);
		expect(normalizeSkipSeconds(SKIP_MIN)).toBe(SKIP_MIN);
		expect(normalizeSkipSeconds(SKIP_MAX)).toBe(SKIP_MAX);
	});

	it("夹到区间内", () => {
		expect(normalizeSkipSeconds(0)).toBe(SKIP_MIN);
		expect(normalizeSkipSeconds(999)).toBe(SKIP_MAX);
		expect(normalizeSkipSeconds(-5)).toBe(SKIP_MIN);
	});

	it("非数字回退到默认值", () => {
		expect(normalizeSkipSeconds(Number.NaN)).toBe(5);
		expect(normalizeSkipSeconds("abc")).toBe(5);
		expect(normalizeSkipSeconds(undefined, 10)).toBe(10);
	});

	it("取整", () => {
		expect(normalizeSkipSeconds(5.6)).toBe(6);
	});
});

describe("normalizeOpacity", () => {
	it("保留合法值", () => {
		expect(normalizeOpacity(16, 6)).toBe(16);
		expect(normalizeOpacity(0, 6)).toBe(0);
		expect(normalizeOpacity(100, 6)).toBe(100);
	});

	it("夹到 0-100", () => {
		expect(normalizeOpacity(-1, 6)).toBe(0);
		expect(normalizeOpacity(101, 6)).toBe(100);
	});

	it("非数字回退到默认值", () => {
		expect(normalizeOpacity(Number.NaN, 6)).toBe(6);
		expect(normalizeOpacity("x", 16)).toBe(16);
	});
});
