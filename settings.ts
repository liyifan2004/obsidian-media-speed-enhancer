import { App, PluginSettingTab, Setting } from "obsidian";
import type MediaSpeedEnhancerPlugin from "./main";

/**
 * 插件设置接口。
 * - tempSpeed: 按住倍速按钮触发时的临时 playbackRate
 * - customSpeeds: 调整倍速菜单中可选的永久倍速列表
 * - showButtons: 总开关；关闭则不再注入任何按钮
 * - adjustSpeedButtonPosition: "调整倍速"按钮在工具栏内的相对位置
 * - enableTouchOptimization: 启用 pointer events 适配触屏；关闭则只绑 mousedown/mouseup
 * - toolbarAutoHide: 工具栏是否在 hover media 时自动显示；关闭则常驻
 */
export interface MediaSpeedEnhancerSettings {
  tempSpeed: number;
  customSpeeds: number[];
  showButtons: boolean;
  adjustSpeedButtonPosition: "after-volume" | "after-hold-speed";
  enableTouchOptimization: boolean;
  toolbarAutoHide: boolean;
}

export const DEFAULT_SETTINGS: MediaSpeedEnhancerSettings = {
  tempSpeed: 2.0,
  customSpeeds: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0],
  showButtons: true,
  adjustSpeedButtonPosition: "after-volume",
  enableTouchOptimization: true,
  toolbarAutoHide: true,
};

// P1-6: 倍速边界收紧到 0.25 - 4.0（与 tempSpeed 范围一致）
const SPEED_MIN = 0.25;
const SPEED_MAX = 4.0;

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
    // P1-6: 严格按用户契约 0.25 ≤ v ≤ 4.0
    if (!Number.isFinite(v) || v < SPEED_MIN || v > SPEED_MAX) continue;
    parsed.push(v);
  }
  const unique = Array.from(
    new Set(parsed.map((x) => Number(x.toFixed(3))))
  );
  unique.sort((a, b) => a - b);
  if (unique.length === 0) {
    return [...DEFAULT_SETTINGS.customSpeeds];
  }
  return unique;
}

export function formatCustomSpeeds(speeds: number[]): string {
  return speeds.map((s) => s.toString()).join("\n");
}

export class MediaSpeedEnhancerSettingTab extends PluginSettingTab {
  private readonly plugin: MediaSpeedEnhancerPlugin;

  /** P1-7: 自定义倍速文本草稿（onChange 写入，onBlur 规范化并持久化） */
  private customSpeedsDraft: string = "";

  constructor(app: App, plugin: MediaSpeedEnhancerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Media Speed Enhancer 设置" });

    // --- 临时倍速数值 ---
    new Setting(containerEl)
      .setName("临时倍速数值")
      // P2-3: 修正文案括号
      .setDesc("按住『按住倍速』按钮时使用的 playbackRate。范围 0.25 - 4.0。")
      .addText((text) => {
        text
          .setPlaceholder("2.0")
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

    // --- 自定义倍速列表（P1-7 修复：onChange 仅写草稿，onBlur 规范化） ---
    this.customSpeedsDraft = formatCustomSpeeds(
      this.plugin.settings.customSpeeds
    );
    new Setting(containerEl)
      .setName("自定义倍速列表")
      .setDesc(
        `每行一个数字，范围 ${SPEED_MIN}-${SPEED_MAX}；编辑后点击空白处保存`
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("1.0\n1.25\n1.5\n2.0")
          .setValue(this.customSpeedsDraft);

        // onChange：只更新草稿，不规范化、不持久化（避免 "1." 被立刻改成 "1"）
        text.onChange((value) => {
          this.customSpeedsDraft = value;
        });

        // onBlur：规范化并持久化（用户已停止输入）
        text.inputEl.addEventListener("blur", () => {
          const parsed = parseCustomSpeeds(this.customSpeedsDraft);
          this.plugin.settings.customSpeeds = parsed;
          void this.plugin.saveSettings();
          const normalized = formatCustomSpeeds(parsed);
          this.customSpeedsDraft = normalized;
          // 仅在文本框与规范结果不一致时才覆盖（避免光标跳动）
          if (text.inputEl.value !== normalized) {
            text.setValue(normalized);
          }
        });

        text.inputEl.rows = 8;
        text.inputEl.cols = 24;
        text.inputEl.addClass("mse-textarea");
      });

    // --- 是否显示按钮（P1-5：变化后调用 refreshAllToolbars） ---
    new Setting(containerEl)
      .setName("显示按钮")
      .setDesc("关闭后不注入任何按钮（MutationObserver 仍运行以保留位置）。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showButtons)
          .onChange(async (value) => {
            this.plugin.settings.showButtons = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );

    // --- 调整倍速按钮位置 ---
    new Setting(containerEl)
      .setName("『调整倍速』按钮位置")
      .setDesc(
        "覆盖层方案下：'after-volume' = 工具栏最右侧；'after-hold-speed' = 按住倍速按钮之后（倒数第二个）。"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("after-volume", "工具栏最右侧（默认）")
          .addOption("after-hold-speed", "按住倍速按钮之后")
          .setValue(this.plugin.settings.adjustSpeedButtonPosition)
          .onChange(async (value) => {
            if (value === "after-volume" || value === "after-hold-speed") {
              this.plugin.settings.adjustSpeedButtonPosition = value;
              await this.plugin.saveSettings();
              await this.plugin.refreshAllToolbars();
            }
          })
      );

    // --- 是否启用触摸优化 ---
    new Setting(containerEl)
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

    // --- 工具栏自动隐藏 ---
    new Setting(containerEl)
      .setName("工具栏自动隐藏")
      .setDesc("开启时 hover 媒体元素才展开；关闭则常驻显示全部按钮。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.toolbarAutoHide)
          .onChange(async (value) => {
            this.plugin.settings.toolbarAutoHide = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );
  }
}