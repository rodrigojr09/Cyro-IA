const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: ['vendor-entry.js'],
  bundle: true,
  minify: true,
  outfile: 'vendor.js',
  legalComments: 'linked',
});

esbuild.buildSync({
  entryPoints: ['quick-spotify-entry.js'],
  bundle: true,
  minify: true,
  outfile: 'quick-spotify.js',
});
