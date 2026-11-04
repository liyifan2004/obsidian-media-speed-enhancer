/**
 * `loadSettings` 的集成测试（真实调用链）。
 *
 * ## 为什么不能只测纯函数
 *
 * `test/settings-normalize.test.ts` 覆盖了 `normalizeSpeedSettings` 这个纯函数。
 * 但纯函数测得再全，也不能保证 **调用点真的调了它** ——
 * 第八轮在 BRoS 与 MSE 上抓到的三处缺陷，本质都是
 * 「被单测覆盖的函数 A，生产跑的是 B」。
 *
 * 所以这里直接实例化插件类、调 `loadSettings()`、断言 `plugin.settings` 的最终值。
 * 这才是「磁盘脏数据 → 内存里的设置」这条真实链路的断言。
 */
import { describe, it, expect } from "vitest";
// 用 @main 别名而不是相对路径：仓库根目录同时有构建产物 main.js，
// 相对导入会命中 .js —— 测试就跑在旧构建产物上了。
import MediaSpeedEnhancerPlugin from "@main";
import { DEFAULT_CUSTOM_SPEEDS, SPEED_MAX, SPEED_MIN } from "../src/speed";

/** 造一个插件实例，磁盘内容由 disk 参数指定 */
function makePlugin(disk: unknown): MediaSpeedEnhancerPlugin {
	const plugin = new (MediaSpeedEnhancerPlugin as any)({
		vault: {},
		workspace: {},
	});
	// 覆盖 loadData，让它返回指定的磁盘内容
	(plugin as any).loadData = async () => disk;
	return plugin as MediaSpeedEnhancerPlugin;
}

describe("loadSettings / 磁盘脏数据不会让插件起不来", () => {
	it("customSpeeds 为 null 时不抛错（旧代码在这里抛 TypeError）", async () => {
		const plugin = makePlugin({ customSpeeds: null });
		await expect(plugin.loadSettings()).resolves.not.toThrow();
		expect(plugin.settings.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});

	it("customSpeeds 是字符串时也不抛错", async () => {
		const plugin = makePlugin({ customSpeeds: "1.5\n2.0" });
		await expect(plugin.loadSettings()).resolves.not.toThrow();
		expect(plugin.settings.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});

	it("磁盘是 null 时回退出厂设置", async () => {
		const plugin = makePlugin(null);
		await plugin.loadSettings();
		expect(plugin.settings.tempSpeed).toBe(2.0);
		expect(plugin.settings.skipSeconds).toBe(5);
		expect(plugin.settings.customSpeeds).toEqual([...DEFAULT_CUSTOM_SPEEDS]);
	});
});

describe("loadSettings / 数值字段归一化后才进内存", () => {
	it("tempSpeed 越界时被夹回区间（否则赋给 playbackRate 会抛异常）", async () => {
		const plugin = makePlugin({ tempSpeed: -1 });
		await plugin.loadSettings();
		expect(plugin.settings.tempSpeed).toBe(SPEED_MIN);
		expect(plugin.settings.tempSpeed).toBeGreaterThanOrEqual(SPEED_MIN);
		expect(plugin.settings.tempSpeed).toBeLessThanOrEqual(SPEED_MAX);
	});

	it("tempSpeed 为 NaN 时回退出厂值", async () => {
		const plugin = makePlugin({ tempSpeed: Number.NaN });
		await plugin.loadSettings();
		expect(plugin.settings.tempSpeed).toBe(2.0);
		expect(Number.isFinite(plugin.settings.tempSpeed)).toBe(true);
	});

	it("tempSpeed 为字符串数字时按数值处理", async () => {
		const plugin = makePlugin({ tempSpeed: "1.5" });
		await plugin.loadSettings();
		expect(plugin.settings.tempSpeed).toBe(1.5);
	});

	it("skipSeconds / minDurationSeconds 也被归一化", async () => {
		const plugin = makePlugin({ skipSeconds: 9999, minDurationSeconds: -3 });
		await plugin.loadSettings();
		expect(plugin.settings.skipSeconds).toBe(60);
		expect(plugin.settings.minDurationSeconds).toBe(1);
	});

	it("合法值原样保留（归一化不能改坏用户设置）", async () => {
		const plugin = makePlugin({
			tempSpeed: 1.5,
			customSpeeds: [1, 1.5, 2],
			skipSeconds: 10,
			minDurationSeconds: 60,
		});
		await plugin.loadSettings();
		expect(plugin.settings.tempSpeed).toBe(1.5);
		expect(plugin.settings.customSpeeds).toEqual([1, 1.5, 2]);
		expect(plugin.settings.skipSeconds).toBe(10);
		expect(plugin.settings.minDurationSeconds).toBe(60);
	});

	it("归一化后的每一个 customSpeeds 都能安全赋给 playbackRate", async () => {
		const plugin = makePlugin({ customSpeeds: [0.01, 100, -3, 1.5, "x"] });
		await plugin.loadSettings();
		for (const s of plugin.settings.customSpeeds) {
			expect(s).toBeGreaterThanOrEqual(SPEED_MIN);
			expect(s).toBeLessThanOrEqual(SPEED_MAX);
			expect(Number.isFinite(s)).toBe(true);
		}
	});
});

describe("loadSettings / 既有行为未被破坏", () => {
	it("buttonOrder 仍然补齐缺失按钮并去重", async () => {
		const plugin = makePlugin({ buttonOrder: ["playPause", "playPause", "skipBack"] });
		await plugin.loadSettings();
		expect(plugin.settings.buttonOrder).toEqual(["playPause", "skipBack", "skipForward", "holdSpeed"]);
	});

	it("旧版 alwaysExpand 仍然迁移为 toolbarAutoHide", async () => {
		const plugin = makePlugin({ alwaysExpand: true });
		await plugin.loadSettings();
		expect(plugin.settings.toolbarAutoHide).toBe(false);
	});

	it("enabledButtons 与默认项合并（缺失的按钮用默认值）", async () => {
		const plugin = makePlugin({ enabledButtons: { skipBack: false } });
		await plugin.loadSettings();
		expect(plugin.settings.enabledButtons.skipBack).toBe(false);
		expect(plugin.settings.enabledButtons.skipForward).toBe(true);
	});
});
