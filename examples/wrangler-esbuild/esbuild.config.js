const { default: sentryEsbuildPlugin } = require('@sentry/esbuild-plugin');

require('esbuild')
  .build({
    entryPoints: ['./src/index.ts'],
    outdir: './dist',
    bundle: true,
    sourcemap: true, // Source map generation must be turned on
    format: 'esm',
    plugins:
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT &&
      process.env.SENTRY_AUTH_TOKEN
        ? [
            sentryEsbuildPlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              include: './dist',
              // Auth tokens can be obtained from https://sentry.io/settings/account/api/auth-tokens/
              // and need `project:releases` and `org:read` scopes
              authToken: process.env.SENTRY_AUTH_TOKEN,
            }),
          ]
        : undefined,
  })
  .catch(() => process.exit(1));
