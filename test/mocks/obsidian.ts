/**
 * Obsidian API 的最小桩模块。
 *
 * 只在测试里使用（通过 vitest.config.mts 的 alias 把 "obsidian" 指到这里）。
 * 只实现被测代码真正用到的那部分 API，行为尽量贴近真实 Obsidian。
 */

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
}

export class Setting {
	constructor(_el: unknown) {}

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
 * 滑块组件桩：记录设置值与边界，供测试断言设置页的实际行为。
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
