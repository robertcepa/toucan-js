import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";

import pkg from "./package.json";

export default [
  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: "src/index.ts",
    external: ["@sentry/core", "uuid", "cookie", "stacktrace-js"],
    plugins: [
      replace({
        __name__: pkg.name,
        __version__: pkg.version,
      }),
      typescript(), // so Rollup can convert TypeScript to JavaScript
    ],
    output: [
      { file: pkg.main, format: "cjs" },
      { file: pkg.module, format: "es" },
    ],
  },
];
