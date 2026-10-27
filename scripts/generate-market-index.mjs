import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { parseMarketIndex, marketInstallTarget } from '@deepseek-ai/dsh-plugin-market-index';

const url = 'https://raw.githubusercontent.com/linglanxin/codex-dsh-bridge/main/market-index.json';
const commit = process.argv[2];
if (commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Supply a full committed Git SHA.');
  const show = path => execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8', windowsHide: true });
  const pkg = JSON.parse(show('package.json'));
  const zh = JSON.parse(show('locale/zh.json')).meta;
  const en = JSON.parse(show('locale/en.json')).meta;
  const publishTimestamp = Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { encoding: 'utf8', windowsHide: true }).trim());
  const document = {
    format: 1,
    title: { en: 'Codex–DSH Bridge community index', zh: 'Codex–DSH 桥接社区索引' },
    description: { en: 'An unofficial Windows Desktop bridge. Not an official endorsement.', zh: '非官方 Windows 桌面桥接，非官方审核或背书。' },
    plugins: [{
      name: pkg.name,
      title: { en: en.title, zh: zh.title },
      description: { en: en.description, zh: zh.description },
      icon: `data:image/svg+xml;base64,${Buffer.from(show('icon.svg')).toString('base64')}`,
      author: typeof pkg.author === 'object' ? pkg.author.name : pkg.author,
      homepage: pkg.homepage,
      repository: { url: 'https://github.com/linglanxin/codex-dsh-bridge' },
      metadata: { keywords: pkg.keywords },
      'dist-tags': { next: pkg.version },
      versions: [{
        version: pkg.version,
        publishTimestamp,
        source: { type: 'git', url: 'https://github.com/linglanxin/codex-dsh-bridge', commit },
        engines: { dsh: pkg.engines.dsh },
      }],
    }],
  };
  parseMarketIndex(document, url);
  await writeFile('market-index.json', JSON.stringify(document, null, 2) + '\n');
}
const index = parseMarketIndex(JSON.parse(await readFile('market-index.json', 'utf8')), url);
const plugin = index.plugins[0];
console.log(JSON.stringify({ valid: true, format: 1, url, name: plugin.name, version: plugin.versions[0].version, install: marketInstallTarget(plugin.name, plugin.versions[0]) }, null, 2));
