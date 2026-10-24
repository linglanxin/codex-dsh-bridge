import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));
const pkg = await json('package.json');
const marketplace = await json('.agents/plugins/marketplace.json');
assert.equal(marketplace.name, 'dsh-desktop-bridge');
const entry = marketplace.plugins.find((p) => p.name === 'dsh-desktop');
assert.ok(entry);
assert.equal(entry.source.source, 'local');
const root = resolve(entry.source.path);
assert.ok(relative(process.cwd(), root) && !relative(process.cwd(), root).startsWith('..'));
const plugin = await json(join(root, 'plugin.json'));
assert.equal(plugin.name, entry.name);
assert.equal(plugin.version, pkg.version);
assert.equal(plugin.extensions['com.openai'].requires_local_executor, true);
const servers = await json(join(root, 'mcp.json'));
const server = servers.mcpServers['dsh-desktop'];
assert.equal(server.type, 'stdio');
assert.equal(server.command, 'node');
assert.equal(server.cwd, '${PLUGIN_ROOT}');
assert.deepEqual(server.args, ['${PLUGIN_ROOT}/scripts/start.mjs']);
for (const path of [
  'scripts/start.mjs',
  'runtime/server.cjs',
  'skills/dsh-desktop/SKILL.md',
  'THIRD_PARTY_NOTICES.txt',
  'LICENSE',
  'NOTICE',
  `desktop/dsh-desktop-mcp-bridge-${pkg.version}.tgz`,
]) {
  assert.ok(!isAbsolute(path));
  const target = resolve(root, path);
  assert.ok(!relative(root, target).startsWith('..'));
  assert.ok((await stat(target)).isFile(), `Missing packaged file ${path}`);
}
const bundle = await readFile(join(root, 'runtime/server.cjs'), 'utf8');
assert.ok(bundle.length > 1000);
console.log(
  `Verified portable Codex plugin ${plugin.name}@${plugin.version}, local marketplace and bundled Desktop adapter.`,
);
