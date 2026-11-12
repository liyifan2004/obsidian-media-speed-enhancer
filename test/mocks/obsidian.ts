/**
 * Obsidian API 的最小桩模块。
 *
 * 只在测试里使用（通过 vitest.config.mts 的 alias 把 "obsidian" 指到这里）。
 * 只实现被测代码真正用到的那部分 API，行为尽量贴近真实 Obsidian。
 */
import { FakeEl } from "../helpers/setting-dom";

export class App {
	vault!: unknown;
	workspace!: unknown;
}

export class Plugin {
	app!: App;
	manifest!: unknown;

	constructor(app?: App) {
		if (app) this.app = app;
	}

	addCommand(): any {
		return { id: "", name: "" };
	}

	addSettingTab(): void {
		/* noop */
	}

	registerEvent(): void {
		/* noop */
	}

	async loadData(): Promise<unknown> {
		return null;
	}

	async saveData(): Promise<void> {
		/* noop */
	}
}

export class PluginSettingTab {
	containerEl: HTMLElement = undefined as unknown as HTMLElement;

	constructor(public app: App, public plugin: Plugin) {}

	display(): void {
		/* noop */
	}

	/**
	 * 声明式 settings 的取值/写入绑定。
	 *
	 * Obsidian 1.13+ 用这两个方法把声明式控件接到插件的存储上；
	 * 桩里给出默认实现，测试可以覆盖它们来验证绑定行为。
	 */
	getControlValue(_key: string): unknown {
		return undefined;
	}

	setControlValue(_key: string, _value: unknown): void | Promise<void> {
		/* noop */
	}

	/**
	 * 1.13+ 的声明式状态刷新。测试可以覆盖它来观察插件是否正确地
	 * 在状态变化后请求框架重新求值 disabled 谓词。
	 */
	refreshDomState(): void {
		/* noop */
	}

	update(): void {
		/* noop */
	}
}

export class Setting {
	/**
	 * 框架创建的两个容器。
	 *
	 * 声明式路径（Obsidian 1.13+）下 Setting 由框架创建，
	 * render 回调收到的是现成的 Setting —— 插件要往 controlEl 里挂东西，
	 * 所以桩必须提供这两个元素，否则测不出「Setting 嵌套 Setting」这类问题。
	 *
	 * 这里用 FakeEl 而不是裸对象：真实 Obsidian 里 Setting 的结构是
	 * `settingEl > (infoEl, controlEl)`，插件代码会读 `settingEl.classList`、
	 * 也会 `setting.settingEl.empty()`（连带清掉 controlEl）。
	 * 裸对象测不出这些。
	 */
	controlEl: HTMLElement = undefined as unknown as HTMLElement;
	settingEl: HTMLElement = undefined as unknown as HTMLElement;
	infoEl: HTMLElement = undefined as unknown as HTMLElement;

	constructor(el?: unknown) {
		// FakeEl 实现了插件真正用到的那部分 DOM 接口，
		// 但不是完整的 HTMLElement —— 所以在这里做一次转换，
		// 而不是让字段类型变成 FakeEl（那会让插件代码的类型检查失真）。
		const settingEl = new FakeEl();
		const infoEl = new FakeEl();
		const controlEl = new FakeEl();
		settingEl.appendChild(infoEl);
		settingEl.appendChild(controlEl);

		this.settingEl = settingEl as unknown as HTMLElement;
		this.infoEl = infoEl as unknown as HTMLElement;
		this.controlEl = controlEl as unknown as HTMLElement;

		// 挂到传入的父容器上（真实 Obsidian 的行为）。
		const parent = el as
			| { appendChild?: (c: unknown) => unknown }
			| undefined;
		if (parent && typeof parent.appendChild === "function") {
			parent.appendChild(settingEl);
		}
	}

	setName(): this {
		return this;
	}

	setDesc(): this {
		return this;
	}

	setHeading(): this {
		return this;
	}

	setTooltip(): this {
		return this;
	}

	addButton(): this {
		return this;
	}

	addToggle(): this {
		return this;
	}

	addText(): this {
		return this;
	}

	addTextArea(): this {
		return this;
	}

	addDropdown(): this {
		return this;
	}

	addSlider(): this {
		return this;
	}

	addExtraButton(): this {
		return this;
	}
}

/**
 * Setting 桩：记录设置值与边界，供测试断言设置页的实际行为。
 */
export class SliderComponent {
	inputEl: HTMLInputElement = undefined as unknown as HTMLInputElement;
	min = 0;
	max = 100;
	step = 1;
	value = 0;

	setLimits(min: number, max: number, step: number): this {
		this.min = min;
		this.max = max;
		this.step = step;
		return this;
	}

	setValue(value: number): this {
		this.value = value;
		return this;
	}

	getValue(): number {
		return this.value;
	}

	setDynamicTooltip(): this {
		return this;
	}

	onChange(): this {
		return this;
	}

	showTooltip(): void {
		/* noop */
	}
}

export class Notice {
	constructor(
		public message: string | DocumentFragment,
		public timeout?: number
	) {}

	setMessage(message: string | DocumentFragment): this {
		this.message = message;
		return this;
	}

	hide(): void {
		/* noop */
	}
}

export const Platform = { isDesktopApp: true, isMobileApp: false };

/**
 * 运行时特性探测桩。
 *
 * Obsidian 1.13+ 才有声明式设置 API；低于 1.13 的版本没有
 * `refreshDomState` / `update`。桩默认返回「支持 1.13」，
 * 测试需要模拟旧版时用 {@link setApiVersion} 切换。
 */
let apiVersion = "1.13.0";

export function requireApiVersion(version: string): boolean {
	const toNum = (v: string): number => {
		const parts = v.split(".").map((x) => parseInt(x, 10) || 0);
		return parts[0] * 1_000_000 + (parts[1] ?? 0) * 1_000 + (parts[2] ?? 0);
	};
	return toNum(apiVersion) >= toNum(version);
}

export function setApiVersion(version: string): void {
	apiVersion = version;
}

/**
 * moment 桩：i18n.ts 用 `moment.locale()` 取当前界面语言。
 *
 * 桩默认返回 "en"；测试需要中文文案时可以调用 `setLocale()`。
 */
export const moment = {
	locale(): string {
		return currentLocale;
	},
};

let currentLocale = "en";

export function setLocale(loc: string): void {
	currentLocale = loc;
}
