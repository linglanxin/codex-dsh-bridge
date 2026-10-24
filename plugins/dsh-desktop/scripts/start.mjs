#!/usr/bin/env node
import { realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const pluginRoot = await realpath(join(dirname(fileURLToPath(import.meta.url)), '..'));
const bundle = join(pluginRoot, 'runtime', 'server.cjs');
const args = process.argv.slice(2);
// Load the prebuilt server in this process; no install hooks, shell or npm download.
process.argv = [
  process.execPath,
  bundle,
  ...(args.length ? args : ['stdio']),
  '--plugin-root',
  pluginRoot,
];
await import(pathToFileURL(bundle).href);
