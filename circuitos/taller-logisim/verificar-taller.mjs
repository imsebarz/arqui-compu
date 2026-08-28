import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectProject,
  nativeLoadCheck,
  runTestVector,
  truthTable,
} from "../../plugins/logisim-evolution/mcp/logisim-core.mjs";

const ROOT = "/Users/sebastian.ruiz/Dev/arqui-compu/circuitos/taller-logisim";
const projectPath = `${ROOT}/taller-clase-completo.circ`;
const circuits = [
  "A_RON",
  "B_GINEBRA",
  "C_WHISKEY",
  "D_AGUA",
  "E_VODKA",
  "F_TEQUILA",
  "G_BRANDY",
  "H_CACHACA",
  "I_PACHARAN",
  "J_VINO",
  "K_BENEDETTI",
  "L_MACHADO",
  "M_TAGORE",
  "N_CORTAZAR",
  "O_NERUDA",
];

const APP_PATH = "/Applications/Logisim-evolution.app";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function launchWithMacOs(args, label, tempRoot, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const safeLabel = label.replaceAll(/[^A-Za-z0-9_-]/g, "_");
    const stdoutPath = join(tempRoot, `${safeLabel}.stdout.txt`);
    const stderrPath = join(tempRoot, `${safeLabel}.stderr.txt`);
    const child = spawn("open", [
      "-W",
      "-n",
      "-F",
      "-j",
      "-a",
      APP_PATH,
      "-o",
      stdoutPath,
      "--stderr",
      stderrPath,
      "--args",
      ...args,
    ], { stdio: "ignore" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, timedOut, stdout: "", stderr: error.message });
    });
    child.on("exit", (status, signal) => {
      clearTimeout(timer);
      resolve({
        status,
        signal,
        timedOut,
        stdout: existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : "",
        stderr: existsSync(stderrPath) ? readFileSync(stderrPath, "utf8") : "",
      });
    });
  });
}

async function parallelMap(items, concurrency, mapper) {
  const output = Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return output;
}

async function verifyThroughLaunchServices() {
  const tempRoot = mkdtempSync(join(tmpdir(), "codex-logisim-macos-"));
  try {
    const normalizedPath = join(tempRoot, "normalized.circ");
    const nativeRun = await launchWithMacOs(
      ["--new-file-format", projectPath, normalizedPath],
      "native-load",
      tempRoot,
    );
    const outputCreated = existsSync(normalizedPath) && statSync(normalizedPath).size > 0;
    const nativeLoad = {
      ok: nativeRun.status === 0 && outputCreated,
      outputCreated,
      normalizedSha256: outputCreated ? sha256(normalizedPath) : null,
      normalizedSummary: outputCreated ? inspectProject({ projectPath: normalizedPath }) : null,
      run: nativeRun,
    };

    const vectorRuns = await parallelMap(circuits, 3, async (circuitName) => {
      console.log(`Vector: ${circuitName}`);
      const vectorPath = `${ROOT}/vectores/${circuitName}.test`;
      return launchWithMacOs(
        ["--test-vector", circuitName, vectorPath, projectPath],
        `vector-${circuitName}`,
        tempRoot,
      );
    });

    const tableRuns = await parallelMap(circuits, 3, async (circuitName) => {
      console.log(`Tabla: ${circuitName}`);
      return launchWithMacOs(
        ["--tty", "table,tabs,binary", "--toplevel-circuit", circuitName, projectPath],
        `table-${circuitName}`,
        tempRoot,
      );
    });

    const results = circuits.map((circuitName, index) => {
      const vectorRun = vectorRuns[index];
      const vectorOutput = `${vectorRun.stdout}\n${vectorRun.stderr}`;
      const passed = Number(/Passed:\s*(\d+)/i.exec(vectorOutput)?.[1] ?? 0);
      const failed = Number(/Failed:\s*(\d+)/i.exec(vectorOutput)?.[1] ?? 0);
      const tableRun = tableRuns[index];
      const tableLines = tableRun.stdout.split(/\r?\n/).filter((line) => line.includes("\t"));
      const rows = tableLines.slice(1).map((line) => line.split("\t"));
      const truthTableOk = tableRun.status === 0 && rows.length > 0;
      return {
        circuitName,
        vectorOk: vectorRun.status === 0 && failed === 0 && passed === rows.length,
        expectedRows: rows.length,
        passed,
        failed,
        truthTableOk,
        rows,
      };
    });
    return { nativeLoad, results };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function verifyDirectly() {
  const nativeLoad = nativeLoadCheck({ projectPath, timeoutMs: 120_000 });
  const results = [];
  for (const circuitName of circuits) {
    const vectorPath = `${ROOT}/vectores/${circuitName}.test`;
    const vector = runTestVector({ projectPath, circuitName, vectorPath, timeoutMs: 120_000 });
    const table = truthTable({
      projectPath,
      circuitName,
      radix: "binary",
      maxInputBits: 3,
      timeoutMs: 120_000,
    });
    results.push({
      circuitName,
      vectorOk: vector.ok && vector.passed === table.rowCount,
      expectedRows: table.rowCount,
      passed: vector.passed,
      failed: vector.failed,
      truthTableOk: table.ok,
      rows: table.rows,
    });
  }
  return { nativeLoad, results };
}

const { nativeLoad, results } = process.platform === "darwin"
  ? await verifyThroughLaunchServices()
  : verifyDirectly();
const ok = nativeLoad.ok && results.every((result) => (
  result.vectorOk
  && result.truthTableOk
  && result.passed === result.expectedRows
  && result.failed === 0
));
console.log(JSON.stringify({ ok, nativeLoad, results }, null, 2));
if (!ok) process.exitCode = 1;
