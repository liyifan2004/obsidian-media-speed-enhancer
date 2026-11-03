/**
 * version-sync.mjs 的类型声明。
 *
 * 本仓库的 tsconfig 没有开 allowJs（folio 开了），tsc 无法推断 .mjs 的
 * 类型 —— 没有这份声明，test/version-sync.test.ts 会报 TS7016。
 * 用 .d.mts 后缀是为了让 TS 按 ESM 解析并匹配 .mjs 的模块解析。
 */
export interface VersionSyncInput {
	manifest: Record<string, unknown>;
	packageJson: Record<string, unknown>;
	versions: Record<string, unknown>;
	targetVersion: string | null;
}

export interface VersionSyncResult {
	manifest: Record<string, unknown>;
	packageJson: Record<string, unknown>;
	versions: Record<string, unknown>;
	/** versions.json 是否因为缺 minAppVersion 而没写新条目。 */
	skippedVersionsEntry: boolean;
}

export function parseSemver(value: unknown): [number, number, number] | null;
export function compareSemver(a: unknown, b: unknown): number | null;
export function pickVersion(input: {
	manifestVersion?: unknown;
	npmVersion?: unknown;
}): string | null;
export function computeVersionSync(input: VersionSyncInput): VersionSyncResult | null;
