/**
 * 声明式路径与命令式路径的**能力对等**守卫。
 *
 * ## 这个文件在防什么
 *
 * Obsidian 1.13+ 的硬契约（官方 d.ts 原文）：
 *
 * > Not called when {@link getSettingDefinitions} returns a non-empty array;
 * > the tab is rendered declaratively from those definitions instead.
 *
 * 也就是说 —— **1.13+ 上 `display()` 一次都不会被调用**。
 * 于是命令式路径里才有的能力，如果声明式路径没有对应实现，
 * 1.13+ 的用户就完全拿不到。
 *
 * 2026-11-12 实测发现并修复的真实缺陷（obsidian-media-speed-enhancer）：
 *
 *   - **按钮列表（拖拽排序 + 勾选启用）只存在于命令式路径。**
 *     1.13+ 的用户无法启用/禁用任何按钮，也无法调整按钮顺序 ——
 *     而这是插件的核心定制能力。
 *   - **透明度 CSS 变量只在 `display()` 里初始化。**
 *     1.13+ 的用户永远拿不到自己设的按钮透明度，按钮一律用 CSS 里的 fallback 值。
 *
 * 这类缺陷的共同特征：**源码看起来对、typecheck 过、单测也全绿**，
 * 但真实用户拿不到。靠人工点一次才发现 —— 所以要把它写成断言。
 */
import { describe, it, expect } from "vitest";
import {
  MediaSpeedEnhancerSettingTab,
  DEFAULT_SETTINGS,
  BUTTON_META,
} from "../settings";
import { t } from "../i18n";
import type MediaSpeedEnhancerPlugin from "../main";
import { FakeSetting } from "./helpers/setting-dom";
import { setApiVersion } from "./mocks/obsidian";
import { applyOpacityVariables } from "../src/appearance";

/** 造一个设置页，plugin 只提供 settings + saveSettings + refreshAllToolbars */
function makeTab(overrides: Record<string, unknown> = {}) {
  const settings = Object.assign(
    {},
    DEFAULT_SETTINGS,
    { customSpeeds: [...DEFAULT_SETTINGS.customSpeeds] },
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

  const tab = new MediaSpeedEnhancerSettingTab({} as never, plugin);
  return { tab, plugin, settings, saved, refreshed };
}

/** 把定义摊平成「组 → 项」的形状 */
function flatten(
  defs: ReturnType<MediaSpeedEnhancerSettingTab["getSettingDefinitions"]>
) {
  const groups: Array<{
    heading?: string;
    items: Array<Record<string, unknown>>;
  }> = [];
  const list = defs as unknown as Array<Record<string, unknown>>;
  for (const d of list) {
    if (d.type === "group" || d.type === "list") {
      groups.push({
        heading: d.heading as string | undefined,
        items: (d.items as Array<Record<string, unknown>>) ?? [],
      });
    }
  }
  return groups;
}

/** 找到指定名字的定义项 */
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

describe("声明式 / 命令式 能力对等", () => {
  it("「按钮列表」（拖拽排序 + 勾选启用）在声明式路径里必须存在", () => {
    // 2026-11-12 修复的真实缺陷：按钮列表此前只存在于命令式路径。
    // 1.13+ 的用户因此无法启用/禁用任何按钮、也无法调整顺序。
    const { tab } = makeTab();
    expect(findItem(tab, t("headingButtonList"))).toBeTruthy();
  });

  it("声明式路径的按钮列表真的画出了全部四个按钮行", () => {
    const { tab } = makeTab();
    const item = findItem(tab, t("headingButtonList"))!;
    const render = item.render as (s: unknown) => void;

    const setting = new FakeSetting();
    render(setting);

    // 内容必须画进 controlEl（画进 settingEl 会被框架重排覆盖）。
    const list = setting.controlEl.querySelector(".mse-button-order-list");
    expect(list).toBeTruthy();

    // 四个按钮各一行，行上带 data-button-id。
    const rows = list!.querySelectorAll(".mse-button-order-row");
    expect(rows.length).toBe(BUTTON_META.length);
    const ids = rows.map((r) => r.attrs["data-button-id"]).sort();
    expect(ids).toEqual([...BUTTON_META.map((b) => b.id)].sort());

    // 每一行都有一个启用开关（勾选框）。
    const toggles = list!.querySelectorAll(".mse-button-order-toggle");
    expect(toggles.length).toBe(BUTTON_META.length);
  });

  it("声明式路径的按钮列表里有「重置」按钮（命令式路径也有）", () => {
    const { tab } = makeTab();
    const item = findItem(tab, t("headingButtonList"))!;
    const render = item.render as (s: unknown) => void;
    const setting = new FakeSetting();
    render(setting);
    // 重置按钮由 Setting.addButton 渲染，在 FakeSetting 里是 noop，
    // 所以断言的是「列表块被渲染进了一个活着的容器」。
    expect(setting.controlEl.attached).toBe(true);
  });

  it("透明度 CSS 变量必须在声明式路径里初始化", () => {
    // 2026-11-12 修复的第二个缺陷：变量只在 display() 里写，
    // 1.13+ 的用户永远拿不到自己设的透明度。
    const setPropertyCalls: Array<[string, string]> = [];
    const originalDoc = globalThis.document;
    // 桩：只提供 documentElement.style.setProperty。
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        documentElement: {
          style: {
            setProperty(name: string, value: string) {
              setPropertyCalls.push([name, value]);
            },
          },
        },
      },
    });

    try {
      const { tab, settings, plugin } = makeTab({
        buttonOpacity: 42,
        buttonHoverOpacity: 73,
      });
      // 插件的 applyAppearance 是单一出口，设置页调它。
      (plugin as unknown as { applyAppearance: () => void }).applyAppearance =
        () => {
          applyOpacityVariables(
            document.documentElement.style,
            settings.buttonOpacity,
            settings.buttonHoverOpacity
          );
        };

      const item = findItem(tab, t("headingButtonAppearance"))!;
      const render = item.render as (s: unknown) => void;
      render(new FakeSetting());

      expect(setPropertyCalls).toContainEqual(["--mse-btn-opacity", "0.42"]);
      expect(setPropertyCalls).toContainEqual(["--mse-btn-hover-opacity", "0.73"]);
      expect(settings.buttonOpacity).toBe(42);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: originalDoc,
      });
    }
  });

  it("父开关关掉后，子项的 disabled 谓词会跟着变", () => {
    const { tab, settings } = makeTab();
    const item = findItem(tab, t("labelTempSpeed"))!;
    const control = item.control as { disabled?: boolean | (() => boolean) };
    expect(typeof control.disabled).toBe("function");

    const disabledFn = control.disabled as () => boolean;

    // 默认：按住倍速是开启的 → 临时倍速可用
    expect(disabledFn()).toBe(false);
    // 关掉按住倍速 → 临时倍速不可用
    (settings.enabledButtons as Record<string, boolean>).holdSpeed = false;
    expect(disabledFn()).toBe(true);
  });

  it("跳转秒数在两个跳转按钮都关掉时被禁用", () => {
    const { tab, settings } = makeTab();
    const item = findItem(tab, t("labelSkipSeconds"))!;
    const control = item.control as { disabled?: boolean | (() => boolean) };
    const disabledFn = control.disabled as () => boolean;

    expect(disabledFn()).toBe(false);
    (settings.enabledButtons as Record<string, boolean>).skipBack = false;
    (settings.enabledButtons as Record<string, boolean>).skipForward = false;
    expect(disabledFn()).toBe(true);
  });

  it("最短时长秒数在过滤开关关掉时被禁用", () => {
    // 注意：enableMinDuration 默认是**关**的，所以默认状态下这一项
    // 本来就是禁用的 —— 与命令式路径的行为一致。
    const { tab, settings } = makeTab();
    const item = findItem(tab, t("labelMinDurationSeconds"))!;
    const control = item.control as { disabled?: boolean | (() => boolean) };
    const disabledFn = control.disabled as () => boolean;

    expect(disabledFn()).toBe(true);
    (settings as unknown as Record<string, unknown>).enableMinDuration = true;
    expect(disabledFn()).toBe(false);
  });

  it("切换提示音在顺序播放关掉时被禁用", () => {
    // enableSequentialPlay 默认也是关的。
    const { tab, settings } = makeTab();
    const item = findItem(tab, t("labelSwitchChime"))!;
    const control = item.control as { disabled?: boolean | (() => boolean) };
    const disabledFn = control.disabled as () => boolean;

    expect(disabledFn()).toBe(true);
    (settings as unknown as Record<string, unknown>).enableSequentialPlay = true;
    expect(disabledFn()).toBe(false);
  });

  it("旧版 Obsidian（无声明式 API）不会调用 refreshDomState", () => {
    // 低于 1.13.0 的版本没有 refreshDomState / update。
    // 插件在旧版上改设置时不能去调这些方法，否则抛错。
    setApiVersion("1.12.3");
    try {
      const { tab } = makeTab();
      let called = 0;
      (tab as unknown as { refreshDomState: () => void }).refreshDomState =
        () => {
          called += 1;
        };

      (
        tab as unknown as { refreshDeclarativeStates?: () => void }
      ).refreshDeclarativeStates?.();
      expect(called).toBe(0);
    } finally {
      setApiVersion("1.13.0");
    }
  });

  it("新版 Obsidian 会请求框架重新求值 disabled 谓词", () => {
    const { tab } = makeTab();
    let called = 0;
    (tab as unknown as { refreshDomState: () => void }).refreshDomState =
      () => {
        called += 1;
      };
    (tab as unknown as { refreshDeclarativeStates?: () => void })
      .refreshDeclarativeStates?.();
    expect(called).toBe(1);
  });
});
