import { defineConfig } from "tsup";

export default defineConfig((options) => {
  const isWatch = options.watch;
  return {
    ...options,
    entry: ["src/index.ts"],
    format: ["esm" as const],
    splitting: true, //technically true by default for esm, but we'll be explicit
    sourcemap: !isWatch,
    minify: !isWatch,
    clean: !isWatch,
    onSuccess: "tsc",
  };
});
