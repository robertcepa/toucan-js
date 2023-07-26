const { nodeResolve } = require('@rollup/plugin-node-resolve');
const { default: sentryRollupPlugin } = require('@sentry/rollup-plugin');
const typescript = require('rollup-plugin-typescript2');
const commonjs = require('@rollup/plugin-commonjs');

module.exports = [
  {
    input: 'src/index.ts',
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfigOverride: {
          include: ['./src/**/*'],
          compilerOptions: {
            rootDir: 'src',
            outDir: 'dist',
          },
        },
      }),
      ...(process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT &&
      process.env.SENTRY_AUTH_TOKEN
        ? [
            sentryRollupPlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              include: './dist',
              // Auth tokens can be obtained from https://sentry.io/settings/account/api/auth-tokens/
              // and need `project:releases` and `org:read` scopes
              authToken: process.env.SENTRY_AUTH_TOKEN,
            }),
          ]
        : []),
    ],
    output: [{ sourcemap: true, dir: './dist', format: 'es' }],
  },
];
