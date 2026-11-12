/**
 * 测试用的假 DOM —— 模拟 Obsidian 的容器与 Setting。
 *
 * ## 为什么不用朴素桩
 *
 * `test/mocks/obsidian.ts` 里的 `Setting` 桩把 `controlEl` / `settingEl`
 * 定义成**互相独立**的对象，也不跟踪「脱离 DOM」状态。
 *
 * 这类朴素桩天然查不出两类真实缺陷：
 *
 * 1. **「A 被清空导致 B 失效」** —— 真实 Obsidian 里
 *    `setting.settingEl.empty()` 会连带清掉 `controlEl`（它是 settingEl 的子节点），
 *    清掉之后往 controlEl 画的内容不会出现在页面上。
 *    朴素桩里两个容器各清各的，永远查不出来。
 *
 * 2. **「自定义块画进了错误的容器」** —— 声明式路径要求内容画进 `controlEl`，
 *    画进 `settingEl` 会被框架重排覆盖。
 *
 * 所以这里自己造一个能跟踪父子关系与脱离状态的 fake，
 * 让「画在哪儿」「清掉谁」都能被断言。
 */

/** 模拟 Obsidian 的容器。 */
export class FakeEl {
	children: FakeEl[] = [];
	/** 被 empty() 清掉后为 false —— 表示「已脱离 DOM」。 */
	attached = true;
	classes: string[] = [];
	attrs: Record<string, string> = {};
	/** input[type=checkbox] 的勾选状态 */
	checked = false;
	/** input 的其它常用属性 */
	value = "";
	rows = 0;
	cols = 0;
	/** 记录事件监听，便于断言「没有重复绑定」。 */
	listeners: Record<string, number> = {};
	text = "";

	constructor(public tag = "div") {}

	/** Obsidian 的 createDiv/createSpan 接受 `{cls, text, attr}` 或一个 cls 字符串。 */
	private applyOpts(el: FakeEl, opts?: unknown): FakeEl {
		if (typeof opts === "string") {
			if (opts) el.classes.push(opts);
			return el;
		}
		if (opts && typeof opts === "object") {
			const o = opts as { cls?: string; text?: string; attr?: Record<string, string> };
			if (o.cls) el.classes.push(o.cls);
			if (o.text !== undefined) el.text = o.text;
			if (o.attr) Object.assign(el.attrs, o.attr);
		}
		return el;
	}

	appendChild(child: FakeEl): FakeEl {
		this.children.push(child);
		return child;
	}

	createDiv(opts?: unknown): FakeEl {
		const el = this.applyOpts(new FakeEl("div"), opts);
		this.appendChild(el);
		return el;
	}

	createSpan(opts?: unknown): FakeEl {
		const el = this.applyOpts(new FakeEl("span"), opts);
		this.appendChild(el);
		return el;
	}

	createEl(tag: string, opts?: unknown): FakeEl {
		const el = this.applyOpts(new FakeEl(tag), opts);
		this.appendChild(el);
		return el;
	}

	addClass(cls: string): void {
		this.classes.push(cls);
	}

	removeClass(cls: string): void {
		this.classes = this.classes.filter((c) => c !== cls);
	}

	hasClass(cls: string): boolean {
		return this.classes.includes(cls);
	}

	/** 与 DOM 的 classList 语义一致：toggle 的第二个参数是「强制为这个状态」。 */
	classList = {
		add: (cls: string) => this.addClass(cls),
		remove: (cls: string) => this.removeClass(cls),
		contains: (cls: string) => this.hasClass(cls),
		toggle: (cls: string, force?: boolean) => {
			const shouldAdd = force ?? !this.hasClass(cls);
			if (shouldAdd) this.addClass(cls);
			else this.removeClass(cls);
			return shouldAdd;
		},
	};

	setText(text: string): void {
		this.text = text;
	}

	setAttr(name: string, value: string): void {
		this.attrs[name] = value;
	}

	setAttribute(name: string, value: string): void {
		this.attrs[name] = value;
	}

	getAttribute(name: string): string | null {
		return this.attrs[name] ?? null;
	}

	removeAttribute(name: string): void {
		delete this.attrs[name];
	}

	addEventListener(type: string): void {
		this.listeners[type] = (this.listeners[type] ?? 0) + 1;
	}

	removeEventListener(type: string): void {
		this.listeners[type] = Math.max(0, (this.listeners[type] ?? 0) - 1);
	}

	querySelectorAll(selector: string): FakeEl[] {
		const cls = selector.replace(/^\./, "");
		const out: FakeEl[] = [];
		const walk = (el: FakeEl) => {
			for (const child of el.children) {
				if (child.hasClass(cls)) out.push(child);
				walk(child);
			}
		};
		walk(this);
		return out;
	}

	querySelector(selector: string): FakeEl | null {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	/**
	 * 清空自身与全部后代，并把后代标记为「已脱离 DOM」。
	 *
	 * 关键：真实 Obsidian 的 `settingEl.empty()` 会**连带清掉 controlEl**
	 * （controlEl 是 settingEl 的子节点），清掉之后往 controlEl 里画的内容
	 * 不会出现在页面上。所以这里递归把子节点也标记为脱离。
	 */
	empty(): void {
		const walk = (el: FakeEl) => {
			el.attached = false;
			for (const child of el.children) walk(child);
			el.children.length = 0;
		};
		walk(this);
		this.attached = false;
	}
}

/**
 * 模拟 Obsidian 的 Setting。
 *
 * 父子关系与真实 Obsidian 一致：`settingEl > (infoEl, controlEl)`。
 */
export class FakeSetting {
	settingEl = new FakeEl();
	infoEl = new FakeEl();
	controlEl = new FakeEl();
	name = "";
	desc = "";
	classes: string[] = [];

	constructor() {
		this.settingEl.appendChild(this.infoEl);
		this.settingEl.appendChild(this.controlEl);
	}

	setName(n: string): this {
		this.name = n;
		return this;
	}

	setDesc(d: string): this {
		this.desc = d;
		return this;
	}

	setHeading(): this {
		return this;
	}

	setClass(cls: string): this {
		this.classes.push(cls);
		this.settingEl.addClass(cls);
		return this;
	}

	setTooltip(): this {
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

	addButton(): this {
		return this;
	}

	addExtraButton(): this {
		return this;
	}
}

/**
 * 模拟 Obsidian 1.13+ 声明式渲染器对 render 回调的处理。
 *
 * 这是守卫的核心：**返回值非 undefined 且非函数 → 抛 TypeError**，
 * 与真实 Obsidian 的行为一致（`TypeError: t is not a function`）。
 */
export function invokeRender(
	render: (setting: unknown, group: unknown) => unknown,
	setting: FakeSetting
): void {
	const result = render(setting, undefined);
	if (result !== undefined && result !== null) {
		if (typeof result !== "function") {
			throw new TypeError("t is not a function");
		}
		(result as () => void)();
	}
}
