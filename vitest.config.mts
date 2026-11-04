import { defineConfig } from "vitest/config";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			// Obsidian 只在真实应用里存在，测试时用桩模块顶替。
			obsidian: path.resolve(here, "test/mocks/obsidian.ts"),
			// 插件主模块必须显式指向源码 main.ts。
			// 仓库根目录同时存在**构建产物** main.js，
			// 无扩展名的相对导入会优先命中 .js —— 于是测试跑的是上一次构建的旧代码，
			// 源码改了测试也可能「全绿」（本轮就被这个坑绊过一次）。
			"@main": path.resolve(here, "main.ts"),
		},
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		clearMocks: true,
	},
});
