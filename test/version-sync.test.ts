import { describe, expect, it } from "vitest";
import {
	compareSemver,
	computeVersionSync,
	parseSemver,
	pickVersion,
} from "../version-sync.mjs";

/**
 * 版本号决策是发版链路上最容易出错、且出错代价最高的一环：
 * 版本号一旦错配，用户以后就再也收不到真正的修复版本（版本号已被占用）。
 * 这些用例把决策规则钉死，防止后续改动悄悄改变行为。
 */

describe("parseSemver", () => {
	it("parses a valid three-part version", () => {
		expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
		expect(parseSemver("0.0.0")).toEqual([0, 0, 0]);
		expect(parseSemver("10.20.30")).toEqual([10, 20, 30]);
	});

	it("rejects anything that is not a bare three-part semver", () => {
		expect(parseSemver("1.2")).toBeNull();
		expect(parseSemver("1.2.3.4")).toBeNull();
		expect(parseSemver("v1.2.3")).toBeNull();
		expect(parseSemver("1.2.3-rc1")).toBeNull();
		expect(parseSemver("")).toBeNull();
		expect(parseSemver(undefined)).toBeNull();
	});
});

describe("compareSemver", () => {
	it("orders by major, then minor, then patch", () => {
		expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
		expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
		expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
		expect(compareSemver("1.2.0", "1.10.0")).toBe(-1);
		expect(compareSemver("2.0.0", "1.99.99")).toBe(1);
	});

	it("returns null when either side is not valid semver", () => {
		expect(compareSemver("1.2", "1.2.3")).toBeNull();
		expect(compareSemver("1.2.3", "abc")).toBeNull();
	});
});

describe("pickVersion", () => {
	it("uses the npm version when it is newer than the manifest", () => {
		// `npm version patch` 的正常路径：npm 已把新版本写进 package.json。
		expect(
			pickVersion({ manifestVersion: "1.0.5", npmVersion: "1.0.6" }),
		).toBe("1.0.6");
	});

	it("uses the npm version when it equals the manifest version", () => {
		expect(pickVersion({ manifestVersion: "1.0.5", npmVersion: "1.0.5" })).toBe(
			"1.0.5",
		);
	});

	it("never downgrades the manifest when package.json lags behind", () => {
		// 历史漂移场景：package.json 停在 0.1.0，manifest 已经是 0.2.0。
		// `npm run version`（不升版、只同步）传进来的正是 package.json 的旧值，
		// 若直接采用就会把正确的 manifest 版本号降级——那才是事故。
		expect(
			pickVersion({ manifestVersion: "0.2.0", npmVersion: "0.1.0" }),
		).toBe("0.2.0");
	});

	it("falls back to the manifest version when npm provides nothing usable", () => {
		expect(pickVersion({ manifestVersion: "1.0.5" })).toBe("1.0.5");
		expect(pickVersion({ manifestVersion: "1.0.5", npmVersion: undefined })).toBe(
			"1.0.5",
		);
		expect(pickVersion({ manifestVersion: "1.0.5", npmVersion: "" })).toBe("1.0.5");
	});

	it("returns null when no version can be determined", () => {
		expect(pickVersion({})).toBeNull();
		expect(pickVersion({ manifestVersion: undefined, npmVersion: undefined })).toBeNull();
	});
});

describe("computeVersionSync", () => {
	const manifest = {
		id: "multifolio",
		name: "MultiFolio",
		version: "1.0.5",
		minAppVersion: "1.8.7",
	};

	it("syncs all three files to the target version", () => {
		const next = computeVersionSync({
			manifest,
			packageJson: { name: "multifolio", version: "1.0.5" },
			versions: { "1.0.5": "1.8.7" },
			targetVersion: "1.0.6",
		});

		expect(next?.manifest.version).toBe("1.0.6");
		expect(next?.packageJson.version).toBe("1.0.6");
		expect(next?.versions["1.0.6"]).toBe("1.8.7");
		expect(next?.skippedVersionsEntry).toBe(false);
	});

	it("pulls a lagging package.json back to the manifest version", () => {
		const next = computeVersionSync({
			manifest,
			packageJson: { name: "multifolio", version: "0.1.0" },
			versions: { "1.0.5": "1.8.7" },
			targetVersion: "1.0.5",
		});
		expect(next?.packageJson.version).toBe("1.0.5");
	});

	it("keeps the historical minAppVersion of an already released version", () => {
		// versions.json 记录的是「该版本起要求的最低 Obsidian 版本」，是历史事实，
		// 不能因为今天改了 minAppVersion 就改写过去版本的条目。
		const next = computeVersionSync({
			manifest: { ...manifest, minAppVersion: "1.9.0" },
			packageJson: { version: "1.0.5" },
			versions: { "1.0.5": "1.8.7" },
			targetVersion: "1.0.5",
		});
		expect(next?.versions["1.0.5"]).toBe("1.8.7");
	});

	it("does not write an undefined entry when minAppVersion is missing", () => {
		const { minAppVersion, ...manifestWithoutMin } = manifest;
		const next = computeVersionSync({
			manifest: manifestWithoutMin,
			packageJson: { version: "1.0.5" },
			versions: { "1.0.5": "1.8.7" },
			targetVersion: "1.0.6",
		});
		expect(next?.versions["1.0.6"]).toBeUndefined();
		expect("1.0.6" in (next?.versions ?? {})).toBe(false);
		expect(next?.skippedVersionsEntry).toBe(true);
	});

	it("never produces an undefined version field", () => {
		// 回归用例：旧脚本在没有 npm 环境变量时会把 manifest.version 写成
		// undefined，JSON.stringify 会直接丢掉这个字段 —— Obsidian 读到一份
		// 没有 version 的 manifest，插件将无法安装。
		const next = computeVersionSync({
			manifest,
			packageJson: { version: "1.0.5" },
			versions: {},
			targetVersion: "1.0.6",
		});
		expect(next?.manifest.version).toBe("1.0.6");
		expect("version" in (next?.manifest ?? {})).toBe(true);
	});

	it("returns null when the target version is missing", () => {
		expect(
			computeVersionSync({
				manifest,
				packageJson: {},
				versions: {},
				targetVersion: null,
			}),
		).toBeNull();
	});

	it("does not mutate its inputs", () => {
		const originalManifest = { ...manifest };
		const originalPackage = { version: "1.0.5" };
		const originalVersions = { "1.0.5": "1.8.7" };
		computeVersionSync({
			manifest: originalManifest,
			packageJson: originalPackage,
			versions: originalVersions,
			targetVersion: "1.0.6",
		});
		expect(originalManifest.version).toBe("1.0.5");
		expect(originalPackage.version).toBe("1.0.5");
		expect(Object.keys(originalVersions)).toEqual(["1.0.5"]);
	});
});
