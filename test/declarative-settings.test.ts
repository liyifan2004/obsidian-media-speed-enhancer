/**
 * 声明式 settings（Obsidian 1.13+ API）的行为测试。
 *
 * ## 为什么需要这一层
 *
 * 1.0.42 被 Obsidian 商店审查下架，其中一条是：
 * 「This PluginSettingTab does not implement getSettingDefinitions();
 *   its settings will not appear in Obsidian's settings search for users on 1.13.0 or later.」
 *
 * 也就是说 —— **在 1.13+ 上，用户在设置里搜「倍速」根本找不到本插件**。
 * 这不是 cosmetic 问题，是设置项对用户不可达。
 *
 * 只靠 typecheck 证明不了「绑定是对的」：类型对了不代表
 * getControlValue 读的是对的字段、setControlValue 写的是对的字段、
 * 归一化走的是被单测覆盖的那份纯函数。这些必须用行为测试钉住。
 */
import { describe, it, expect } from "vitest";
import { MediaSpeedEnhancerSettingTab, DEFAULT_SETTINGS } from "../settings";
import { t } from "../i18n";
import type MediaSpeedEnhancerPlugin from "../main";
import {
	DEFAULT_CUSTOM_SPEEDS,
	MIN_DURATION_MAX,
	MIN_DURATION_MIN,
	SKIP_MAX,
	SKIP_MIN,
	SPEED_MAX,
	SPEED_MIN,
	formatCustomSpeeds,
} from "../src/speed";

/** 造一个设置页，plugin 只提供 settings + saveSettings + refreshAllToolbars */
function makeTab(overrides: Record<string, unknown> = {}) {
	const settings = Object.assign(
		{},
		DEFAULT_SETTINGS,
		{ customSpeeds: [...DEFAULT_CUSTOM_SPEEDS] },
		overrides
	);
	const saved: unknown[] = [];
	const refreshed: number[] = [];

	const plugin = {
		settings,
		async saveSettings() {
			saved.push(JSON.stringify(settings));
		},
		async refreshAllToolbars() {
			refreshed.push(1);
		},
	} as unknown as MediaSpeedEnhancerPlugin;

	const tab = new MediaSpeedEnhancerSettingTab(
		{} as never,
		plugin
	);
	return { tab, plugin, settings, saved, refreshed };
}

/** 把 getSettingDefinitions() 的结构摊平成「按分组分组的项」 */
function flatten(defs: ReturnType<MediaSpeedEnhancerSettingTab["getSettingDefinitions"]>) {
	const groups: Array<{ heading?: string; items: Array<Record<string, unknown>> }> = [];
	// SettingDefinitionItem 是个联合类型，逐项 narrow 太啰嗦；
	// 这里只需要读出 type / heading / items 三个字段，走 unknown 中转。
	const list = defs as unknown as Array<Record<string, unknown>>;
	for (const d of list) {
		if (d.type === "group" || d.type === "list") {
			groups.push({
				heading: d.heading as string | undefined,
				items: ((d.items as Array<Record<string, unknown>>) ?? []),
			});
		}
	}
	return groups;
}

/** 在所有分组里找一个名字匹配的项 */
function findItem(
	tab: MediaSpeedEnhancerSettingTab,
	name: string
): Record<string, unknown> | undefined {
	for (const g of flatten(tab.getSettingDefinitions())) {
		for (const item of g.items) {
			if (item.name === name) return item;
		}
	}
	return undefined;
}

describe("getSettingDefinitions / 结构", () => {
	it("返回非空数组（否则 Obsidian 1.13+ 完全不渲染声明式设置）", () => {
		const { tab } = makeTab();
		const defs = tab.getSettingDefinitions();
		expect(Array.isArray(defs)).toBe(true);
		expect(defs.length).toBeGreaterThan(0);
	});

	it("每个分组都有 heading，且 heading 不是插件名", () => {
		const { tab } = makeTab();
		const groups = flatten(tab.getSettingDefinitions());
		expect(groups.length).toBeGreaterThan(0);
		for (const g of groups) {
			expect(g.heading).toBeTruthy();
			// 商店审查的 Error：设置标题里不要包含插件名
			expect(g.heading).not.toContain("Media Speed Enhancer");
		}
	});

	it("每一项都有 name（否则进不了设置搜索）", () => {
		const { tab } = makeTab();
		for (const g of flatten(tab.getSettingDefinitions())) {
			for (const item of g.items) {
				expect(item.name).toBeTruthy();
			}
		}
	});

	it("设置项覆盖了全部可配置字段（漏一个 = 该项在 1.13+ 不可达）", () => {
		const { tab } = makeTab();
		const keys = new Set<string>();
		for (const g of flatten(tab.getSettingDefinitions())) {
			for (const item of g.items) {
				const control = item.control as { key?: string } | undefined;
				if (control?.key) keys.add(control.key);
			}
		}
		// 命令式路径里用户能改的每个设置都必须在声明式路径里出现
		for (const key of [
			"tempSpeed",
			"skipSeconds",
			"minDurationSeconds",
			"globalSync",
			"toolbarAutoHide",
			"enableMinDuration",
			"enableSequentialPlay",
			"sequentialPlayTone",
			"enableTouchOptimization",
		]) {
			expect(keys.has(key)).toBe(true);
		}
	});
});

describe("getSettingDefinitions / 控件参数与命令式路径一致", () => {
	it("tempSpeed 的 number 控件带正确的 min/max/step", () => {
		const { tab } = makeTab();
		const item = findItem(tab, t("labelTempSpeed"));
		expect(item).toBeTruthy();
		const control = item!.control as {
			type: string;
			min: number;
			max: number;
			step: number;
		};
		expect(control.type).toBe("number");
		expect(control.min).toBe(SPEED_MIN);
		expect(control.max).toBe(SPEED_MAX);
		expect(control.step).toBe(0.25);
	});

	it("skipSeconds 的 number 控件带正确的 min/max", () => {
		const { tab } = makeTab();
		const item = findItem(tab, t("labelSkipSeconds"));
		expect(item).toBeTruthy();
		const control = item!.control as { min: number; max: number };
		expect(control.min).toBe(SKIP_MIN);
		expect(control.max).toBe(SKIP_MAX);
	});

	it("minDurationSeconds 的 number 控件带正确的 min/max", () => {
		const { tab } = makeTab();
		const item =
			findItem(tab, t("labelMinDurationSeconds"));
		expect(item).toBeTruthy();
		const control = item!.control as { min: number; max: number };
		expect(control.min).toBe(MIN_DURATION_MIN);
		expect(control.max).toBe(MIN_DURATION_MAX);
	});
});

describe("getControlValue / 读取绑定", () => {
	it("读普通字段时返回 plugin.settings 里的值", () => {
		const { tab } = makeTab({ tempSpeed: 1.5, globalSync: true });
		expect(tab.getControlValue("tempSpeed")).toBe(1.5);
		expect(tab.getControlValue("globalSync")).toBe(true);
	});

	it("customSpeedsText 返回格式化后的文本（控件是 textarea，要的是字符串）", () => {
		const { tab } = makeTab({ customSpeeds: [1, 1.5, 2] });
		expect(tab.getControlValue("customSpeedsText")).toBe(
			formatCustomSpeeds([1, 1.5, 2])
		);
	});
});

describe("setControlValue / 写入绑定与副作用", () => {
	it("tempSpeed 写入时走归一化（越界被夹回区间）", async () => {
		const { tab, settings, saved } = makeTab();
		await tab.setControlValue("tempSpeed", 99);
		expect(settings.tempSpeed).toBe(SPEED_MAX);
		expect(saved.length).toBe(1);
	});

	it("tempSpeed 写入非法值时回退到默认值（而不是存进去）", async () => {
		const { tab, settings } = makeTab();
		await tab.setControlValue("tempSpeed", "abc");
		expect(settings.tempSpeed).toBe(DEFAULT_SETTINGS.tempSpeed);
		expect(Number.isFinite(settings.tempSpeed)).toBe(true);
	});

	it("customSpeedsText 写入时解析成倍速数组（过滤非法值、去重、排序）", async () => {
		const { tab, settings } = makeTab();
		await tab.setControlValue("customSpeedsText", "2\n1\n1\n99\n-3\nabc");
		expect(settings.customSpeeds).toEqual([1, 2]);
	});

	it("skipSeconds 写入时走归一化", async () => {
		const { tab, settings } = makeTab();
		await tab.setControlValue("skipSeconds", 9999);
		expect(settings.skipSeconds).toBe(SKIP_MAX);
	});

	it("minDurationSeconds 写入时走归一化", async () => {
		const { tab, settings } = makeTab();
		await tab.setControlValue("minDurationSeconds", -5);
		expect(settings.minDurationSeconds).toBe(MIN_DURATION_MIN);
	});

	it("开关类字段写入布尔值", async () => {
		const { tab, settings } = makeTab();
		await tab.setControlValue("globalSync", true);
		await tab.setControlValue("toolbarAutoHide", false);
		await tab.setControlValue("enableMinDuration", true);
		await tab.setControlValue("enableSequentialPlay", true);
		await tab.setControlValue("sequentialPlayTone", false);
		await tab.setControlValue("enableTouchOptimization", false);
		expect(settings.globalSync).toBe(true);
		expect(settings.toolbarAutoHide).toBe(false);
		expect(settings.enableMinDuration).toBe(true);
		expect(settings.enableSequentialPlay).toBe(true);
		expect(settings.sequentialPlayTone).toBe(false);
		expect(settings.enableTouchOptimization).toBe(false);
	});

	it("改 skipSeconds 会刷新已注入的工具栏（按钮 label 用新值）", async () => {
		const { tab, refreshed } = makeTab();
		await tab.setControlValue("skipSeconds", 10);
		expect(refreshed.length).toBe(1);
	});

	it("改 globalSync 会刷新工具栏", async () => {
		const { tab, refreshed } = makeTab();
		await tab.setControlValue("globalSync", true);
		expect(refreshed.length).toBe(1);
	});

	it("改 tempSpeed 不刷新工具栏（label 与倍速无关）", async () => {
		const { tab, refreshed } = makeTab();
		await tab.setControlValue("tempSpeed", 1.5);
		expect(refreshed.length).toBe(0);
	});

	it("每次写入都会持久化", async () => {
		const { tab, saved } = makeTab();
		await tab.setControlValue("tempSpeed", 1.5);
		await tab.setControlValue("globalSync", true);
		expect(saved.length).toBe(2);
	});
});

describe("validate / 越界提示", () => {
	it("接受区间内的值", () => {
		const { tab } = makeTab();
		const item = findItem(tab, t("labelTempSpeed"));
		const control = item!.control as {
			validate: (v: number) => string | void;
		};
		expect(control.validate(1.5)).toBeUndefined();
	});

	it("越界时给出提示而不是默默改掉", () => {
		const { tab } = makeTab();
		const item = findItem(tab, t("labelTempSpeed"));
		const control = item!.control as {
			validate: (v: number) => string | void;
		};
		expect(typeof control.validate(99)).toBe("string");
		expect(typeof control.validate(Number.NaN)).toBe("string");
	});
});
