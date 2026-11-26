import { defineConfig } from "tsup"

// watch keeps the old dist so `nest --watch` never sees it without index.d.ts
export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: !options.watch,
  sourcemap: true,
  target: "es2022",
}))
