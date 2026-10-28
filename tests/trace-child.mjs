// Test-only subprocess tracing. Never print arguments, file paths or credentials.
import childProcess from 'node:child_process';
import http from 'node:http';
import { basename } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const trace = text => process.stderr.write(`MCP_CHILD ${text}\n`);
const execFileSync = childProcess.execFileSync;
childProcess.execFileSync = function (file, ...args) {
  const name = basename(file);
  trace(`exec ${name} begin`);
  const started = Date.now();
  try { return execFileSync.call(this, file, ...args); }
  finally { trace(`exec ${name} end ${Date.now() - started}ms`); }
};
const request = http.request;
http.request = function (...args) {
  trace('http request begin');
  const req = request.apply(this, args);
  req.on('socket', socket => { trace('http socket assigned'); socket.on('connect', () => trace('http socket connected')); });
  req.on('response', response => trace(`http response ${response.statusCode}`));
  req.on('error', error => trace(`http error ${error.code ?? error.name}`));
  return req;
};
syncBuiltinESMExports();
