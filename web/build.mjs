// Bundles src/ into a single self-contained dist/index.html that works offline and from file://.
//   node build.mjs                    -> dist/index.html
//   node build.mjs --watch            -> rebuild on change
//   node build.mjs --fragment <file>  -> page body only, without <html>/<head> wrapper
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const fragmentPath = args.includes('--fragment') ? args[args.indexOf('--fragment') + 1] : null;

async function writePage(js) {
  const template = await readFile('index.html', 'utf8');
  const script = `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
  const body = template.replace('<!--BUNDLE-->', () => script);
  if (fragmentPath) {
    await writeFile(fragmentPath, body);
    console.log(`wrote ${fragmentPath}`);
    return;
  }
  const page =
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    body.replace('</style>', '</style>\n</head>\n<body>') +
    '\n</body>\n</html>\n';
  await mkdir('dist', { recursive: true });
  await writeFile('dist/index.html', page);
  console.log(`wrote dist/index.html (${(page.length / 1024).toFixed(0)} KB)`);
}

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  plugins: [{
    name: 'page',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length === 0) await writePage(result.outputFiles[0].text);
      });
    },
  }],
};

if (args.includes('--watch')) {
  await (await esbuild.context(options)).watch();
  console.log('watching src/ ...');
} else {
  await esbuild.build(options);
}
