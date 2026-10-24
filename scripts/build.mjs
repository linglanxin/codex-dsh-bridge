import { build } from 'esbuild';
import supportedDesktops from '../src/compatibility.json' with { type: 'json' };
import { chmod, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/cli.ts', 'src/desktop-plugin.ts', 'src/call.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
});
await chmod('dist/cli.js', 0o755);
await writeFile(
  'dist/build-info.json',
  JSON.stringify(
    {
      bridge: pkg.version,
      supportedDesktops,
    },
    null,
    2,
  ),
);
const root = 'plugins/dsh-desktop';
await mkdir(join(root, 'runtime'), { recursive: true });
const bundled = await build({
  entryPoints: ['src/cli.ts'],
  outfile: join(root, 'runtime/server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  metafile: true,
  minify: true,
  legalComments: 'eof',
});
await chmod(join(root, 'scripts/start.mjs'), 0o755);
const roots = new Set();
for (const input of Object.keys(bundled.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue;
  let dir = dirname(resolve(input));
  for (;;) {
    try {
      const metadata = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      if (metadata.name) {
        roots.add(dir);
        break;
      }
    } catch {
      /* Keep walking to the dependency's package root. */
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No package attribution for ${input}`);
    dir = parent;
  }
}
const notices = [];
for (const dir of [...roots].sort()) {
  const p = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  const licenses = (await readdir(dir)).filter((n) => /^(licen[sc]e|copying)(\.|$)/i.test(n));
  if (!licenses.length) throw new Error(`License file missing for bundled ${p.name}`);
  const texts = await Promise.all(licenses.map((n) => readFile(join(dir, n), 'utf8')));
  notices.push(
    `===== ${p.name}@${p.version} (${p.license ?? 'see license text'}) =====\n${texts.join('\n')}`,
  );
}
await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));
