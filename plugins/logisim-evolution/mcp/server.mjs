#!/usr/bin/env node

import readline from "node:readline";
import {
  BUILTIN_LIBRARIES,
  convertProject,
  createLogicProject,
  createProject,
  environmentInfo,
  inspectProject,
  openProject,
  runTestVector,
  truthTable,
  validateProject,
  writeTestVector,
} from "./logisim-core.mjs";

const tools = [
  {
    name: "environment",
    description: "Detect the local Logisim Evolution executable and version, and report available native verification capabilities.",
    inputSchema: {
      type: "object",
      properties: {
        executablePath: { type: "string", description: "Optional absolute path to a Logisim Evolution executable." },
        probe: { type: "boolean", default: true, description: "Run --version to prove that the executable starts." },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "inspect_project",
    description: "Read a .circ file without modifying it and return its hash, libraries, circuit hierarchy, components, wires, and labeled pin interfaces.",
    inputSchema: {
      type: "object",
      required: ["projectPath"],
      properties: { projectPath: { type: "string", description: "Absolute path to a .circ project." } },
      additionalProperties: false,
    },
  },
  {
    name: "create_logic_project",
    description: "Compile Boolean expressions into a native Logisim Evolution .circ project using gates, tunnels, pins, and optional buses. Bus bit arrays and references are LSB-first. The result is natively load-checked by default.",
    inputSchema: {
      type: "object",
      required: ["outputPath", "spec"],
      properties: {
        outputPath: { type: "string", description: "Absolute .circ output path." },
        spec: {
          type: "object",
          required: ["inputs", "outputs"],
          properties: {
            name: { type: "string", default: "main" },
            source: { type: "string", default: "4.1.0" },
            inputs: {
              type: "array",
              items: { type: "object", required: ["name"], properties: { name: { type: "string" }, width: { type: "integer", minimum: 1, maximum: 64 } }, additionalProperties: false },
            },
            outputs: {
              type: "array",
              items: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  width: { type: "integer", minimum: 1, maximum: 64 },
                  expression: { type: "string", description: "Expression for a scalar output." },
                  bits: { type: "array", items: { type: "string" }, description: "LSB-first expressions for a bus output." },
                },
                additionalProperties: false,
              },
            },
            definitions: { type: "object", additionalProperties: { type: "string" }, description: "Reusable scalar signal expressions." },
          },
          additionalProperties: false,
        },
        overwrite: { type: "boolean", default: false },
        native: { type: "boolean", default: true, description: "Require Logisim itself to load and normalize the generated project before publishing it." },
        executablePath: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_project",
    description: "Create a hierarchical .circ project from explicit circuits, components, attributes, and orthogonal wires. Use this for sequential or specialized components only when their exact Logisim geometry is known; native loading does not prove functional correctness.",
    inputSchema: {
      type: "object",
      required: ["outputPath", "project"],
      properties: {
        outputPath: { type: "string", description: "Absolute .circ output path." },
        project: {
          type: "object",
          required: ["circuits"],
          properties: {
            source: { type: "string", default: "4.1.0" },
            main: { type: "string" },
            circuits: {
              type: "array",
              items: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  attrs: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
                  components: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name", "loc"],
                      properties: {
                        library: { type: ["string", "integer", "null"], description: "Built-in library name/id, or null/project for a subcircuit." },
                        name: { type: "string" },
                        loc: { oneOf: [{ type: "string" }, { type: "array", minItems: 2, maxItems: 2, items: { type: "integer" } }] },
                        attrs: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
                      },
                      additionalProperties: false,
                    },
                  },
                  wires: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["from", "to"],
                      properties: {
                        from: { oneOf: [{ type: "string" }, { type: "array", minItems: 2, maxItems: 2, items: { type: "integer" } }] },
                        to: { oneOf: [{ type: "string" }, { type: "array", minItems: 2, maxItems: 2, items: { type: "integer" } }] },
                      },
                      additionalProperties: false,
                    },
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        overwrite: { type: "boolean", default: false },
        native: { type: "boolean", default: true },
        executablePath: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "write_test_vector",
    description: "Write a Logisim test-vector file atomically. Supports input/output widths, object or array rows, sequential <set>/<seq> metadata, <DC> outputs, and <float> values.",
    inputSchema: {
      type: "object",
      required: ["outputPath", "columns", "rows"],
      properties: {
        outputPath: { type: "string", description: "Absolute .txt, .vec, or .test path." },
        columns: {
          type: "array",
          items: { type: "object", required: ["name"], properties: { name: { type: "string" }, width: { type: "integer", minimum: 1 }, direction: { type: "string", enum: ["input", "output"] } }, additionalProperties: false },
        },
        rows: { type: "array", items: { type: ["array", "object"] } },
        comment: { type: "string" },
        overwrite: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "validate_project",
    description: "Validate a .circ project in layers: static XML/structure checks, native Logisim load-and-normalize, and optional functional test vectors. Returns separate evidence levels and never equates loading with behavioral correctness.",
    inputSchema: {
      type: "object",
      required: ["projectPath"],
      properties: {
        projectPath: { type: "string" },
        vectorPath: { type: "string", description: "Optional vector file for functional verification." },
        circuitName: { type: "string", description: "Circuit tested by vectorPath; defaults to project main." },
        native: { type: "boolean", default: true },
        executablePath: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "run_test_vector",
    description: "Run an existing Logisim test-vector file against a named circuit and return structured pass/fail evidence from the native simulator.",
    inputSchema: {
      type: "object",
      required: ["projectPath", "circuitName", "vectorPath"],
      properties: {
        projectPath: { type: "string" },
        circuitName: { type: "string" },
        vectorPath: { type: "string" },
        executablePath: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "truth_table",
    description: "Ask Logisim's native headless simulator for a bounded combinational truth table. Refuses excessive input widths and routes larger/stateful designs to test vectors.",
    inputSchema: {
      type: "object",
      required: ["projectPath"],
      properties: {
        projectPath: { type: "string" },
        circuitName: { type: "string" },
        radix: { type: "string", enum: ["binary", "hex", "auto"], default: "binary" },
        maxInputBits: { type: "integer", minimum: 1, maximum: 16, default: 12 },
        executablePath: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "convert_project",
    description: "Use Logisim Evolution to load an existing .circ file and write a normalized copy in the installed version's current format. The input is never overwritten in place.",
    inputSchema: {
      type: "object",
      required: ["inputPath", "outputPath"],
      properties: {
        inputPath: { type: "string" },
        outputPath: { type: "string" },
        overwrite: { type: "boolean", default: false },
        executablePath: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "open_project",
    description: "Open a validated .circ file in the installed Logisim Evolution desktop app for visual inspection or manual interaction.",
    inputSchema: {
      type: "object",
      required: ["projectPath"],
      properties: {
        projectPath: { type: "string" },
        appPath: { type: "string", default: "/Applications/Logisim-evolution.app" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "component_catalog",
    description: "Return the built-in library ids and the deterministic component profiles implemented by the high-level compiler. Components not listed as profiled may still be used by create_project, but their geometry must not be guessed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function textResult(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}

async function callTool(name, args = {}) {
  switch (name) {
    case "environment": return textResult(environmentInfo(args));
    case "inspect_project": return textResult(inspectProject(args));
    case "create_logic_project": return textResult(createLogicProject(args));
    case "create_project": return textResult(createProject(args));
    case "write_test_vector": return textResult(writeTestVector(args));
    case "validate_project": return textResult(validateProject(args));
    case "run_test_vector": return textResult(runTestVector(args));
    case "truth_table": return textResult(truthTable(args));
    case "convert_project": return textResult(convertProject(args));
    case "open_project": return textResult(openProject(args));
    case "component_catalog":
      return textResult({
        logisimVersionTarget: "4.1.0",
        libraries: BUILTIN_LIBRARIES,
        profiledComponents: {
          Wiring: ["Pin", "Tunnel", "Splitter", "Constant"],
          Gates: ["NOT Gate", "AND Gate", "OR Gate", "XOR Gate"],
        },
        highLevelFunctions: ["not", "and", "or", "xor", "nand", "nor", "xnor", "mux"],
        boundary: "Identity or successful native loading alone does not prove component semantics, port geometry, or circuit behavior.",
      });
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handle(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "logisim-evolution", title: "Logisim Evolution Circuit Engineer", version: "0.1.0" },
    };
  }
  if (message.method === "tools/list") return { tools };
  if (message.method === "tools/call") {
    try {
      return await callTool(message.params?.name, message.params?.arguments ?? {});
    } catch (error) {
      return textResult({ error: error.message, code: error.code ?? "LOGISIM_TOOL_ERROR" }, true);
    }
  }
  if (message.method === "ping") return {};
  if (message.method?.startsWith("notifications/")) return undefined;
  throw new Error(`Unsupported method: ${message.method}`);
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  let message;
  try {
    message = JSON.parse(line);
    const response = await handle(message);
    if (message.id !== undefined && response !== undefined) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: response })}\n`);
    }
  } catch (error) {
    if (message?.id !== undefined) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error.message } })}\n`);
    }
  }
});
