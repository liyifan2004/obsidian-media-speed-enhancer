import { defineConfig } from "vitest/config";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			// Obsidian 只在真实应用里存在，测试时用桩模块顶替。
			obsidian: path.resolve(here, "test/mocks/obsidian.ts"),
		},
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		clearMocks: true,
	},
});
