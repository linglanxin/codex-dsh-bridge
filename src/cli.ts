#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { initialize } from './config.ts';
import { BridgeClient } from './transport.ts';
import { serveMcp } from './mcp.ts';
import { BridgeError, publicError } from './errors.ts';
import { prepareSetup, resolveConfigFile } from './setup.ts';
async function main() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        config: { type: 'string' },
        'state-dir': { type: 'string' },
        'workspace-root': { type: 'string' },
        'plugin-root': { type: 'string' },
      },
    });
    const command = positionals[0] ?? 'help';
    if (command === 'init') {
      if (!values['state-dir'] || !values['workspace-root'])
        throw new BridgeError('USAGE', 'init requires --state-dir and --workspace-root');
      const file = await initialize(values['state-dir'], values['workspace-root']);
      console.log(
        `Created private bridge config: ${file}\nReview allowedTools and repositories before enabling the Desktop plugin.`,
      );
    } else if (command === 'setup') {
      console.log(
        JSON.stringify(
          await prepareSetup(
            {
              config: values.config,
              stateDir: values['state-dir'],
              workspaceRoot: values['workspace-root'],
            },
            values['plugin-root'],
          ),
          null,
          2,
        ),
      );
    } else if (command === 'stdio' || command === 'doctor') {
      const config = resolveConfigFile(values.config);
      if (command === 'stdio') {
        const server = await serveMcp(config, values['plugin-root']);
        const stop = () => {
          void server.close().finally(() => process.exit(0));
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      } else {
        console.log(
          JSON.stringify(
            await (await BridgeClient.fromConfig(config)).call('connection_info', {}),
            null,
            2,
          ),
        );
      }
    } else {
      console.log(
        'dsh-desktop-mcp setup [--state-dir PATH --workspace-root PATH]\ndsh-desktop-mcp init --state-dir PATH --workspace-root PATH\ndsh-desktop-mcp doctor --config FILE\ndsh-desktop-mcp stdio --config FILE',
      );
    }
  } catch (error) {
    console.error(JSON.stringify(publicError(error)));
    process.exitCode = 1;
  }
}
void main();
