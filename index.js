import { spawn } from "node:child_process";
import fs from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const pluginRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const defaultConfigPath = path.join(pluginRoot, "config.json");
const requirementsPath = path.join(pluginRoot, "requirements.txt");
const venvDir = path.join(pluginRoot, ".venv");
const venvPython = path.join(venvDir, "bin", "python");
const timerHandles = [];
const activeSyncs = new Set();

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    configPath: { type: "string" },
    pythonPath: { type: "string" },
    envFile: { type: "string" },
    logDir: { type: "string" },
    certPath: { type: "string" },
    timezone: { type: "string", default: "Europe/Vienna" },
    emptyMessage: { type: "string", default: "📭 Keine Termine im Zeitfenster." },
    autoSetupPython: { type: "boolean", default: true },
    webhook: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: true },
        path: { type: "string", default: "/plugins/nextcloud/run" },
      },
    },
    delivery: {
      type: "object",
      additionalProperties: false,
      properties: {
        channel: { type: "string", default: "telegram" },
        target: { type: "string" },
        accountId: { type: "string" },
      },
    },
  },
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolvePath(raw, base) {
  const expanded = raw.startsWith("~/") ? path.join(process.env.HOME ?? process.cwd(), raw.slice(2)) : raw;
  return path.isAbsolute(expanded) ? expanded : path.resolve(base, expanded);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function pluginConfig(ctx) {
  if (isRecord(ctx?.pluginConfig)) return ctx.pluginConfig;
  const config = ctx?.getRuntimeConfig?.() ?? ctx?.runtimeConfig ?? ctx?.config;
  const entry = config?.plugins?.entries?.nextcloud;
  return isRecord(entry?.config) ? entry.config : {};
}

function effectiveConfig(ctx) {
  const direct = pluginConfig(ctx);
  const configured = readString(direct.configPath) ?? readString(process.env.NEXTCLOUD_CONFIG);
  const configPath = configured ? resolvePath(configured, pluginRoot) : defaultConfigPath;
  return { ...readJson(configPath), ...direct, configPath };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, PYTHONUNBUFFERED: "1", ...options.env },
      signal: options.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function setupPython(signal) {
  const command = readString(process.env.NEXTCLOUD_BOOTSTRAP_PYTHON) ?? "python3";
  const create = await runProcess(command, ["-m", "venv", venvDir], { cwd: pluginRoot, signal });
  if (create.code !== 0) throw new Error(create.stderr || create.stdout);
  const install = await runProcess(venvPython, ["-m", "pip", "install", "-r", requirementsPath], { cwd: pluginRoot, signal });
  if (install.code !== 0) throw new Error(install.stderr || install.stdout);
}

async function pythonPath(ctx, signal) {
  const cfg = effectiveConfig(ctx);
  const configured = readString(cfg.pythonPath) ?? readString(process.env.NEXTCLOUD_PYTHON);
  if (configured) return configured;
  if (await exists(venvPython)) return venvPython;
  if (cfg.autoSetupPython !== false) {
    await setupPython(signal);
    return venvPython;
  }
  return "python3";
}

async function runPython(ctx, script, args, signal) {
  const python = await pythonPath(ctx, signal);
  const result = await runProcess(python, [path.join(pluginRoot, script), ...args], { cwd: pluginRoot, signal });
  if (result.code !== 0 && result.code !== 2) {
    throw new Error(`${result.stderr}\n${result.stdout}`.trim().slice(-3000));
  }
  return { code: result.code, text: result.stdout.trim() };
}

async function runSync(ctx, account, signal) {
  const args = account ? ["--account", account] : [];
  const result = await runPython(ctx, "nextcloud_sync.py", args, signal);
  return result.text || "NEXTCLOUD sync completed.";
}

async function runStatus(ctx, signal) {
  return (await runPython(ctx, "nextcloud_sync.py", ["--status"], signal)).text;
}

async function runCalendar(ctx, signal) {
  const cfg = effectiveConfig(ctx);
  const base = path.dirname(cfg.configPath);
  const envFile = resolvePath(readString(cfg.envFile) ?? ".env", base);
  const logDir = resolvePath(readString(cfg.logDir) ?? "LOGS", base);
  const certPath = resolvePath(readString(cfg.certPath) ?? "certs/cert.pem", base);
  await mkdir(logDir, { recursive: true });
  const args = [
    "--calenv", envFile,
    "--logdir", logDir,
    "--cert", fs.existsSync(certPath) ? certPath : "",
    "--timezone", readString(cfg.timezone) ?? "Europe/Vienna",
    "--past-hours", "1",
    "--days", "7",
    "--account-prefix", "NEXTCLOUD",
  ];
  const result = await runPython(ctx, "calendar_fetch.py", args, signal);
  return result.text || readString(cfg.emptyMessage) || "📭 Keine Termine im Zeitfenster.";
}

async function handleCommand(ctx, api) {
  const parts = (ctx.args ?? "").trim().split(/\s+/).filter(Boolean);
  const action = (parts.shift() ?? "status").toLowerCase();
  if (action === "sync") {
    const account = parts[0] && /^\d+$/.test(parts[0]) ? String(Number(parts[0])) : undefined;
    return { text: await runSync(api, account) };
  }
  if (action === "calendar") return { text: await runCalendar(api) };
  if (action === "status") return { text: await runStatus(api) };
  return { text: "Usage: /nextcloud [status|sync [account]|calendar]" };
}

function timerMilliseconds(raw) {
  const match = String(raw ?? "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/);
  if (!match) return 0;
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * factors[match[2]];
}

function configuredTimers() {
  const timers = [];
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^NEXTCLOUD_TIMER(?:_(\d+))?$/);
    if (!match) continue;
    const milliseconds = timerMilliseconds(value);
    if (!milliseconds) continue;
    timers.push({ account: String(Number(match[1] ?? "1")), milliseconds });
  }
  return timers;
}

async function timerSync(api, account) {
  if (activeSyncs.has(account)) return;
  activeSyncs.add(account);
  try {
    const text = await runSync(api, account);
    api.logger.info?.(`[nextcloud] timer account ${account}: ${text.split("\n").at(-1)}`);
  } catch (error) {
    api.logger.error?.(`[nextcloud] timer account ${account} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    activeSyncs.delete(account);
  }
}

async function startFallbackTimers(api) {
  await runPython(api, "nextcloud_sync.py", ["--init"]);
  if (fs.existsSync("/usr/lib/systemd/system-generators/nextcloud-timer-generator")) return;
  for (const timer of configuredTimers()) {
    const first = setTimeout(() => {
      void timerSync(api, timer.account);
      const interval = setInterval(() => void timerSync(api, timer.account), timer.milliseconds);
      timerHandles.push(interval);
    }, 120_000);
    timerHandles.push(first);
  }
}

function stopFallbackTimers() {
  while (timerHandles.length) clearTimeout(timerHandles.pop());
}

async function deliverIfConfigured(api, text) {
  const delivery = effectiveConfig(api).delivery;
  if (!isRecord(delivery) || !readString(delivery.target)) return false;
  const channel = readString(delivery.channel) ?? "telegram";
  const sendText = (await api.runtime.channel.outbound.loadAdapter(channel))?.sendText;
  if (!sendText) throw new Error(`No outbound adapter configured for ${channel}.`);
  await sendText({
    cfg: api.runtime.config?.current?.() ?? api.config,
    to: delivery.target,
    text,
    ...(readString(delivery.accountId) ? { accountId: delivery.accountId } : {}),
  });
  return true;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function registerWebhook(api) {
  const webhook = effectiveConfig(api).webhook;
  if (isRecord(webhook) && webhook.enabled === false) return;
  api.registerHttpRoute({
    path: readString(webhook?.path) ?? "/plugins/nextcloud/run",
    auth: "gateway",
    match: "exact",
    replaceExisting: true,
    async handler(req, res) {
      if (req.method !== "POST") {
        res.setHeader("allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return true;
      }
      try {
        const text = await runCalendar(api);
        const delivered = await deliverIfConfigured(api, text);
        sendJson(res, 200, { ok: true, text, delivered });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    },
  });
}

export default definePluginEntry({
  id: "nextcloud",
  name: "NEXTCLOUD",
  description: "Deterministic Nextcloud file synchronization and calendar access.",
  configSchema,
  register(api) {
    api.registerService({
      id: "nextcloud-sync-timers",
      start: async () => startFallbackTimers(api),
      stop: async () => stopFallbackTimers(),
    });
    api.registerTool(() => ({
      name: "nextcloud_run",
      label: "NEXTCLOUD",
      description: "Synchronize Nextcloud files or show the calendar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { action: { type: "string", enum: ["status", "sync", "calendar"] } },
      },
      async execute(_id, params, signal) {
        const reply = await handleCommand({ args: params?.action ?? "status" }, api, signal);
        return { content: [{ type: "text", text: reply.text }] };
      },
    }), { names: ["nextcloud_run"] });
    api.registerCommand({
      name: "nextcloud",
      description: "Synchronize Nextcloud files or show upcoming calendar appointments.",
      acceptsArgs: true,
      requireAuth: true,
      handler: (ctx) => handleCommand(ctx, api),
    });
    registerWebhook(api);
  },
});
