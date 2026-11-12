/**
 * 声明式 settings 的「render 回调契约」守卫。
 *
 * ## 这个文件在防什么
 *
 * Obsidian 1.13+ 的声明式渲染器有两条实测踩过的契约：
 *
 * 1. **`render()` 的返回值会被当作「行销毁前的清理函数」调用。**
 *    官方 d.ts 的签名是
 *    `render: (setting: Setting, group: SettingGroup) => void | (() => void)`。
 *    如果实现写成表达式体并返回了非函数值（例如 `render: (s) => s.addDropdown(...)`
 *    返回 Setting 组件对象），Obsidian 会把它当函数调用 →
 *    `TypeError: t is not a function` → **设置子页面永远打不开**。
 *    （这是社区插件 PKM-er/obsidian-editing-toolbar 4.1.6 的真实事故。）
 *
 * 2. **自定义块必须画进还活着的容器。**
 *    Obsidian 的 `Setting` 结构是 `settingEl > (infoEl, controlEl)`。
 *    `setting.settingEl.empty()` 会把 controlEl 一起清掉（脱离 DOM），
 *    之后往 controlEl 画的内容**不会出现在页面上**。
 *
 * 这两条都是「源码看起来对」但运行时会炸的缺陷 —— typecheck 过、
 * lint 过、单测也可能全绿。本文件用**行为断言**把它们钉住。
 *
 * ## 与 mock 的关系
 *
 * 不复用 `test/mocks/obsidian.ts` 里的 `Setting` 桩：那个桩的
 * `controlEl` / `settingEl` 是 undefined，且不模拟父子关系。
 * 「A 被清空导致 B 失效」这类缺陷在「每个属性都是独立对象」的朴素桩里
 * 天然查不出来 —— 所以这里自己造一个能跟踪脱离状态的 fake。
 */
import { describe, it, expect } from "vitest";

import { FakeSetting, invokeRender } from "./helpers/setting-dom";

describe("声明式 render 回调契约", () => {
	it("每个 render 回调的返回值都必须是 undefined（不能返回组件对象）", async () => {
		const { MediaSpeedEnhancerSettingTab, DEFAULT_SETTINGS } = await import(
			"../settings"
		);
		const plugin = {
			settings: Object.assign({}, DEFAULT_SETTINGS),
			async saveSettings() {
				/* noop */
			},
			async refreshAllToolbars() {
				/* noop */
			},
			applyAppearance() {
				/* noop */
			},
		};
		const tab = new MediaSpeedEnhancerSettingTab(
			{} as never,
			plugin as never
		);

		const groups = tab.getSettingDefinitions() as unknown as Array<{
			items: Array<{ render?: (s: unknown, g: unknown) => unknown }>;
		}>;

		let checked = 0;
		for (const group of groups) {
			for (const item of group.items) {
				const render = item.render;
				if (!render) continue;
				// **直接断言表达式体本身的返回值**，而不是「它调用的方法的返回值」。
				//
				// 这两者不一样：`render: (s) => this.renderX(s)` 里 renderX 返回
				// undefined，于是表达式体也返回 undefined（安全）；
				// 但 `render: (s) => s.addDropdown(...)` 会返回 Setting 对象
				// （社区插件 PKM-er/obsidian-editing-toolbar 4.1.6 的真实事故）。
				// 守卫必须盯住**表达式体**这个边界。
				const result = render(new FakeSetting(), undefined);
				expect(result).toBeUndefined();

				// 再用真实 Obsidian 的语义跑一遍：返回值被当清理函数调用。
				// 返回 undefined 时不会抛；返回非函数时会抛 TypeError。
				expect(() => invokeRender(render, new FakeSetting())).not.toThrow();
				checked += 1;
			}
		}
		// 必须真的覆盖到至少一个 render 回调，否则这个用例是空跑。
		expect(checked).toBeGreaterThan(0);
	});

	it("自定义块画进的容器没有被脱离 DOM", async () => {
		const { MediaSpeedEnhancerSettingTab, DEFAULT_SETTINGS } = await import(
			"../settings"
		);
		const plugin = {
			settings: Object.assign({}, DEFAULT_SETTINGS),
			async saveSettings() {
				/* noop */
			},
			async refreshAllToolbars() {
				/* noop */
			},
			applyAppearance() {
				/* noop */
			},
		};
		const tab = new MediaSpeedEnhancerSettingTab(
			{} as never,
			plugin as never
		);

		const groups = tab.getSettingDefinitions() as unknown as Array<{
			items: Array<{ render?: (s: unknown, g: unknown) => unknown }>;
		}>;

		let checked = 0;
		for (const group of groups) {
			for (const item of group.items) {
				const render = item.render;
				if (!render) continue;
				const setting = new FakeSetting();
				invokeRender(render, setting);
				// controlEl 必须还「活着」—— 否则往里画的内容不会出现在页面上。
				expect(setting.controlEl.attached).toBe(true);
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThan(0);
	});
});
