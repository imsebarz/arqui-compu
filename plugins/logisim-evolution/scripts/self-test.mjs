#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLogicProject,
  environmentInfo,
  truthTable,
  validateProject,
  writeTestVector,
} from "../mcp/logisim-core.mjs";

const root = mkdtempSync(join(tmpdir(), "logisim-plugin-self-test-"));
try {
  const environment = environmentInfo({ probe: true });
  if (!environment.available) throw new Error(environment.error ?? "Logisim Evolution is unavailable.");

  const projectPath = join(root, "adder2.circ");
  const vectorPath = join(root, "adder2.test");
  const spec = {
    name: "Adder2",
    inputs: [{ name: "A", width: 2 }, { name: "B", width: 2 }, { name: "Cin" }],
    definitions: {
      P0: "A[0] ^ B[0]",
      C1: "(A[0] & B[0]) | (Cin & P0)",
      P1: "A[1] ^ B[1]",
      C2: "(A[1] & B[1]) | (C1 & P1)",
    },
    outputs: [
      { name: "Sum", width: 2, bits: ["P0 ^ Cin", "P1 ^ C1"] },
      { name: "Cout", expression: "C2" },
    ],
  };
  const created = createLogicProject({ outputPath: projectPath, spec, native: true });
  const table = truthTable({ projectPath, circuitName: "Adder2", maxInputBits: 5 });
  const columns = [
    { name: "A", width: 2, direction: "input" },
    { name: "B", width: 2, direction: "input" },
    { name: "Cin", direction: "input" },
    { name: "Sum", width: 2, direction: "output" },
    { name: "Cout", direction: "output" },
  ];
  const rows = [];
  for (let a = 0; a < 4; a += 1) {
    for (let b = 0; b < 4; b += 1) {
      for (let cin = 0; cin < 2; cin += 1) {
        const total = a + b + cin;
        rows.push({
          A: a.toString(2).padStart(2, "0"),
          B: b.toString(2).padStart(2, "0"),
          Cin: cin,
          Sum: (total & 3).toString(2).padStart(2, "0"),
          Cout: (total >> 2) & 1,
        });
      }
    }
  }
  const vector = writeTestVector({ outputPath: vectorPath, columns, rows });
  const validation = validateProject({ projectPath, vectorPath, circuitName: "Adder2" });
  if (!validation.ok || !validation.functionallyVerified || table.rowCount !== 32) {
    throw new Error(`Self-test failed: ${JSON.stringify({ validation, table }, null, 2)}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    environment: { executable: environment.executable, version: environment.version },
    project: { sha256: created.sha256, gateCount: created.compilation.gateCount },
    truthTableRows: table.rowCount,
    vectors: { rows: vector.rowCount, passed: validation.testVector.passed, failed: validation.testVector.failed },
    verificationLevel: validation.verificationLevel,
  }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}

