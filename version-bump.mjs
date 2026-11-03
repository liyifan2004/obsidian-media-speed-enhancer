import { readFileSync, writeFileSync } from 'fs';
import { pickVersion, computeVersionSync } from './version-sync.mjs';

/**
 * 版本号同步脚本 —— 让 `npm version` 成为唯一的版本号入口。
 *
 * 为什么需要它：`npm version` 只改 package.json，而 Obsidian 读的是
 * manifest.json。本仓库长期手工改 manifest，导致 package.json 与
 * manifest.json 的版本号漂移。
 *
 * 用法：
 *   npm version patch       # 1.0.40 -> 1.0.41，自动同步下面三处
 *   npm run version         # 不改版本号，只把已有版本号同步到三处
 *
 * 版本号以 **manifest.json 为准**（Obsidian 真正读的那份）。若 npm 刚把
 * package.json 改成了更高的版本号则以 npm 的为准，否则以 manifest 为准
 * 并把落后的 package.json 拉回来——既能正常发版，也能自动修复漂移。
 *
 * 同步目标：
 *   - manifest.json  的 version（基准）
 *   - package.json   的 version
 *   - versions.json  新增 "<version>": "<minAppVersion>" 条目
 *
 * versions.json 是 Obsidian 的历史兼容表：每个发布过的版本对应它所需的
 * 最低 Obsidian 版本，用户从旧版本升级时 Obsidian 用它判断能否直升。
 *
 * 决策逻辑在 version-sync.mjs（纯函数，有单元测试覆盖）。
 */

/** 读写 JSON 时保留原文件的缩进风格与结尾换行，避免产生大片无关格式 diff。 */
function readJson(path) {
	const raw = readFileSync(path, 'utf8');
	return {
		data: JSON.parse(raw),
		indent: /^\t/m.test(raw) ? '\t' : /^\s+/m.test(raw) ? '  ' : '\t',
		trailingNewline: raw.endsWith('\n'),
	};
}

function writeJson(path, data, indent, trailingNewline) {
	let text = JSON.stringify(data, null, indent);
	if (trailingNewline) text += '\n';
	writeFileSync(path, text);
}

const manifestFile = readJson('manifest.json');
const pkgFile = readJson('package.json');
const versionsFile = readJson('versions.json');

/** npm 刚写入的版本号（`npm run version` 时为 package.json 的现值）。 */
const npmVersion = process.env.npm_package_version;

const targetVersion = pickVersion({
	manifestVersion: manifestFile.data.version,
	npmVersion,
});

if (!targetVersion) {
	console.error(
		'version-bump.mjs 无法确定目标版本号：manifest.json 与 package.json 都缺少合法的 version 字段。',
	);
	process.exit(1);
}

const next = computeVersionSync({
	manifest: manifestFile.data,
	packageJson: pkgFile.data,
	versions: versionsFile.data,
	targetVersion,
});

if (!next) {
	console.error('version-bump.mjs 读取到的 manifest.json / versions.json 结构不合法。');
	process.exit(1);
}

writeJson('manifest.json', next.manifest, manifestFile.indent, manifestFile.trailingNewline);
writeJson('versions.json', next.versions, versionsFile.indent, versionsFile.trailingNewline);
writeJson('package.json', next.packageJson, pkgFile.indent, pkgFile.trailingNewline);

if (next.skippedVersionsEntry) {
	console.warn(
		`version-bump: manifest.json 缺少 minAppVersion，versions.json 未登记 ${targetVersion}。`,
	);
}

console.log(
	`version-bump: ${targetVersion} (minAppVersion ${manifestFile.data.minAppVersion ?? '—'}) — ` +
		'manifest.json / versions.json / package.json 已同步',
);
