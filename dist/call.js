// src/call.ts
import { readFile } from "node:fs/promises";

// src/setup.ts
import { homedir } from "node:os";
import { join as join2, resolve as resolve2 } from "node:path";

// src/config.ts
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";

// src/errors.ts
var BridgeError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "BridgeError";
  }
  code;
};
function fail(code, message) {
  throw new BridgeError(code, message);
}

// src/config.ts
var windowsSid;
var windowsAclCache = /* @__PURE__ */ new Map();
function currentWindowsSid() {
  return windowsSid ??= execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true }).match(/S-1-5-[0-9-]+/)?.[0] ?? fail("UNSAFE_PATH", "Cannot resolve current Windows identity.");
}
function verifyWindowsAcl(path, changed) {
  if (process.platform !== "win32" || windowsAclCache.get(path) === changed) return;
  const script = `$ErrorActionPreference='Stop'; $acl=Get-Acl -LiteralPath $env:DSH_BRIDGE_ACL_PATH; $allowed=@('${currentWindowsSid()}','S-1-5-18','S-1-5-32-544'); foreach($rule in $acl.Access){ if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed){ throw 'Bridge path has permissions for other accounts' } }; 'OK'`;
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", windowsHide: true, env: { ...process.env, PSModulePath: join(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/Modules"), DSH_BRIDGE_ACL_PATH: path }, stdio: "pipe" });
  } catch {
    fail("UNSAFE_PATH", "Windows bridge state must be private to this account, SYSTEM and Administrators.");
  }
  windowsAclCache.set(path, changed);
}
var configSchema = z.object({
  version: z.literal(1),
  stateDir: z.string(),
  workspaceRoot: z.string(),
  workspaceTitle: z.string().trim().min(1).max(128).optional(),
  allowedTools: z.array(z.string().min(1).max(128)).max(100),
  allowedPresets: z.array(z.string().min(1).max(128)).min(1).max(20),
  repositories: z.array(z.string()).max(20),
  maxSessions: z.number().int().min(1).max(32),
  maxTasks: z.number().int().min(1).max(1e3),
  maxPromptBytes: z.number().int().min(1).max(65536),
  maxOutputBytes: z.number().int().min(128).max(1048576),
  taskTimeoutMs: z.number().int().min(100).max(36e5)
}).strict().refine((config) => !config.workspaceTitle || config.allowedTools.length === 0, {
  message: "Named Desktop workspaces require task-scoped bridge tools only (allowedTools must be empty).",
  path: ["allowedTools"]
});
function contains(parent, child) {
  const r = relative(parent, child);
  return r === "" || !r.startsWith(`..${sep}`) && r !== ".." && !isAbsolute(r);
}
function configPath(stateDir) {
  return join(stateDir, "config.json");
}
function socketPath(stateDir) {
  if (process.platform === "win32") return `\\\\.\\pipe\\codex-dsh-${createHash("sha256").update(resolve(stateDir).toLowerCase()).digest("hex").slice(0, 24)}`;
  const p = join(stateDir, "bridge.sock");
  if (Buffer.byteLength(p) > 100)
    fail("CONFIG", "stateDir is too long for a macOS Unix socket (path must be <=100 bytes).");
  return p;
}
async function privateDirectory(path) {
  if (!isAbsolute(path)) fail("CONFIG", "Directory paths must be absolute.");
  const stat = await lstat(path).catch(
    () => fail("UNSAFE_PATH", "Bridge directory is missing or unreadable.")
  );
  if (!stat.isDirectory() || stat.isSymbolicLink() || process.platform !== "win32" && (stat.uid !== process.getuid?.() || (stat.mode & 63) !== 0))
    fail("UNSAFE_PATH", "Bridge directories must be real, owner-only directories (0700).");
  const actual = await realpath(path);
  verifyWindowsAcl(path, stat.ctimeMs);
  if (actual !== resolve(path))
    fail("UNSAFE_PATH", "Bridge paths must use canonical paths without symlink ancestors.");
  return actual;
}
async function readPrivate(path) {
  const before = await lstat(path).catch(() => fail("CONFIG_UNREADABLE", "Config/token is missing."));
  if (before.isSymbolicLink()) fail("UNSAFE_PATH", "Config/token must not be a symlink.");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
    () => fail("CONFIG_UNREADABLE", "Config/token file is missing, unreadable or a symlink.")
  );
  try {
    const stat = await file.stat();
    verifyWindowsAcl(path, stat.ctimeMs);
    if (!stat.isFile() || process.platform !== "win32" && (stat.uid !== process.getuid?.() || (stat.mode & 63) !== 0) || stat.size > 65536)
      fail("UNSAFE_PATH", "Config and token must be owner-only regular files <=64 KiB.");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
async function loadConfig(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readPrivate(path));
  } catch (error) {
    if (error instanceof SyntaxError) fail("CONFIG", "Invalid config JSON.");
    throw error;
  }
  const validated = configSchema.safeParse(parsed);
  if (!validated.success)
    fail(
      "CONFIG",
      `Invalid configuration fields: ${validated.error.issues.map((issue) => issue.path.join(".")).join(", ")}`
    );
  const c = validated.data;
  await privateDirectory(c.stateDir);
  await privateDirectory(c.workspaceRoot);
  socketPath(c.stateDir);
  if (resolve(path) !== configPath(c.stateDir))
    fail("CONFIG", "Config must be stateDir/config.json.");
  if (contains(c.stateDir, c.workspaceRoot) || contains(c.workspaceRoot, c.stateDir))
    fail("CONFIG", "stateDir and workspaceRoot must be separate.");
  for (const repo of c.repositories) {
    if (!isAbsolute(repo) || await realpath(repo) !== repo)
      fail("CONFIG", "Repository allowlist paths must be canonical and absolute.");
    if (contains(repo, c.workspaceRoot) || contains(c.workspaceRoot, repo))
      fail("CONFIG", "workspaceRoot must be outside every source repository.");
  }
  if (c.allowedTools.some(
    (t) => /^(run_code|.*subagent.*|plugin_manager|.*plugin.*|.*schedule.*|.*workflow.*|.*goal.*)$/i.test(
      t
    )
  ))
    fail(
      "CONFIG",
      "Composite execution, delegation, runtime mutation and autonomous scheduling tools are unsupported by this adapter."
    );
  return c;
}
async function loadToken(stateDir) {
  await privateDirectory(stateDir);
  const token = (await readPrivate(join(stateDir, "auth.token"))).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) fail("CONFIG", "Invalid bridge token.");
  return token;
}

// src/compatibility.json
var compatibility_default = [
  {
    desktop: "0.2.0-rc.2",
    cordis: "4.0.4",
    schemastery: "3.18.4",
    upstream: "639ed015397290b3745d163aafe02ffee4aa3f84"
  },
  {
    desktop: "0.2.1-rc.1",
    cordis: "4.0.5",
    schemastery: "3.18.5",
    upstream: "1600d8a1e140dcde43a1a0941940a0480712c011"
  },
  {
    desktop: "0.2.1-rc.2",
    cordis: "4.0.5",
    schemastery: "3.18.5",
    upstream: "687f282e8625c6b8d11ff58211a90524be2e4317"
  },
  {
    desktop: "0.2.1-rc.3",
    cordis: "4.0.5",
    schemastery: "3.18.5",
    upstream: "1f81c047fc48fa190a683e469daa699857e9afe8"
  }
];

// src/version.ts
var SUPPORTED_DESKTOPS = compatibility_default;
var DESKTOP_TARGET = SUPPORTED_DESKTOPS.at(-1).desktop;
var CORDIS_TARGET = SUPPORTED_DESKTOPS.at(-1).cordis;
var UPSTREAM_COMMIT = SUPPORTED_DESKTOPS.at(-1).upstream;

// src/setup.ts
function defaultBridgePaths() {
  return {
    stateDir: resolve2(homedir(), ".dsh-mcp-state"),
    workspaceRoot: resolve2(homedir(), ".dsh-mcp-work")
  };
}
function resolveConfigFile(explicit) {
  return explicit ?? (process.env.DSH_DESKTOP_BRIDGE_CONFIG || join2(defaultBridgePaths().stateDir, "config.json"));
}

// src/transport.ts
import http from "node:http";
import { lstat as lstat2, mkdir as mkdir2, rm, chmod, writeFile } from "node:fs/promises";
import { z as z3 } from "zod";

// src/protocol.ts
import { z as z2 } from "zod";
var VERSION = 1;
var id = z2.string().uuid();
var operations = {
  job_start: z2.object({ requestId: id, objective: z2.string().min(1).max(24e3), acceptance: z2.array(z2.string().min(1).max(2e3)).min(1).max(30) }).strict(),
  job_get: z2.object({ jobId: id }).strict(),
  job_list: z2.object({}).strict(),
  job_events: z2.object({ jobId: id, after: z2.number().int().min(0).default(0), waitMs: z2.number().int().min(0).max(25e3).default(2e4) }).strict(),
  job_answer: z2.object({ jobId: id, questionId: id, answer: z2.string().min(1).max(16e3) }).strict(),
  job_review: z2.object({ jobId: id, fingerprint: z2.string().regex(/^[a-f0-9]{64}$/), approve: z2.boolean(), evidence: z2.string().min(1).max(16e3), nextInstructions: z2.string().max(16e3).optional() }).strict(),
  job_cancel: z2.object({ jobId: id }).strict(),
  job_resume: z2.object({ jobId: id, instructions: z2.string().min(1).max(16e3) }).strict(),
  job_steer: z2.object({ jobId: id, instructions: z2.string().min(1).max(16e3) }).strict(),
  connection_info: z2.object({}).strict(),
  create_session: z2.object({
    preset: z2.string().min(1).max(128).optional(),
    repository: z2.string().min(1).max(4096).optional(),
    ref: z2.string().min(1).max(200).optional()
  }).strict(),
  list_sessions: z2.object({}).strict(),
  close_session: z2.object({ sessionId: id }).strict(),
  submit_task: z2.object({ sessionId: id, prompt: z2.string().min(1).max(65536), requestId: id }).strict(),
  get_task: z2.object({ taskId: id }).strict(),
  get_result: z2.object({ taskId: id }).strict(),
  cancel_task: z2.object({ taskId: id }).strict(),
  forget_task: z2.object({ taskId: id }).strict()
};
var envelope = z2.object({
  version: z2.literal(VERSION),
  operation: z2.enum(Object.keys(operations)),
  params: z2.unknown()
}).strict();
var taskState = z2.enum([
  "running",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
  "timed_out"
]);

// src/transport.ts
var BridgeClient = class _BridgeClient {
  constructor(config, token) {
    this.config = config;
    this.token = token;
  }
  config;
  token;
  static async fromConfig(path) {
    const c = await loadConfig(path);
    return new _BridgeClient(c, await loadToken(c.stateDir));
  }
  async call(operation2, params) {
    operations[operation2].parse(params);
    await privateDirectory(this.config.stateDir);
    const socket = socketPath(this.config.stateDir);
    const stat = process.platform === "win32" ? null : await lstat2(socket).catch(
      () => fail(
        "DESKTOP_UNAVAILABLE",
        "Bridge socket is missing. Open official Desktop and enable the configured plugin."
      )
    );
    if (stat && (!stat.isSocket() || stat.uid !== process.getuid?.() || (stat.mode & 63) !== 0))
      fail("UNSAFE_PATH", "Invalid or insecure bridge socket.");
    const data = JSON.stringify({ version: 1, operation: operation2, params });
    return new Promise((resolve3, reject) => {
      const req = http.request(
        {
          socketPath: socket,
          path: "/v1/call",
          method: "POST",
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data)
          },
          timeout: 45e3
        },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > this.config.maxOutputBytes * 6 + 262144) {
              req.destroy(new BridgeError("PAYLOAD_TOO_LARGE", "Response exceeds byte limit."));
            } else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              const response = z3.discriminatedUnion("ok", [
                z3.object({ ok: z3.literal(true), result: z3.unknown() }),
                z3.object({
                  ok: z3.literal(false),
                  error: z3.object({ code: z3.string(), message: z3.string() })
                })
              ]).parse(JSON.parse(Buffer.concat(chunks).toString()));
              if (!response.ok)
                reject(new BridgeError(response.error.code, response.error.message));
              else resolve3(response.result);
            } catch {
              reject(
                new BridgeError("PROTOCOL_ERROR", "Desktop bridge returned an invalid response.")
              );
            }
          });
        }
      );
      req.on(
        "timeout",
        () => req.destroy(
          new BridgeError(
            "OUTCOME_UNKNOWN",
            "Bridge request timed out. Query state; retry submit_task only with the same requestId."
          )
        )
      );
      req.on(
        "error",
        (error) => reject(
          error instanceof BridgeError ? error : ["ENOENT", "ECONNREFUSED"].includes(error.code ?? "") ? new BridgeError("DESKTOP_UNAVAILABLE", "Bridge socket is missing. Open Desktop and enable the bridge plugin.") : new BridgeError(
            "OUTCOME_UNKNOWN",
            "Desktop bridge connection was lost. A mutation may have executed; query state before retrying."
          )
        )
      );
      req.end(data);
    });
  }
};

// src/call.ts
var [operation, inputFile] = process.argv.slice(2);
if (!operation || !(operation in operations)) throw Error("Supply a bridge operation and optional JSON input file.");
var client = await BridgeClient.fromConfig(resolveConfigFile());
var input = inputFile ? JSON.parse(await readFile(inputFile, "utf8")) : {};
console.log(JSON.stringify(await client.call(operation, input), null, 2));
//# sourceMappingURL=call.js.map
