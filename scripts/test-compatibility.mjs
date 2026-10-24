import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import targets from '../src/compatibility.json' with { type: 'json' };
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: { desktop: { type: 'string' } } });
const selected = values.desktop ? targets.filter((t) => t.desktop === values.desktop) : targets;
if (!selected.length) throw new Error('Choose a Desktop version in src/compatibility.json.');
const oldPins = {
  '@deepseek-ai/cordis': '4.0.4',
  '@deepseek-ai/cordis-plugin-group': '1.0.4',
  '@deepseek-ai/cordis-plugin-loader': '1.0.5',
  '@deepseek-ai/cordis-plugin-logger-console': '1.0.4',
  '@deepseek-ai/cordis-plugin-hmr': '1.0.19',
  '@deepseek-ai/cordis-plugin-include': '1.0.9',
  '@deepseek-ai/cosmokit': '1.8.5',
  '@deepseek-ai/cordis-plugin-timer': '1.1.6',
  '@deepseek-ai/schemastery': '3.18.4',
};
await mkdir(join(root, 'work'), { recursive: true });
for (const target of selected) {
  const stage = await mkdtemp(join(root, 'work', 'compatibility-'));
  try {
    for (const path of ['src', 'tests', 'dist', 'plugins', '.agents', 'tsconfig.json'])
      await cp(join(root, path), join(stage, path), { recursive: true });
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    for (const section of ['devDependencies', 'overrides']) {
      for (const name of Object.keys(pkg[section])) {
        if (name.startsWith('@deepseek-ai/dsh-')) pkg[section][name] = target.desktop;
        else if (target.desktop === '0.2.0-rc.2' && oldPins[name])
          pkg[section][name] = oldPins[name];
      }
    }
    await writeFile(join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
    const run = async (args) => {
      try {
        const r = await exec('npm', args, {
          cwd: stage,
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            npm_config_cache: resolve(root, 'work', 'compatibility-npm-cache'),
          },
        });
        process.stdout.write(r.stdout);
        process.stderr.write(r.stderr);
      } catch (error) {
        process.stdout.write(error.stdout ?? '');
        process.stderr.write(error.stderr ?? '');
        throw new Error(`Compatibility check failed for ${target.desktop}: npm ${args.join(' ')}`);
      }
    };
    console.log(
      `Checking exact Desktop ${target.desktop} / Cordis ${target.cordis} in an isolated dependency tree.`,
    );
    await run(['install', '--ignore-scripts', '--no-audit', '--no-fund']);
    await run(['run', 'typecheck']);
    await run(['test']);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
