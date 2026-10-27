import { readFile } from 'node:fs/promises';
import { resolveConfigFile } from './setup.ts';
import { BridgeClient } from './transport.ts';
import { operations, type Operation } from './protocol.ts';
const [operation, inputFile] = process.argv.slice(2);
if (!operation || !(operation in operations)) throw Error('Supply a bridge operation and optional JSON input file.');
const client = await BridgeClient.fromConfig(resolveConfigFile());
const input = inputFile ? JSON.parse(await readFile(inputFile, 'utf8')) : {};
console.log(JSON.stringify(await client.call(operation as Operation, input), null, 2));
