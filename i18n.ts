import { moment } from "obsidian";

/**
 * i18n：按 Obsidian UI 语言返回文案。
 * moment.locale() 返回 Obsidian 当前界面语言（"en"、"zh-cn" 等），
 * 插件自动跟随，无需用户在设置里再选一次。
 */

const en = {
	cmdSkipBack: "Skip back N seconds",
	cmdSkipFwd: "Skip forward N seconds",
	cmdTempSpeed: "Toggle temporary speed",
	cmdPlayPause: "Play / Pause",
	ariaAnchor: "Current speed (click to open speed menu)",
	skipBackBtn: "Skip back {n} seconds",
	skipFwdBtn: "Skip forward {n} seconds",
	ariaTempSpeed: "Hold for temporary speed (release to restore)",
	ariaPlayPause: "Play / Pause",
	menuTitle: "Speed",
	menuEmpty: "(no speeds configured)",
	btnSkipBack: "Skip back",
	btnSkipBackDesc: "Skip back N seconds on click",
	btnSkipFwd: "Skip forward",
	btnSkipFwdDesc: "Skip forward N seconds on click",
	btnTempSpeed: "Hold for temporary speed",
	btnTempSpeedDesc: "Hold to speed up temporarily, release to restore",
	btnPlayPause: "Play / Pause",
	btnPlayPauseDesc: "Add an extra play / pause button",
	headingButtons: "Buttons",
	headingButtonAppearance: "Button appearance",
	labelBgOpacity: "Button background opacity",
	descBgOpacity: "0 = transparent, 100 = solid.",
	labelHoverOpacity: "Button hover background opacity",
	descHoverOpacity: "Background opacity while hovered.",
	enableBtnAria: "Enable {name}",
	dragHint: "Drag to reorder, tick to enable.",
	reset: "Reset",
	headingSpeed: "Speed",
	labelTempSpeed: "Temporary speed",
	descTempSpeed: "The playbackRate used while the speed button is held.",
	resetTooltip: "Restore default",
	labelCustomSpeeds: "Custom speed list",
	descCustomSpeeds: "One number per line, range {min}-{max}. Click elsewhere to save.",
	labelGlobalSync: "Global speed sync",
	descGlobalSync: "When you change the speed of any media, sync it to all open media.",
	headingSkip: "Skip",
	labelSkipSeconds: "Skip back / forward seconds",
	descSkipSeconds: "Seconds jumped by the skip back / forward buttons.",
	headingToolbar: "Toolbar",
	labelAutoHide: "Auto-hide toolbar",
	descAutoHide:
		"When enabled, the enabled buttons only show while hovering over the current-speed button; when disabled they always stay visible.",
	labelMinDuration: "Minimum duration filter",
	descMinDuration: "Only inject buttons into media longer than the given seconds, so short sound effects stay untouched.",
	labelMinDurationSeconds: "Minimum duration in seconds",
	descMinDurationSeconds: "Media shorter than this shows no buttons.",
	labelAutoPlayNext: "Auto-play next",
	descAutoPlayNext: "When the current audio ends, automatically play the next audio in the same note.",
	labelSwitchChime: "Switch chime",
	descSwitchChime: "Play a short 660 Hz chime when auto-play moves to the next audio.",
	headingCompat: "Compatibility",
	labelTouch: "Touch optimization",
	descTouch: "Use pointer events for touch screens; when off, only mousedown/mouseup are bound.",
};

const zh: Record<keyof typeof en, string> = {
	cmdSkipBack: "后退 N 秒",
	cmdSkipFwd: "前进 N 秒",
	cmdTempSpeed: "切换临时倍速",
	cmdPlayPause: "播放 / 暂停",
	ariaAnchor: "当前倍速（点击打开倍速菜单）",
	skipBackBtn: "后退 {n} 秒",
	skipFwdBtn: "前进 {n} 秒",
	ariaTempSpeed: "按住临时倍速（松开恢复）",
	ariaPlayPause: "播放/暂停",
	menuTitle: "倍速",
	menuEmpty: "（未配置倍速）",
	btnSkipBack: "后退",
	btnSkipBackDesc: "单击后退 N 秒",
	btnSkipFwd: "前进",
	btnSkipFwdDesc: "单击前进 N 秒",
	btnTempSpeed: "按住临时倍速",
	btnTempSpeedDesc: "按住临时加速，松开恢复",
	btnPlayPause: "播放/暂停",
	btnPlayPauseDesc: "额外提供一个播放/暂停按钮",
	headingButtons: "按钮",
	headingButtonAppearance: "按钮外观",
	labelBgOpacity: "按钮背景透明度",
	descBgOpacity: "0=透明，100=实色。",
	labelHoverOpacity: "按钮 hover 背景透明度",
	descHoverOpacity: "鼠标悬停时的背景透明度。",
	enableBtnAria: "启用{name}",
	dragHint: "拖拽调整顺序，勾选启用。",
	reset: "重置",
	headingSpeed: "倍速",
	labelTempSpeed: "临时倍速",
	descTempSpeed: "按住『按住倍速』按钮时使用的 playbackRate。",
	resetTooltip: "还原默认值",
	labelCustomSpeeds: "自定义倍速列表",
	descCustomSpeeds: "每行一个数字，范围 {min}-{max}。点击空白处保存。",
	labelGlobalSync: "全局倍速同步",
	descGlobalSync: "调整任意媒体的倍速时，自动同步到所有打开的媒体。",
	headingSkip: "跳转",
	labelSkipSeconds: "后退 / 前进秒数",
	descSkipSeconds: "点击『后退』/『前进』按钮时跳转的秒数。",
	headingToolbar: "工具栏",
	labelAutoHide: "工具栏自动隐藏",
	descAutoHide: "开启时仅在鼠标悬停在当前倍速按钮上时显示已启用的功能按钮；关闭则始终展开已启用的按钮。",
	labelMinDuration: "最短时长过滤",
	descMinDuration: "开启后仅对超过指定秒数的媒体注入按钮，避免短音效被影响。",
	labelMinDurationSeconds: "最短时长秒数",
	descMinDurationSeconds: "低于此时长的媒体不显示任何按钮。",
	labelAutoPlayNext: "启用顺序播放",
	descAutoPlayNext: "开启后，当前音频播放完会自动播放同一笔记中的下一个音频。",
	labelSwitchChime: "切换音频提示音",
	descSwitchChime: "顺序播放切换到下一个音频时播放 660Hz 短促提示音。",
	headingCompat: "兼容性",
	labelTouch: "启用触摸优化",
	descTouch: "使用 pointer events 适配触屏；关闭时仅绑 mousedown/mouseup。",
};

const localeMap: Record<string, Partial<typeof en>> = {
	en,
	zh,
	"zh-cn": zh,
};

/** 取当前语言文案；支持 {name} 形式的变量插值。 */
export function t(key: keyof typeof en, vars?: Record<string, string | number>): string {
	const loc = moment.locale();
	const dict = localeMap[loc] ?? localeMap[loc.split("-")[0]] ?? en;
	let s: string = (dict[key] as string | undefined) ?? en[key];
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			s = s.split("{" + k + "}").join(String(v));
		}
	}
	return s;
}
