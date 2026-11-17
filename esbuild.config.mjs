import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const isProd = process.argv.includes('--prod');
const isWatch = process.argv.includes('--watch');
const port = Number(process.env.PORT ?? 3000);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

// Z3's Emscripten build uses pthreads, so SharedArrayBuffer must be available.
// Browsers only expose it on cross-origin-isolated pages.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function startStaticServer(serverPort) {
  const root = process.cwd();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const filePath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        throw new Error('not a file');
      }
      response.writeHead(200, {
        ...ISOLATION_HEADERS,
        'Content-Length': info.size,
        'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        // Always revalidate after a watch rebuild.
        'Cache-Control': 'no-cache',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  server.listen(serverPort, () => {
    console.log(`dev server: http://localhost:${serverPort}`);
  });
  return server;
}

// z3-solver's browser build expects Emscripten's `initZ3` to exist as a page
// global. It also loads its WASM next to its own script, so both files are
// copied into dist/ and z3-built.js is included as a classic script (bundling
// it breaks Emscripten's worker/script lookup).
const Z3_BUILD_DIR = 'node_modules/z3-solver/build';
const Z3_ASSETS = ['z3-built.js', 'z3-built.wasm'];

/** @type {esbuild.Plugin} */
const z3AssetsPlugin = {
  name: 'z3-assets',
  setup(build) {
    build.onEnd(async result => {
      if (result.errors.length > 0) {
        return;
      }
      await mkdir('dist', { recursive: true });
      for (const asset of Z3_ASSETS) {
        const source = `${Z3_BUILD_DIR}/${asset}`;
        const target = `dist/${asset}`;
        try {
          const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target)]);
          if (sourceStat.size === targetStat.size && sourceStat.mtimeMs <= targetStat.mtimeMs) {
            continue;
          }
        } catch {
          // Target missing; fall through and copy it.
        }
        await copyFile(source, target);
      }
    });
  },
};

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ['src/app.ts', 'src/index.scss'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  platform: 'browser',
  loader: { '.png': 'file', '.md': 'text' },
  // z3-solver/browser reads the Emscripten init function from `global.initZ3`;
  // esbuild does not polyfill the Node.js `global` alias in browser bundles.
  define: { global: 'globalThis' },
  // File-loader assets (sprite sheets) land in dist/; prefix their URLs with
  // ./dist/ so inline-style background images resolve correctly at runtime,
  // including when the site is served from a GitHub Pages project subpath.
  publicPath: './dist/',
  plugins: [sassPlugin(), z3AssetsPlugin],
  sourcemap: !isProd,
  minify: isProd,
  legalComments: 'none',
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  startStaticServer(port);
} else {
  await esbuild.build(buildOptions);
}
