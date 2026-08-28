import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(pluginRoot, "mcp", "server.mjs");

test("stdio MCP initializes and exposes the expected tool contract", () => {
  const input = [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    "",
  ].join("\n");
  const run = spawnSync(process.execPath, [serverPath, "--stdio"], { input, encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  const messages = run.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(messages[0].result.serverInfo.name, "logisim-evolution");
  const names = messages[1].result.tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    "environment",
    "inspect_project",
    "create_logic_project",
    "create_project",
    "write_test_vector",
    "validate_project",
    "run_test_vector",
    "truth_table",
    "convert_project",
    "open_project",
    "component_catalog",
  ]);
});

test("stdio MCP returns structured tool errors instead of crashing", () => {
  const input = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "inspect_project", arguments: { projectPath: "relative.circ" } } })}\n`;
  const run = spawnSync(process.execPath, [serverPath, "--stdio"], { input, encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  const message = JSON.parse(run.stdout.trim());
  assert.equal(message.result.isError, true);
  assert.match(message.result.content[0].text, /absolute/i);
});

