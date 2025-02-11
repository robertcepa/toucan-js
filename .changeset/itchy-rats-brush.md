---
'toucan-js': patch
---

chore: Export Zod errors integration and add upstream improvements

- Adds improvements based on feedback I got while PR'ing this to sentry-javascript: https://github.com/getsentry/sentry-javascript/pull/15111
- Exports zodErrorsIntegration in the root index.ts (missed this in the original PR)
