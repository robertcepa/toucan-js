const path = require('path');
const SentryWebpackPlugin = require('@sentry/webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  mode: 'none',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  experiments: {
    outputModule: true,
  },
  plugins:
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN
      ? [
          new SentryWebpackPlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            // Auth tokens can be obtained from https://sentry.io/settings/account/api/auth-tokens/
            // and need `project:releases` and `org:read` scopes
            authToken: process.env.SENTRY_AUTH_TOKEN,
            include: './dist',
          }),
        ]
      : undefined,
  output: {
    module: true,
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'module',
    },
  },
};
