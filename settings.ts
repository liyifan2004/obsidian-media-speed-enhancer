import { App, PluginSettingTab, Setting } from "obsidian";
import type MediaSpeedEnhancerPlugin from "./main";

/**
 * 插件设置接口。
 * - tempSpeed: 按住倍速按钮触发时的临时 playbackRate
 * - customSpeeds: 调整倍速菜单中可选的永久倍速列表
 * - showButtons: 总开关；关闭则不再注入任何按钮
 * - enableTouchOptimization: 启用 pointer events 适配触屏
 * - toolbarAutoHide: 工具栏是否在 hover media 时自动显示
 * - skipSeconds: 后退/前进按钮的秒数（v1.0.8 新增）
 * - globalSync: 全局倍速同步——开启后调整任意音频的倍速会同步到所有音频（v1.0.8 新增）
 * - enableMinDuration: 启用最短时长过滤（v1.0.12 新增）
 * - minDurationSeconds: 最短时长阈值，低于此值的音频不注入按钮（v1.0.12 新增）
 * - enablePlayPause: 是否注入播放/暂停按钮（v1.0.13 新增，默认关闭）
 * - alwaysExpand: 始终展开所有按钮（不受 hover 限制）（v1.0.13 新增，默认关闭）
 */
/**
 * 按钮 ID 类型（用于 enabledButtons + buttonOrder）
 * - anchor 总是显示，不在此处配置
 * - skipBack/skipForward/holdSpeed/playPause 可配置开关和顺序
 */
export type ButtonId = "skipBack" | "skipForward" | "holdSpeed" | "playPause";

/**
 * 按钮元数据：显示名称、描述、默认启用状态
 */
export interface ButtonMeta {
  id: ButtonId;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export const BUTTON_META: ButtonMeta[] = [
  {
    id: "skipBack",
    name: "后退 N 秒",
    description: "单击后退 N 秒（默认 5 秒，可在「跳转」分组设置）",
    defaultEnabled: true,
  },
  {
    id: "skipForward",
    name: "前进 N 秒",
    description: "单击前进 N 秒",
    defaultEnabled: true,
  },
  {
    id: "holdSpeed",
    name: "按住临时倍速",
    description: "按住临时加速到设置值，松开恢复",
    defaultEnabled: true,
  },
  {
    id: "playPause",
    name: "播放/暂停",
    description: "原生控件已有播放按钮；开启后会多一个可自定义位置的按钮",
    defaultEnabled: false,
  },
];

export interface MediaSpeedEnhancerSettings {
  tempSpeed: number;
  customSpeeds: number[];
  showButtons: boolean;
  enableTouchOptimization: boolean;
  toolbarAutoHide: boolean;
  skipSeconds: number;
  globalSync: boolean;
  enableMinDuration: boolean;
  minDurationSeconds: number;
  /** v1.0.27: 每个按钮是否启用 */
  enabledButtons: Record<ButtonId, boolean>;
  /** v1.0.27: 按钮显示顺序 */
  buttonOrder: ButtonId[];
}

/**
 * 默认自定义倍速列表（v1.0.8 调整）：
 * - 0.5, 0.75（慢速）
 * - 1.0, 1.1, 1.2, ..., 2.0（0.1 间隔细调）
 * - 2.5, 3.0（快速）
 */
const DEFAULT_CUSTOM_SPEEDS: number[] = [
  0.5, 0.75,
  1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
  2.5, 3.0,
];

export const DEFAULT_SETTINGS: MediaSpeedEnhancerSettings = {
  tempSpeed: 2.0,
  customSpeeds: [...DEFAULT_CUSTOM_SPEEDS],
  showButtons: true,
  enableTouchOptimization: true,
  toolbarAutoHide: true,
  skipSeconds: 5,
  globalSync: false,
  enableMinDuration: false,
  minDurationSeconds: 30,
  enabledButtons: Object.fromEntries(
    BUTTON_META.map((b) => [b.id, b.defaultEnabled])
  ) as Record<ButtonId, boolean>,
  buttonOrder: BUTTON_META.map((b) => b.id),
};

// P1-6: 倍速边界收紧到 0.25 - 4.0
const SPEED_MIN = 0.25;
const SPEED_MAX = 4.0;

// 后退/前进秒数边界
const SKIP_MIN = 1;
const SKIP_MAX = 60;

/**
 * 解析用户输入的 customSpeeds 文本。
 * - 每行一个数字
 * - 自动去重 + 过滤非法值（NaN、越界）
 * - 升序排序
 * - 若解析结果为空，回退到 DEFAULT_SETTINGS.customSpeeds
 */
export function parseCustomSpeeds(input: string): number[] {
  const parsed: number[] = [];
  for (const lineRaw of input.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const v = Number(line);
    if (!Number.isFinite(v) || v < SPEED_MIN || v > SPEED_MAX) continue;
    parsed.push(v);
  }
  const unique = Array.from(
    new Set(parsed.map((x) => Number(x.toFixed(3))))
  );
  unique.sort((a, b) => a - b);
  if (unique.length === 0) {
    return [...DEFAULT_CUSTOM_SPEEDS];
  }
  return unique;
}

export function formatCustomSpeeds(speeds: number[]): string {
  return speeds.map((s) => s.toString()).join("\n");
}

export class MediaSpeedEnhancerSettingTab extends PluginSettingTab {
  private readonly plugin: MediaSpeedEnhancerPlugin;
  private customSpeedsDraft: string = "";

  constructor(app: App, plugin: MediaSpeedEnhancerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Media Speed Enhancer" });

    const intro = containerEl.createDiv({ cls: "setting-item-description" });
    intro.style.marginBottom = "16px";
    intro.style.color = "var(--text-muted)";
    intro.createEl("p", {
      text: "在原生 HTML5 audio/video 播放器上叠加 10s 跳转、按住倍速、自定义倍速切换等最小侵入式增强。",
    });
    intro.createEl("p", {
      text: "v1.0.8 · 作者 李轶凡",
      cls: "setting-item-description",
    }).style.opacity = "0.7";

    // ========================================================================
    // 倍速设置分组
    // ========================================================================
    const speedSection = containerEl.createDiv({ cls: "mse-settings-section" });
    speedSection.createEl("div", {
      text: "倍速",
      cls: "mse-settings-section-title",
    });

    // --- 临时倍速数值 ---
    new Setting(speedSection)
      .setName("临时倍速")
      .setDesc(
        "按住『按住倍速』按钮时使用的 playbackRate。松开恢复原始倍速。"
      )
      .addText((text) => {
        text.setPlaceholder("2.0")
          .setValue(String(this.plugin.settings.tempSpeed))
          .onChange(async (value) => {
            const num = Number(value);
            if (Number.isFinite(num) && num >= SPEED_MIN && num <= SPEED_MAX) {
              this.plugin.settings.tempSpeed = num;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = String(SPEED_MIN);
        text.inputEl.max = String(SPEED_MAX);
        text.inputEl.step = "0.25";
      });

    // --- 自定义倍速列表 ---
    this.customSpeedsDraft = formatCustomSpeeds(
      this.plugin.settings.customSpeeds
    );
    new Setting(speedSection)
      .setName("自定义倍速列表")
      .setDesc(
        `每行一个数字，范围 ${SPEED_MIN}-${SPEED_MAX}。点击空白处保存。\n\n` +
          `默认值：${DEFAULT_CUSTOM_SPEEDS.join("、")}`
      )
      .addTextArea((text) => {
        text.setPlaceholder(DEFAULT_CUSTOM_SPEEDS.join("\n"))
          .setValue(this.customSpeedsDraft);

        text.onChange((value) => {
          this.customSpeedsDraft = value;
        });

        text.inputEl.addEventListener("blur", () => {
          const parsed = parseCustomSpeeds(this.customSpeedsDraft);
          this.plugin.settings.customSpeeds = parsed;
          void this.plugin.saveSettings();
          const normalized = formatCustomSpeeds(parsed);
          this.customSpeedsDraft = normalized;
          if (text.inputEl.value !== normalized) {
            text.setValue(normalized);
          }
        });

        text.inputEl.rows = 10;
        text.inputEl.cols = 28;
        text.inputEl.addClass("mse-textarea");
      });

    // --- 全局倍速同步 ---
    new Setting(speedSection)
      .setName("全局倍速同步")
      .setDesc(
        "开启后，在任意音频/视频处调整的倍速将自动同步到所有打开的媒体。" +
          "关闭时，每个媒体的倍速独立保存。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.globalSync)
          .onChange(async (value) => {
            this.plugin.settings.globalSync = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );

    // --- 最短时长过滤（v1.0.12） ---
    new Setting(speedSection)
      .setName("启用最短时长过滤")
      .setDesc(
        "开启后，仅对时长超过指定秒数的音频/视频注入按钮。" +
          "短音频（如音效、提示音）保持原生控制条不变。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableMinDuration)
          .onChange(async (value) => {
            this.plugin.settings.enableMinDuration = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
            // 显示/隐藏时长输入框
            minDurationSetting.settingEl.style.display = value
              ? ""
              : "none";
          })
      );

    // --- 最短时长秒数 ---
    const minDurationSetting = new Setting(speedSection)
      .setName("最短时长秒数")
      .setDesc("低于此时长的音频不显示任何按钮。")
      .addText((text) => {
        text.setPlaceholder("30")
          .setValue(String(this.plugin.settings.minDurationSeconds))
          .onChange(async (value) => {
            const num = Number(value);
            if (Number.isFinite(num) && num >= 1 && num <= 3600) {
              this.plugin.settings.minDurationSeconds = num;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "3600";
        text.inputEl.step = "1";
      });
    // 默认关闭时隐藏时长输入框
    if (!this.plugin.settings.enableMinDuration) {
      minDurationSetting.settingEl.style.display = "none";
    }

    // ========================================================================
    // 跳转设置分组
    // ========================================================================
    const skipSection = containerEl.createDiv({ cls: "mse-settings-section" });
    skipSection.createEl("div", {
      text: "跳转",
      cls: "mse-settings-section-title",
    });

    // --- 后退/前进秒数 ---
    new Setting(skipSection)
      .setName("后退 / 前进秒数")
      .setDesc("点击『后退』/『前进』按钮时跳转的秒数。")
      .addText((text) => {
        text.setPlaceholder("5")
          .setValue(String(this.plugin.settings.skipSeconds))
          .onChange(async (value) => {
            const num = Number(value);
            if (
              Number.isFinite(num) &&
              num >= SKIP_MIN &&
              num <= SKIP_MAX &&
              Number.isInteger(num)
            ) {
              this.plugin.settings.skipSeconds = num;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = String(SKIP_MIN);
        text.inputEl.max = String(SKIP_MAX);
        text.inputEl.step = "1";
      });

    // ========================================================================
    // 显示设置分组
    // ========================================================================
    const displaySection = containerEl.createDiv({ cls: "mse-settings-section" });
    displaySection.createEl("div", {
      text: "显示",
      cls: "mse-settings-section-title",
    });

    // --- 是否显示按钮 ---
    new Setting(displaySection)
      .setName("显示按钮")
      .setDesc("关闭后不注入任何按钮（媒体元素仍可正常使用）。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showButtons)
          .onChange(async (value) => {
            this.plugin.settings.showButtons = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );

    // --- 工具栏自动隐藏 ---
    new Setting(displaySection)
      .setName("工具栏自动隐藏")
      .setDesc(
        "开启时仅在鼠标悬停在当前倍速按钮上时显示 4 个功能按钮；关闭则常驻显示。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.toolbarAutoHide)
          .onChange(async (value) => {
            this.plugin.settings.toolbarAutoHide = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );

    // --- 始终展开所有按钮（v1.0.13） ---
    new Setting(displaySection)
      .setName("始终展开所有按钮")
      .setDesc(
        "开启后功能按钮常驻显示，无需 hover。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.alwaysExpand)
          .onChange(async (value) => {
            this.plugin.settings.alwaysExpand = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );

    // ========================================================================
    // 按钮配置分组（v1.0.27）：开关 + 拖拽排序
    // ========================================================================
    const buttonSection = containerEl.createDiv({ cls: "mse-settings-section" });
    buttonSection.createEl("h3", { text: "按钮配置" });
    buttonSection.createEl("p", {
      cls: "setting-item-description",
      text: "自定义要显示的功能按钮及其顺序。当前倍速按钮始终显示在最左侧。",
    });

    // --- 按钮开关列表 ---
    new Setting(buttonSection)
      .setName("启用的按钮")
      .setDesc("勾选要显示的按钮；关闭的按钮不占用工具栏空间。");

    const enabledList = buttonSection.createDiv({ cls: "mse-button-toggle-list" });
    for (const meta of BUTTON_META) {
      const row = enabledList.createDiv({ cls: "mse-button-toggle-row" });
      const cb = row.createEl("input", {
        type: "checkbox",
        attr: { id: `mse-toggle-${meta.id}` },
      });
      cb.checked = this.plugin.settings.enabledButtons[meta.id];
      const label = row.createEl("label", {
        text: meta.name,
        attr: { for: `mse-toggle-${meta.id}` },
      });
      label.createEl("span", {
        cls: "setting-item-description",
        text: meta.description,
      });
      cb.addEventListener("change", async () => {
        this.plugin.settings.enabledButtons[meta.id] = cb.checked;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllToolbars();
      });
    }

    // --- 按钮排序（HTML5 拖拽） ---
    new Setting(buttonSection)
      .setName("按钮顺序")
      .setDesc("拖拽调整功能按钮的显示顺序。当前倍速按钮固定在最左侧，不参与排序。");

    const orderList = buttonSection.createDiv({ cls: "mse-button-order-list" });
    let dragSrcId: ButtonId | null = null;
    const orderRows: Map<ButtonId, HTMLElement> = new Map();
    for (const id of this.plugin.settings.buttonOrder) {
      const meta = BUTTON_META.find((b) => b.id === id);
      if (!meta) continue;
      const row = orderList.createDiv({
        cls: "mse-button-order-row",
        attr: { "data-button-id": id, draggable: "true" },
      });
      const handle = row.createSpan({
        cls: "mse-button-order-handle",
        text: "≡",
      });
      handle.setAttr("aria-hidden", "true");
      row.createSpan({ text: meta.name, cls: "mse-button-order-label" });
      orderRows.set(id, row);

      row.addEventListener("dragstart", (e) => {
        dragSrcId = id;
        row.classList.add("mse-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
        }
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("mse-dragging");
        dragSrcId = null;
        orderList.querySelectorAll(".mse-drag-over").forEach((el) =>
          el.classList.remove("mse-drag-over")
        );
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        row.classList.add("mse-drag-over");
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("mse-drag-over");
      });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        row.classList.remove("mse-drag-over");
        const fallback = e.dataTransfer?.getData("text/plain") as ButtonId | "";
        const src = dragSrcId ?? (fallback || null);
        if (!src || src === id) return;
        const newOrder = [...this.plugin.settings.buttonOrder];
        const srcIdx = newOrder.indexOf(src);
        const dstIdx = newOrder.indexOf(id);
        if (srcIdx < 0 || dstIdx < 0) return;
        newOrder.splice(srcIdx, 1);
        newOrder.splice(dstIdx, 0, src);
        this.plugin.settings.buttonOrder = newOrder;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllToolbars();
        // 视觉重排 DOM
        for (const bid of newOrder) {
          const r = orderRows.get(bid);
          if (r) orderList.appendChild(r);
        }
      });
    }

    // --- 重置按钮配置 ---
    new Setting(buttonSection)
      .setName("重置按钮配置")
      .setDesc("恢复默认的按钮顺序和启用状态。")
      .addButton((btn) =>
        btn.setButtonText("重置").onClick(async () => {
          this.plugin.settings.buttonOrder = BUTTON_META.map((b) => b.id);
          this.plugin.settings.enabledButtons = Object.fromEntries(
            BUTTON_META.map((b) => [b.id, b.defaultEnabled])
          ) as Record<ButtonId, boolean>;
          await this.plugin.saveSettings();
          await this.plugin.refreshAllToolbars();
          this.display();
        })
      );


    // ========================================================================
    // 兼容性设置分组
    // ========================================================================
    const compatSection = containerEl.createDiv({ cls: "mse-settings-section" });
    compatSection.createEl("div", {
      text: "兼容性",
      cls: "mse-settings-section-title",
    });

    // --- 是否启用触摸优化 ---
    new Setting(compatSection)
      .setName("启用触摸优化")
      .setDesc(
        "开启时使用 pointer events 适配触屏；关闭时仅绑 mousedown/mouseup（更省 CPU）。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTouchOptimization)
          .onChange(async (value) => {
            this.plugin.settings.enableTouchOptimization = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );
  }
}