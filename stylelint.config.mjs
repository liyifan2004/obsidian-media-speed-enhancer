/**
 * Stylelint 配置。
 *
 * ## 为什么只强制一部分规则
 *
 * 底座是 `stylelint-config-obsidianmd` —— **Obsidian 商店审查用的同一份规则集**。
 * 它默认带了一堆 stylelint-standard 的风格规则（空行、rgba→rgb、
 * kebab-case 类名……），而本仓库的存量 CSS 早于这套规则，写法自然不一致。
 *
 * 全量整改意味着**几百行的纯排版改动**，既不解决审查提出的问题，
 * 也会淹没真正需要 review 的 diff —— 审查这次提的恰恰是
 * 「!important」与「:has()」这两条**行为性**规则。
 *
 * 所以这里的策略是：
 *   - **强制**：审查真正关心的行为性规则（!important / :has()）。
 *     这两条一旦回潮，插件会再次从商店列表下架 —— 必须在提交时就拦下。
 *   - **关闭**：纯风格类规则（排版、颜色记法、类名格式）。
 *     它们不影响审查结论，改动量却很大。真要改，另开一个专门的
 *     「CSS 风格统一」提交做，不与行为修复混在一起。
 *
 * 关键的两条保留为 error（不是 warning）——
 * 审查把这两条列为 Warning，但后果是「插件被下架」，不是「看着不优雅」。
 */
export default {
	extends: ["stylelint-config-obsidianmd"],
	rules: {
		// ---- 审查关心的行为性规则：保持 error ----
		"declaration-no-important": true,
		"selector-pseudo-class-disallowed-list": [["has"]],

		// ---- 纯风格类规则：与审查无关，关闭 ----
		// 排版类
		"rule-empty-line-before": null,
		"at-rule-empty-line-before": null,
		"comment-empty-line-before": null,
		"declaration-block-single-line-max-declarations": null,
		// 颜色记法类（rgba→rgb / 0.5→50%）
		"color-function-alias-notation": null,
		"color-function-notation": null,
		"alpha-value-notation": null,
		"color-named": null,
		// 选择器格式类
		"selector-class-pattern": null,
		"no-descending-specificity": null,
		// 浏览器前缀类（-webkit-user-select 在 Electron 里仍需要）
		"property-no-vendor-prefix": null,
		// 媒体查询写法类（max-width: 480px 与 (width <= 480px) 等价）
		"media-feature-range-notation": null,
	},
};
