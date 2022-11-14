const replace = require('@rollup/plugin-replace');
const typescript = require('rollup-plugin-typescript2');

const pkg = require('./package.json');

const makeExternalPredicate = (externalArr) => {
  if (externalArr.length === 0) {
    return () => false;
  }
  const pattern = new RegExp(`^(${externalArr.join('|')})($|/)`);
  return (id) => pattern.test(id);
};

module.exports = [
  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: 'src/index.ts',
    external: makeExternalPredicate([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ]),
    plugins: [
      replace({
        __name__: pkg.name,
        __version__: pkg.version,
      }),
      typescript({
        tsconfigOverride: {
          include: ['./src/**/*'],
          compilerOptions: {
            rootDir: 'src',
            outDir: 'dist',
          },
        },
      }), // so Rollup can convert TypeScript to JavaScript
    ],
    output: [
      { file: pkg.main, format: 'cjs' },
      { file: pkg.module, format: 'es' },
    ],
  },
];
