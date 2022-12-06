# wrangler-basic starter

This is an official `toucan-js` starter that uses [wrangler](https://github.com/cloudflare/wrangler2) to manage workflows and bundle code, and [sentry-cli](https://github.com/getsentry/sentry-cli) to upload sourcemaps to Sentry.

## Prerequisites

- [yarn](https://yarnpkg.com/getting-started/install) installed globally.
  - Run `yarn` to install all packages in this project.
- [Cloudflare](https://dash.cloudflare.com/sign-up) account.
  - Run `yarn wrangler login` to associate `wrangler` with your Cloudflare account.
- [Sentry](https://sentry.io/) account.
  - Create a new Sentry project. Choose `javascript` as the platform.

## Client setup

You will need to obtain [Sentry DSN](https://docs.sentry.io/product/sentry-basics/dsn-explainer/) for your Sentry project. Once you have it, update `SENTRY_DSN` variable in `wrangler.toml` with your value.

```toml
[vars]
SENTRY_DSN = "https://123:456@testorg.ingest.sentry.io/123"
```

## Sourcemaps setup

If you want to upload sourcemaps, you need to obtain 3 values and set them as environment variables.

```javascript
// This is your organization slug, you can find it in Settings in Sentry dashboard
export SENTRY_ORG="..."
// Your project name
export SENTRY_PROJECT="..."
// Auth tokens can be obtained from https://sentry.io/settings/account/api/auth-tokens/ and need `project:releases` and `org:read` scopes
export SENTRY_AUTH_TOKEN="..."
```

## Deployment

```
yarn deploy
```

## Development

```
yarn start
```

Runs the worker locally.
