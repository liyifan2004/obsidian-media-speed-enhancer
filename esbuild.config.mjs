import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

/**
 * Obsidian 插件 esbuild 打包脚本
 * - production: 单次打包，关闭 watch
 * - 其他（默认 dev）: watch 模式，inline sourcemap
 */

const prod = process.argv[2] === "production";

// Obsidian 在运行时通过全局 require/暴露的方式提供这些模块，
// 打包时必须 external，避免把它们打进 main.js 导致体积膨胀或版本冲突。
const external = [
  "obsidian",
  "electron",
  "@codemirror/view",
  "@codemirror/state",
  "@lezer/common",
  "@lezer/highlight",
  "node:fs",
  "node:path",
  "node:os",
  "fs",
  "path",
  "os",
];

const config = {
  entryPoints: ["main.ts"],
  bundle: true,
  external: external.concat(builtins),
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  minify: prod,
  logLevel: "info",
  treeShaking: true,
};

if (prod) {
  await esbuild.build(config);
  console.log("[media-speed-enhancer] production build complete -> main.js");
} else {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("[media-speed-enhancer] watching for changes... (Ctrl+C to stop)");
}