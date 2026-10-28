const esbuild = require('esbuild');
esbuild.buildSync({
  absWorkingDir: __dirname,
  entryPoints: {
    main: 'scripts/app/main-entry.jsx',
    login: 'scripts/session/login-entry.jsx',
    quick: 'scripts/quick/quick-entry.jsx',
  },
  bundle: true,
  minify: true,
  outdir: 'dist',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  legalComments: 'linked',
});

require('node:fs').copyFileSync(
  require.resolve('highlight.js/styles/github-dark.css'),
  require('node:path').join(__dirname, 'dist/highlight.css'),
);
