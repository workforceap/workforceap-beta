# Vendored three.js

- Package: three@0.187.0 (npm), license MIT (see THREE-LICENSE.txt), (c) 2010-2026 three.js authors.
- File: three.module.min.js, SHA-256 07db7ffc6f3d0e7843bc4a66d2aa0fc2d749c1d632aec39ccab492f1535e6b9a
- How built: `npm pack three@0.187.0` in a scratch directory, then esbuild (scratch only, `--bundle --minify --format=esm`) over `build/three.module.js` + `three.core.js` into one file, because 0.187 ships no prebuilt .min.js. Not added to package.json or node_modules.
- Runtime: no CDN, no network.
