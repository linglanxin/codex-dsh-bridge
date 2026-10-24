import { readFile, writeFile, mkdir, mkdtemp, cp, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
const exec = promisify(execFile);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const plugin = 'plugins/dsh-desktop';
await mkdir('outputs', { recursive: true });
await mkdir('work', { recursive: true });
await mkdir(join(plugin, 'desktop'), { recursive: true });
const stage = await mkdtemp('work/plugin-pack-');
try {
  const packed = JSON.parse(
    (
      await exec(
        'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', resolve(stage)],
        { maxBuffer: 4 * 1024 * 1024 },
      )
    ).stdout,
  )[0];
  for (const f of packed.files)
    if (/(^|\/)(node_modules|work|outputs|auth\.token|\.env)(\/|$)/.test(f.path))
      throw new Error(`Private/generated file in Desktop archive: ${f.path}`);
  await cp(join(stage, packed.filename), join(plugin, 'desktop', packed.filename));
  await cp(join(stage, packed.filename), join('outputs', packed.filename));
  await exec(process.execPath, ['scripts/verify-plugin.mjs']);
  const walk = async (path, exclude = new Set()) => {
    const result = [];
    for (const item of await readdir(path, { withFileTypes: true })) {
      if (exclude.has(item.name)) continue;
      const target = join(path, item.name);
      if (item.isSymbolicLink()) throw new Error(`Unexpected symlink in distribution: ${target}`);
      if (item.isDirectory()) result.push(...(await walk(target, exclude)));
      else result.push(target);
    }
    return result.sort();
  };
  const portable = {
    '.agents/plugins/marketplace.json': await readFile('.agents/plugins/marketplace.json'),
  };
  for (const file of await walk(plugin)) portable[file] = await readFile(file);
  for (const file of [
    'LICENSE',
    'NOTICE',
    'icon.svg',
    'README.md',
    'README.zh-CN.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    ...(await walk('docs')),
  ])
    portable[file] = await readFile(file);
  const prefix = `dsh-desktop-codex-plugin-${pkg.version}`;
  await writeFile(
    join('outputs', `${prefix}.zip`),
    zipSync(
      Object.fromEntries(Object.entries(portable).map(([p, bytes]) => [`${prefix}/${p}`, bytes])),
      { level: 9 },
    ),
  );
  const sourceFiles = await walk('.', new Set(['.git', 'node_modules', 'work', 'outputs']));
  const source = {};
  for (const file of sourceFiles)
    source[`dsh-desktop-mcp-bridge/${relative('.', file).replaceAll('\\', '/')}`] =
      await readFile(file);
  await writeFile(
    join('outputs', `dsh-desktop-mcp-bridge-source-${pkg.version}.zip`),
    zipSync(source, { level: 9 }),
  );
  const archives = [
    `${prefix}.zip`,
    `dsh-desktop-mcp-bridge-${pkg.version}.tgz`,
    `dsh-desktop-mcp-bridge-source-${pkg.version}.zip`,
  ].sort();
  const checksums = await Promise.all(
    archives.map(
      async (name) =>
        `${createHash('sha256')
          .update(await readFile(join('outputs', name)))
          .digest('hex')}  ${name}\n`,
    ),
  );
  await writeFile('outputs/SHA256SUMS.txt', checksums.join(''));
  console.log(
    `Prepared local Codex marketplace ZIP, source ZIP and ${packed.filename}. Nothing installed or published.`,
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
