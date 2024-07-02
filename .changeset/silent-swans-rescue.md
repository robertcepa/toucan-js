---
'toucan-js': major
---

This release upgrades the underlying Sentry SDKs to v8.

- Toucan now extends [ScopeClass](https://github.com/getsentry/sentry-javascript/blob/master/packages/core/src/scope.ts) instead of Hub.
- Class-based integrations have been removed in Sentry v8. Toucan adapts to this change by renaming:
  - `Dedupe` integration to `dedupeIntegration`
  - `ExtraErrorData` integration to `extraErrorDataIntegration`
  - `RewriteFrames` integration to `rewriteFramesIntegration`
  - `SessionTiming` integration to `sessionTimingIntegration`
  - `LinkedErrors` integration to `linkedErrorsIntegration`
  - `RequestData` integration to `requestDataIntegration`
- Additionally, `Transaction` integration is no longer provided.
- Toucan instance can now be deeply copied using `Toucan.clone()`.

Refer to [Sentry v8 release notes](https://github.com/getsentry/sentry-javascript/releases/tag/8.0.0) and [Sentry v7->v8](https://github.com/getsentry/sentry-javascript/blob/8.0.0/MIGRATION.md) for additional context.
