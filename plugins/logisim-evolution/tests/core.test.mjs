import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compileLogicProject,
  inspectProject,
  parseLogicExpression,
  projectModelToXml,
  staticDiagnostics,
  writeTestVector,
} from "../mcp/logisim-core.mjs";

test("logic parser preserves operator precedence and expands mux", () => {
  assert.deepEqual(parseLogicExpression("A | B & !C"), {
    op: "or",
    args: [
      { op: "signal", name: "A" },
      { op: "and", args: [{ op: "signal", name: "B" }, { op: "not", args: [{ op: "signal", name: "C" }] }] },
    ],
  });
  const mux = parseLogicExpression("mux(S, A, B)");
  assert.equal(mux.op, "or");
  assert.equal(mux.args.length, 2);
  assert.equal(parseLogicExpression("nand(A, B)").op, "not");
});

test("logic compiler builds a reusable full adder", () => {
  const compiled = compileLogicProject({
    name: "FullAdder",
    inputs: [{ name: "A" }, { name: "B" }, { name: "Cin" }],
    definitions: { AXB: "A ^ B" },
    outputs: [
      { name: "Sum", expression: "AXB ^ Cin" },
      { name: "Cout", expression: "(A & B) | (Cin & AXB)" },
    ],
  });
  assert.equal(compiled.compilation.gateCount, 5);
  assert.equal(compiled.compilation.primitiveCounts.xor, 2);
  assert.equal(compiled.compilation.maxLogicDepth, 3);
  const xml = projectModelToXml(compiled.project);
  const check = staticDiagnostics(xml);
  assert.deepEqual(check.diagnostics.filter((item) => item.severity === "error"), []);
});

test("project writer includes the standard mappings and toolbar", () => {
  const xml = projectModelToXml({
    main: "main",
    circuits: [{ name: "main", components: [], wires: [] }],
  });
  assert.match(xml, /<mappings>/);
  assert.match(xml, /<toolbar>/);
  assert.match(xml, /name="Wiring Tool"/);
  assert.match(xml, /name="Pin"/);
  assert.match(xml, /name="XNOR Gate"/);
  assert.match(xml, /name="Register"/);
});

test("bus compiler creates LSB-first splitters and labeled pins", () => {
  const compiled = compileLogicProject({
    name: "Identity4",
    inputs: [{ name: "A", width: 4 }],
    outputs: [{ name: "Y", width: 4, bits: ["A[0]", "A[1]", "A[2]", "A[3]"] }],
  });
  const circuit = compiled.project.circuits[0];
  const splitters = circuit.components.filter((component) => component.name === "Splitter");
  assert.equal(splitters.length, 2);
  assert.ok(splitters.every((component) => component.attrs.incoming === "4" && component.attrs.fanout === "4"));
});

test("test-vector writer is atomic and preserves sequential metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "logisim-vector-test-"));
  try {
    const path = join(root, "counter.test");
    const result = writeTestVector({
      outputPath: path,
      columns: [
        { name: "Clock", direction: "input" },
        { name: "Reset", direction: "input" },
        { name: "Count", width: 2, direction: "output" },
      ],
      rows: [
        { Clock: 0, Reset: 1, Count: "00", set: 1, seq: 1 },
        { Clock: 1, Reset: 0, Count: "01", set: 1, seq: 2 },
      ],
    });
    assert.equal(result.rowCount, 2);
    const contents = readFileSync(path, "utf8");
    assert.match(contents, /^Clock Reset Count\[2\] <set> <seq>/m);
    assert.match(contents, /0 1 00 1 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("static diagnostics reject duplicate pin labels ignoring case", () => {
  const xml = projectModelToXml({
    main: "main",
    circuits: [{
      name: "main",
      components: [
        { library: "Wiring", name: "Pin", loc: [100, 100], attrs: { label: "Data" } },
        { library: "Wiring", name: "Pin", loc: [100, 200], attrs: { label: "data" } },
      ],
      wires: [],
    }],
  });
  const { diagnostics } = staticDiagnostics(xml);
  assert.ok(diagnostics.some((item) => item.code === "PIN_LABEL_DUPLICATE"));
});

test("inspector returns stable project identity", () => {
  const root = mkdtempSync(join(tmpdir(), "logisim-inspect-test-"));
  try {
    const path = join(root, "simple.circ");
    const xml = projectModelToXml({ main: "main", circuits: [{ name: "main", components: [], wires: [] }] });
    writeFileSync(path, xml);
    const first = inspectProject({ projectPath: path });
    const second = inspectProject({ projectPath: path });
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.main, "main");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
