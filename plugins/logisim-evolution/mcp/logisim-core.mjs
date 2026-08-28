import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";

const MAX_PROJECT_BYTES = 20 * 1024 * 1024;
const MAX_VECTOR_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export const BUILTIN_LIBRARIES = Object.freeze([
  { id: "0", desc: "#Wiring", name: "Wiring" },
  { id: "1", desc: "#Gates", name: "Gates" },
  { id: "2", desc: "#Plexers", name: "Plexers" },
  { id: "3", desc: "#Arithmetic", name: "Arithmetic" },
  { id: "4", desc: "#Memory", name: "Memory" },
  { id: "5", desc: "#I/O", name: "I/O" },
  { id: "6", desc: "#TTL", name: "TTL" },
  { id: "7", desc: "#TCL", name: "TCL" },
  { id: "8", desc: "#Base", name: "Base" },
]);

const LIBRARY_BY_NAME = new Map();
for (const library of BUILTIN_LIBRARIES) {
  LIBRARY_BY_NAME.set(library.id, library.id);
  LIBRARY_BY_NAME.set(library.name.toLowerCase(), library.id);
  LIBRARY_BY_NAME.set(library.desc.toLowerCase(), library.id);
}

const MANAGED_ROOTS = [homedir(), tmpdir(), "/private/tmp"]
  .flatMap((value) => {
    const normalized = resolve(value);
    return existsSync(normalized) ? [normalized, realpathSync(normalized)] : [normalized];
  })
  .filter((value, index, values) => values.indexOf(value) === index);

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function assertManagedPath(path, { extensions, mustExist = false, write = false } = {}) {
  if (typeof path !== "string" || !path.trim()) throw new Error("An absolute file path is required.");
  if (!isAbsolute(path)) throw new Error(`Path must be absolute: ${path}`);
  const normalized = resolve(path);
  if (!MANAGED_ROOTS.some((root) => isInside(root, normalized))) {
    throw new Error(`Path is outside the allowed user and temporary directories: ${normalized}`);
  }
  if (extensions?.length && !extensions.includes(extname(normalized).toLowerCase())) {
    throw new Error(`Expected one of ${extensions.join(", ")}: ${normalized}`);
  }
  if (mustExist && !existsSync(normalized)) throw new Error(`File does not exist: ${normalized}`);
  if (existsSync(normalized)) {
    const info = lstatSync(normalized);
    if (info.isSymbolicLink()) throw new Error(`Symbolic-link targets are not accepted: ${normalized}`);
    if (!info.isFile()) throw new Error(`Expected a regular file: ${normalized}`);
  } else if (write) {
    const parent = dirname(normalized);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
    const realParent = realpathSync(parent);
    if (!MANAGED_ROOTS.some((root) => isInside(root, realParent))) {
      throw new Error(`Output parent resolves outside allowed roots: ${realParent}`);
    }
  }
  return normalized;
}

function readBounded(path, limit) {
  const info = statSync(path);
  if (info.size > limit) throw new Error(`File exceeds ${limit} bytes: ${path}`);
  return readFileSync(path, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeXml(value = "") {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseTagAttributes(source = "") {
  const result = {};
  const matcher = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of source.matchAll(matcher)) result[match[1]] = decodeXml(match[3]);
  return result;
}

function parseChildAttributes(body = "") {
  const result = {};
  const matcher = /<a\b([^>]*?)(?:\/?>)/g;
  for (const match of body.matchAll(matcher)) {
    const attrs = parseTagAttributes(match[1]);
    if (attrs.name !== undefined) result[attrs.name] = attrs.val ?? "";
  }
  return result;
}

function parseLocation(value) {
  const match = /^\((-?\d+),(-?\d+)\)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function locationString(value, label = "location") {
  if (typeof value === "string" && parseLocation(value)) return value;
  if (Array.isArray(value) && value.length === 2 && value.every(Number.isInteger)) {
    return `(${value[0]},${value[1]})`;
  }
  throw new Error(`${label} must be [x, y] integer coordinates or \"(x,y)\".`);
}

function xmlWellFormedDiagnostics(xml) {
  const diagnostics = [];
  if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml)) {
    diagnostics.push({ severity: "error", code: "XML_EXTERNAL_DECLARATION", message: "DOCTYPE and ENTITY declarations are not allowed." });
    return diagnostics;
  }
  const cleaned = xml
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack = [];
  const tags = /<\s*(\/?)\s*([A-Za-z_][\w:.-]*)\b([^>]*)>/g;
  for (const match of cleaned.matchAll(tags)) {
    const closing = match[1] === "/";
    const selfClosing = /\/\s*$/.test(match[3]);
    const name = match[2];
    if (closing) {
      const expected = stack.pop();
      if (expected !== name) {
        diagnostics.push({ severity: "error", code: "XML_TAG_MISMATCH", message: `Expected closing tag </${expected ?? "none"}> but found </${name}>.` });
        break;
      }
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (stack.length) {
    diagnostics.push({ severity: "error", code: "XML_UNCLOSED_TAG", message: `Unclosed XML tag <${stack.at(-1)}>.` });
  }
  return diagnostics;
}

export function parseProjectXml(xml) {
  const projectMatch = /<project\b([^>]*)>/i.exec(xml);
  if (!projectMatch) throw new Error("No <project> root element was found.");
  const projectAttrs = parseTagAttributes(projectMatch[1]);
  const libraries = [];
  for (const match of xml.matchAll(/<lib\b([^>]*?)(?:\/>|>[\s\S]*?<\/lib>)/g)) {
    const attrs = parseTagAttributes(match[1]);
    libraries.push({ id: attrs.name ?? null, desc: attrs.desc ?? null });
  }
  const mainMatch = /<main\b([^>]*?)(?:\/?>)/i.exec(xml);
  const main = mainMatch ? parseTagAttributes(mainMatch[1]).name ?? null : null;
  const circuits = [];
  const circuitMatcher = /<circuit\b([^>]*?)(?:\/>|>([\s\S]*?)<\/circuit>)/g;
  for (const circuitMatch of xml.matchAll(circuitMatcher)) {
    const attrs = parseTagAttributes(circuitMatch[1]);
    const body = circuitMatch[2] ?? "";
    const components = [];
    for (const componentMatch of body.matchAll(/<comp\b([^>]*?)(?:\/>|>([\s\S]*?)<\/comp>)/g)) {
      const componentAttrs = parseTagAttributes(componentMatch[1]);
      const properties = parseChildAttributes(componentMatch[2] ?? "");
      components.push({
        library: componentAttrs.lib ?? null,
        name: componentAttrs.name ?? null,
        loc: componentAttrs.loc ?? null,
        location: parseLocation(componentAttrs.loc),
        attrs: properties,
      });
    }
    const wires = [];
    for (const wireMatch of body.matchAll(/<wire\b([^>]*?)(?:\/?>)/g)) {
      const wireAttrs = parseTagAttributes(wireMatch[1]);
      wires.push({
        from: wireAttrs.from ?? null,
        to: wireAttrs.to ?? null,
        fromLocation: parseLocation(wireAttrs.from),
        toLocation: parseLocation(wireAttrs.to),
      });
    }
    const pins = components
      .filter((component) => component.name === "Pin")
      .map((component) => ({
        label: component.attrs.label ?? "",
        width: Number(component.attrs.width ?? 1),
        direction: component.attrs.type === "output" || component.attrs.output === "true" ? "output" : "input",
        loc: component.loc,
      }));
    circuits.push({
      name: attrs.name ?? null,
      attrs: parseChildAttributes(body.replace(/<comp\b[\s\S]*?<\/comp>/g, "")),
      components,
      wires,
      pins,
    });
  }
  return { source: projectAttrs.source ?? null, version: projectAttrs.version ?? null, main, libraries, circuits };
}

function summarizeProject(parsed) {
  const circuitNames = new Set(parsed.circuits.map((circuit) => circuit.name));
  return {
    source: parsed.source,
    formatVersion: parsed.version,
    main: parsed.main ?? parsed.circuits[0]?.name ?? null,
    libraries: parsed.libraries,
    circuits: parsed.circuits.map((circuit) => {
      const byComponent = {};
      for (const component of circuit.components) {
        const key = component.library === null && circuitNames.has(component.name)
          ? `subcircuit:${component.name}`
          : `${component.library ?? "project"}:${component.name ?? "unknown"}`;
        byComponent[key] = (byComponent[key] ?? 0) + 1;
      }
      return {
        name: circuit.name,
        componentCount: circuit.components.length,
        wireCount: circuit.wires.length,
        pins: circuit.pins,
        componentCounts: byComponent,
        subcircuits: circuit.components
          .filter((component) => component.library === null && circuitNames.has(component.name))
          .map((component) => component.name),
      };
    }),
  };
}

export function inspectProject({ projectPath }) {
  const path = assertManagedPath(projectPath, { extensions: [".circ"], mustExist: true });
  const xml = readBounded(path, MAX_PROJECT_BYTES);
  const parsed = parseProjectXml(xml);
  return {
    path,
    bytes: Buffer.byteLength(xml),
    sha256: sha256(xml),
    ...summarizeProject(parsed),
  };
}

export function staticDiagnostics(xml) {
  const diagnostics = xmlWellFormedDiagnostics(xml);
  let parsed;
  try {
    parsed = parseProjectXml(xml);
  } catch (error) {
    diagnostics.push({ severity: "error", code: "PROJECT_PARSE_FAILED", message: error.message });
    return { diagnostics, parsed: null };
  }

  const libraryIds = new Set();
  for (const library of parsed.libraries) {
    if (!library.id) diagnostics.push({ severity: "error", code: "LIBRARY_ID_MISSING", message: "A library is missing its name/id." });
    else if (libraryIds.has(library.id)) diagnostics.push({ severity: "error", code: "LIBRARY_ID_DUPLICATE", message: `Duplicate library id ${library.id}.` });
    else libraryIds.add(library.id);
  }

  const names = new Set();
  for (const circuit of parsed.circuits) {
    if (!circuit.name) diagnostics.push({ severity: "error", code: "CIRCUIT_NAME_MISSING", message: "A circuit is missing its name." });
    else if (names.has(circuit.name)) diagnostics.push({ severity: "error", code: "CIRCUIT_NAME_DUPLICATE", message: `Duplicate circuit name ${circuit.name}.` });
    else names.add(circuit.name);
  }
  const effectiveMain = parsed.main ?? parsed.circuits[0]?.name;
  if (!effectiveMain) diagnostics.push({ severity: "error", code: "MAIN_MISSING", message: "The project has no main circuit." });
  else if (!names.has(effectiveMain)) diagnostics.push({ severity: "error", code: "MAIN_UNKNOWN", message: `Main circuit ${effectiveMain} does not exist.` });

  for (const circuit of parsed.circuits) {
    const labels = new Map();
    const componentLocations = new Map();
    for (const component of circuit.components) {
      if (!component.name) diagnostics.push({ severity: "error", code: "COMPONENT_NAME_MISSING", circuit: circuit.name, message: "A component is missing its name." });
      if (!component.location) diagnostics.push({ severity: "error", code: "COMPONENT_LOCATION_INVALID", circuit: circuit.name, component: component.name, message: `Invalid component location ${component.loc ?? "<missing>"}.` });
      else {
        const [x, y] = component.location;
        if (x % 10 !== 0 || y % 10 !== 0) diagnostics.push({ severity: "warning", code: "OFF_GRID_COMPONENT", circuit: circuit.name, component: component.name, loc: component.loc, message: "Component is not aligned to Logisim's 10-pixel grid." });
        const key = component.loc;
        const atLocation = componentLocations.get(key) ?? [];
        atLocation.push(component.name);
        componentLocations.set(key, atLocation);
      }
      if (component.library !== null && !libraryIds.has(component.library)) {
        diagnostics.push({ severity: "error", code: "UNKNOWN_LIBRARY", circuit: circuit.name, component: component.name, message: `Component references unknown library ${component.library}.` });
      }
      if (component.library === null && component.name && !names.has(component.name)) {
        diagnostics.push({ severity: "error", code: "UNKNOWN_PROJECT_COMPONENT", circuit: circuit.name, component: component.name, message: `Project component ${component.name} is not a circuit in this file.` });
      }
      if (component.name === "Pin") {
        const label = String(component.attrs.label ?? "").trim();
        const width = Number(component.attrs.width ?? 1);
        if (!label) diagnostics.push({ severity: "warning", code: "PIN_LABEL_MISSING", circuit: circuit.name, loc: component.loc, message: "An interface pin has no label; automated test vectors cannot address it reliably." });
        if (!Number.isInteger(width) || width < 1 || width > 65_536) diagnostics.push({ severity: "error", code: "PIN_WIDTH_INVALID", circuit: circuit.name, label, message: `Invalid pin width ${component.attrs.width}.` });
        if (label) {
          const normalized = label.toLocaleLowerCase("en-US");
          if (labels.has(normalized)) diagnostics.push({ severity: "error", code: "PIN_LABEL_DUPLICATE", circuit: circuit.name, label, message: `Pin label collides with ${labels.get(normalized)} (case-insensitive).` });
          else labels.set(normalized, label);
        }
      }
    }
    for (const [loc, componentNames] of componentLocations) {
      const significant = componentNames.filter((name) => name !== "Tunnel");
      if (significant.length > 1) diagnostics.push({ severity: "warning", code: "COMPONENT_LOCATION_SHARED", circuit: circuit.name, loc, message: `Multiple components share ${loc}: ${significant.join(", ")}.` });
    }
    const wireKeys = new Set();
    for (const wire of circuit.wires) {
      if (!wire.fromLocation || !wire.toLocation) {
        diagnostics.push({ severity: "error", code: "WIRE_LOCATION_INVALID", circuit: circuit.name, message: `Invalid wire ${wire.from ?? "?"} -> ${wire.to ?? "?"}.` });
        continue;
      }
      const [x1, y1] = wire.fromLocation;
      const [x2, y2] = wire.toLocation;
      if (x1 === x2 && y1 === y2) diagnostics.push({ severity: "error", code: "WIRE_ZERO_LENGTH", circuit: circuit.name, message: `Zero-length wire at ${wire.from}.` });
      if (x1 !== x2 && y1 !== y2) diagnostics.push({ severity: "error", code: "WIRE_DIAGONAL", circuit: circuit.name, message: `Wire must be horizontal or vertical: ${wire.from} -> ${wire.to}.` });
      if ([x1, y1, x2, y2].some((value) => value % 10 !== 0)) diagnostics.push({ severity: "warning", code: "OFF_GRID_WIRE", circuit: circuit.name, message: `Wire is not aligned to the 10-pixel grid: ${wire.from} -> ${wire.to}.` });
      const key = [wire.from, wire.to].sort().join("|");
      if (wireKeys.has(key)) diagnostics.push({ severity: "warning", code: "WIRE_DUPLICATE", circuit: circuit.name, message: `Duplicate wire ${wire.from} -> ${wire.to}.` });
      else wireKeys.add(key);
    }
  }
  return { diagnostics, parsed };
}

function cleanNativeOutput(value = "") {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("WARNING: A restricted method")
      && !line.startsWith("WARNING: java.lang.System::load")
      && !line.startsWith("WARNING: Use --enable-native-access")
      && !line.startsWith("WARNING: Restricted methods"))
    .join("\n")
    .trim();
}

function timeoutValue(value) {
  const number = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(number) || number < 1_000 || number > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be an integer between 1000 and ${MAX_TIMEOUT_MS}.`);
  }
  return number;
}

export function findLogisimExecutable(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.LOGISIM_EVOLUTION_EXECUTABLE,
    "/Applications/Logisim-evolution.app/Contents/MacOS/Logisim-evolution",
    "/Applications/Logisim Evolution.app/Contents/MacOS/Logisim-evolution",
    "/usr/local/bin/logisim-evolution",
    "/opt/homebrew/bin/logisim-evolution",
    "/usr/bin/logisim-evolution",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = resolve(candidate);
    if (existsSync(normalized) && statSync(normalized).isFile()) return normalized;
  }
  throw new Error("Logisim Evolution executable was not found. Set LOGISIM_EVOLUTION_EXECUTABLE to its full path.");
}

function nativeRun(args, { executablePath, timeoutMs, cwd } = {}) {
  const executable = findLogisimExecutable(executablePath);
  const run = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutValue(timeoutMs),
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  return {
    executable,
    args,
    status: run.status,
    signal: run.signal,
    timedOut: run.error?.code === "ETIMEDOUT",
    stdout: cleanNativeOutput(run.stdout),
    stderr: cleanNativeOutput(run.stderr),
    error: run.error ? run.error.message : null,
  };
}

export function environmentInfo({ executablePath, probe = true, timeoutMs = 15_000 } = {}) {
  let executable;
  try {
    executable = findLogisimExecutable(executablePath);
  } catch (error) {
    return { available: false, error: error.message, configuredPath: executablePath ?? process.env.LOGISIM_EVOLUTION_EXECUTABLE ?? null };
  }
  let version = null;
  const appRootMatch = /^(.*\.app)\/Contents\/MacOS\//.exec(executable);
  if (appRootMatch) {
    const infoPath = join(appRootMatch[1], "Contents", "Info.plist");
    if (existsSync(infoPath)) {
      const plist = readFileSync(infoPath, "utf8");
      const versionMatch = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist);
      if (versionMatch) version = versionMatch[1];
    }
  }
  let probeResult = null;
  if (probe) {
    probeResult = nativeRun(["--version"], { executablePath: executable, timeoutMs });
    const match = /Logisim-evolution\s+v?([\w.+-]+)/i.exec(`${probeResult.stdout}\n${probeResult.stderr}`);
    if (match) version = match[1];
  }
  return {
    available: probe ? probeResult.status === 0 : true,
    executable,
    version,
    probe: probeResult,
    supportedNativeChecks: ["load-and-convert", "truth-table", "test-vector", "test-bench", "tty", "statistics"],
  };
}

export function nativeLoadCheck({ projectPath, executablePath, timeoutMs } = {}) {
  const input = assertManagedPath(projectPath, { extensions: [".circ"], mustExist: true });
  const tempRoot = mkdtempSync(join(tmpdir(), "codex-logisim-validate-"));
  const output = join(tempRoot, "normalized.circ");
  try {
    const run = nativeRun(["--new-file-format", input, output], { executablePath, timeoutMs, cwd: dirname(input) });
    const outputCreated = existsSync(output) && statSync(output).size > 0;
    let normalizedSha256 = null;
    let normalizedSummary = null;
    if (outputCreated) {
      const xml = readBounded(output, MAX_PROJECT_BYTES);
      normalizedSha256 = sha256(xml);
      normalizedSummary = summarizeProject(parseProjectXml(xml));
    }
    return { ok: run.status === 0 && outputCreated, outputCreated, normalizedSha256, normalizedSummary, run };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function runTestVector({ projectPath, circuitName, vectorPath, executablePath, timeoutMs } = {}) {
  const project = assertManagedPath(projectPath, { extensions: [".circ"], mustExist: true });
  const vector = assertManagedPath(vectorPath, { extensions: [".txt", ".vec", ".test"], mustExist: true });
  if (typeof circuitName !== "string" || !circuitName.trim()) throw new Error("circuitName is required.");
  if (statSync(vector).size > MAX_VECTOR_BYTES) throw new Error(`Test vector exceeds ${MAX_VECTOR_BYTES} bytes.`);
  const run = nativeRun(["--test-vector", circuitName, vector, project], { executablePath, timeoutMs, cwd: dirname(project) });
  const combined = `${run.stdout}\n${run.stderr}`;
  const passed = Number(/Passed:\s*(\d+)/i.exec(combined)?.[1] ?? 0);
  const failed = Number(/Failed:\s*(\d+)/i.exec(combined)?.[1] ?? 0);
  return { ok: run.status === 0 && failed === 0, passed, failed, circuitName, projectPath: project, vectorPath: vector, run };
}

export function truthTable({ projectPath, circuitName, radix = "binary", maxInputBits = 12, executablePath, timeoutMs } = {}) {
  const project = assertManagedPath(projectPath, { extensions: [".circ"], mustExist: true });
  const inspected = inspectProject({ projectPath: project });
  const selectedName = circuitName ?? inspected.main;
  const selected = inspected.circuits.find((circuit) => circuit.name === selectedName);
  if (!selected) throw new Error(`Circuit does not exist: ${selectedName}`);
  const inputBits = selected.pins.filter((pin) => pin.direction === "input").reduce((sum, pin) => sum + pin.width, 0);
  const bitLimit = Number(maxInputBits);
  if (!Number.isInteger(bitLimit) || bitLimit < 1 || bitLimit > 16) throw new Error("maxInputBits must be an integer from 1 to 16.");
  if (inputBits > bitLimit) throw new Error(`Truth table would require 2^${inputBits} rows; maxInputBits is ${bitLimit}. Use test vectors instead.`);
  if (!["binary", "hex", "auto"].includes(radix)) throw new Error("radix must be binary, hex, or auto.");
  const formats = ["table", "tabs"];
  if (radix !== "auto") formats.push(radix);
  const run = nativeRun(["--tty", formats.join(","), "--toplevel-circuit", selectedName, project], { executablePath, timeoutMs, cwd: dirname(project) });
  const lines = run.stdout.split(/\r?\n/).filter(Boolean);
  const headers = lines[0]?.split("\t") ?? [];
  const rows = lines.slice(1).map((line) => line.split("\t"));
  return { ok: run.status === 0, circuitName: selectedName, inputBits, rowCount: rows.length, headers, rows, run };
}

export function validateProject({ projectPath, vectorPath, circuitName, native = true, executablePath, timeoutMs } = {}) {
  const path = assertManagedPath(projectPath, { extensions: [".circ"], mustExist: true });
  const xml = readBounded(path, MAX_PROJECT_BYTES);
  const { diagnostics, parsed } = staticDiagnostics(xml);
  const staticErrors = diagnostics.filter((item) => item.severity === "error");
  let nativeLoad = null;
  if (native && staticErrors.length === 0) nativeLoad = nativeLoadCheck({ projectPath: path, executablePath, timeoutMs });
  let testVector = null;
  if (vectorPath && staticErrors.length === 0 && (!native || nativeLoad?.ok)) {
    const effectiveCircuit = circuitName ?? parsed?.main ?? parsed?.circuits[0]?.name;
    testVector = runTestVector({ projectPath: path, circuitName: effectiveCircuit, vectorPath, executablePath, timeoutMs });
  }
  const structurallyValid = staticErrors.length === 0;
  const nativeLoadValid = native ? nativeLoad?.ok === true : null;
  const functionallyVerified = vectorPath ? testVector?.ok === true : false;
  return {
    path,
    sha256: sha256(xml),
    structurallyValid,
    nativeLoadValid,
    functionallyVerified,
    ok: structurallyValid && (!native || nativeLoadValid) && (!vectorPath || functionallyVerified),
    verificationLevel: functionallyVerified ? "native-test-vector" : nativeLoadValid ? "native-load" : structurallyValid ? "static-only" : "failed",
    diagnostics,
    summary: parsed ? summarizeProject(parsed) : null,
    nativeLoad,
    testVector,
    caveat: functionallyVerified
      ? "The supplied vectors passed; behavior outside their coverage is not proven."
      : "No passing functional test vector is attached, so behavior is not proven even if the project loads.",
  };
}

function libraryId(value, circuitNames) {
  if (value === null || value === undefined || value === "project") return null;
  const key = String(value).toLowerCase();
  const id = LIBRARY_BY_NAME.get(key);
  if (id !== undefined) return id;
  if (circuitNames.has(String(value))) return null;
  throw new Error(`Unknown built-in library: ${value}`);
}

function attrsXml(attrs = {}, indent = "      ") {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${indent}<a name="${escapeXml(name)}" val="${escapeXml(value)}"/>`)
    .join("\n");
}

const DEFAULT_PROJECT_TOOLBAR_XML = Object.freeze([
  "  <mappings>",
  '    <tool lib="8" map="Button2" name="Poke Tool"/>',
  '    <tool lib="8" map="Button3" name="Menu Tool"/>',
  '    <tool lib="8" map="Ctrl Button1" name="Menu Tool"/>',
  "  </mappings>",
  "  <toolbar>",
  '    <tool lib="8" name="Poke Tool"/>',
  '    <tool lib="8" name="Edit Tool"/>',
  '    <tool lib="8" name="Wiring Tool"/>',
  '    <tool lib="8" name="Text Tool"/>',
  "    <sep/>",
  '    <tool lib="0" name="Pin">',
  '      <a name="tristate" val="false"/>',
  "    </tool>",
  '    <tool lib="0" name="Pin">',
  '      <a name="facing" val="west"/>',
  '      <a name="output" val="true"/>',
  "    </tool>",
  "    <sep/>",
  '    <tool lib="1" name="NOT Gate"/>',
  '    <tool lib="1" name="AND Gate"/>',
  '    <tool lib="1" name="OR Gate"/>',
  '    <tool lib="1" name="XOR Gate"/>',
  '    <tool lib="1" name="NAND Gate"/>',
  '    <tool lib="1" name="NOR Gate"/>',
  '    <tool lib="1" name="XNOR Gate"/>',
  "    <sep/>",
  '    <tool lib="4" name="D Flip-Flop"/>',
  '    <tool lib="4" name="Register"/>',
  "  </toolbar>",
]);

export function projectModelToXml(project) {
  if (!project || typeof project !== "object") throw new Error("project must be an object.");
  const circuits = project.circuits;
  if (!Array.isArray(circuits) || circuits.length === 0) throw new Error("project.circuits must contain at least one circuit.");
  const circuitNames = new Set();
  for (const circuit of circuits) {
    if (typeof circuit.name !== "string" || !circuit.name.trim()) throw new Error("Each circuit needs a name.");
    if (circuitNames.has(circuit.name)) throw new Error(`Duplicate circuit name: ${circuit.name}`);
    circuitNames.add(circuit.name);
  }
  const main = project.main ?? circuits[0].name;
  if (!circuitNames.has(main)) throw new Error(`Main circuit does not exist: ${main}`);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<project source="${escapeXml(project.source ?? "4.1.0")}" version="1.0">`,
    ...BUILTIN_LIBRARIES.map((library) => `  <lib desc="${library.desc}" name="${library.id}"/>`),
    `  <main name="${escapeXml(main)}"/>`,
    "  <options>",
    '    <a name="gateUndefined" val="ignore"/>',
    '    <a name="simlimit" val="1000"/>',
    '    <a name="simrand" val="0"/>',
    "  </options>",
    ...DEFAULT_PROJECT_TOOLBAR_XML,
  ];
  for (const circuit of circuits) {
    lines.push(`  <circuit name="${escapeXml(circuit.name)}">`);
    const circuitAttrs = {
      appearance: "logisim_evolution",
      circuit: circuit.name,
      circuitnamedboxfixedsize: "true",
      simulationFrequency: "1.0",
      ...(circuit.attrs ?? {}),
    };
    const circuitAttrsText = attrsXml(circuitAttrs, "    ");
    if (circuitAttrsText) lines.push(circuitAttrsText);
    for (const component of circuit.components ?? []) {
      if (typeof component.name !== "string" || !component.name.trim()) throw new Error(`A component in ${circuit.name} has no name.`);
      const loc = locationString(component.loc, `${circuit.name}/${component.name} loc`);
      const lib = libraryId(component.library, circuitNames);
      const libText = lib === null ? "" : ` lib="${lib}"`;
      const componentAttrs = attrsXml(component.attrs ?? {}, "      ");
      if (componentAttrs) {
        lines.push(`    <comp${libText} loc="${loc}" name="${escapeXml(component.name)}">`);
        lines.push(componentAttrs);
        lines.push("    </comp>");
      } else {
        lines.push(`    <comp${libText} loc="${loc}" name="${escapeXml(component.name)}"/>`);
      }
    }
    for (const wire of circuit.wires ?? []) {
      const from = locationString(wire.from, `${circuit.name} wire.from`);
      const to = locationString(wire.to, `${circuit.name} wire.to`);
      lines.push(`    <wire from="${from}" to="${to}"/>`);
    }
    lines.push("  </circuit>");
  }
  lines.push("</project>", "");
  return lines.join("\n");
}

function atomicWriteValidated(path, contents, { overwrite = false, native = true, executablePath, timeoutMs } = {}) {
  const output = assertManagedPath(path, { extensions: [".circ"], write: true });
  if (existsSync(output) && !overwrite) throw new Error(`Output already exists; set overwrite=true to replace it: ${output}`);
  const temp = join(dirname(output), `.${basename(output)}.${process.pid}.${Date.now()}.tmp.circ`);
  try {
    writeFileSync(temp, contents, { encoding: "utf8", flag: "wx" });
    const { diagnostics } = staticDiagnostics(contents);
    const errors = diagnostics.filter((item) => item.severity === "error");
    if (errors.length) throw new Error(`Generated project failed static validation: ${errors.map((item) => item.message).join("; ")}`);
    let nativeResult = null;
    if (native) {
      nativeResult = nativeLoadCheck({ projectPath: temp, executablePath, timeoutMs });
      if (!nativeResult.ok) throw new Error(`Logisim rejected the generated project: ${nativeResult.run.stderr || nativeResult.run.stdout || nativeResult.run.error || "unknown error"}`);
    }
    renameSync(temp, output);
    return { path: output, bytes: Buffer.byteLength(contents), sha256: sha256(contents), nativeLoad: nativeResult };
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
}

export function createProject({ outputPath, project, overwrite = false, native = true, executablePath, timeoutMs } = {}) {
  const xml = projectModelToXml(project);
  const written = atomicWriteValidated(outputPath, xml, { overwrite, native, executablePath, timeoutMs });
  return { ...written, summary: inspectProject({ projectPath: written.path }) };
}

class LogicParser {
  constructor(source) {
    this.source = source;
    this.tokens = this.tokenize(source);
    this.index = 0;
  }

  tokenize(source) {
    const tokens = [];
    let index = 0;
    const matcher = /\s*(?:([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)|([01])|(&&|\|\||[!~&^|(),]))/y;
    while (index < source.length) {
      matcher.lastIndex = index;
      const match = matcher.exec(source);
      if (!match) throw new Error(`Unexpected token at column ${index + 1} in expression: ${source}`);
      tokens.push(match[1] ? { type: "identifier", value: match[1] } : match[2] ? { type: "constant", value: match[2] } : { type: "operator", value: match[3] });
      index = matcher.lastIndex;
    }
    tokens.push({ type: "eof", value: "" });
    return tokens;
  }

  peek(value) {
    const token = this.tokens[this.index];
    return value === undefined ? token : token.value === value;
  }

  take(value) {
    const token = this.tokens[this.index];
    if (value !== undefined && token.value !== value) throw new Error(`Expected '${value}' in expression: ${this.source}`);
    this.index += 1;
    return token;
  }

  parse() {
    const value = this.parseOr();
    if (this.peek().type !== "eof") throw new Error(`Unexpected '${this.peek().value}' in expression: ${this.source}`);
    return value;
  }

  parseOr() {
    let left = this.parseXor();
    while (this.peek("|") || this.peek("||")) {
      this.take();
      left = { op: "or", args: [left, this.parseXor()] };
    }
    return left;
  }

  parseXor() {
    let left = this.parseAnd();
    while (this.peek("^")) {
      this.take();
      left = { op: "xor", args: [left, this.parseAnd()] };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseUnary();
    while (this.peek("&") || this.peek("&&")) {
      this.take();
      left = { op: "and", args: [left, this.parseUnary()] };
    }
    return left;
  }

  parseUnary() {
    if (this.peek("!") || this.peek("~")) {
      this.take();
      return { op: "not", args: [this.parseUnary()] };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.peek("(")) {
      this.take("(");
      const value = this.parseOr();
      this.take(")");
      return value;
    }
    const token = this.take();
    if (token.type === "constant") return { op: "constant", value: token.value };
    if (token.type !== "identifier") throw new Error(`Expected a signal, constant, or '(' in expression: ${this.source}`);
    if (!this.peek("(")) return { op: "signal", name: token.value };
    this.take("(");
    const args = [];
    if (!this.peek(")")) {
      do {
        args.push(this.parseOr());
        if (!this.peek(",")) break;
        this.take(",");
      } while (true);
    }
    this.take(")");
    const name = token.value.toLowerCase();
    if (!["and", "or", "xor", "nand", "nor", "xnor", "not", "mux"].includes(name)) throw new Error(`Unknown logic function ${token.value}.`);
    if (name === "not" && args.length !== 1) throw new Error("not() requires one argument.");
    if (name === "mux" && args.length !== 3) throw new Error("mux(select, when0, when1) requires three arguments.");
    if (!["not", "mux"].includes(name) && args.length < 2) throw new Error(`${name}() requires at least two arguments.`);
    if (name === "mux") {
      const [select, when0, when1] = args;
      return { op: "or", args: [{ op: "and", args: [{ op: "not", args: [select] }, when0] }, { op: "and", args: [select, when1] }] };
    }
    if (["nand", "nor", "xnor"].includes(name)) {
      const base = { nand: "and", nor: "or", xnor: "xor" }[name];
      return { op: "not", args: [{ op: base, args }] };
    }
    return { op: name, args };
  }
}

export function parseLogicExpression(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Logic expression must be a non-empty string.");
  return new LogicParser(source.trim()).parse();
}

function foldAst(ast) {
  if (!["and", "or", "xor"].includes(ast.op) || ast.args.length <= 2) return ast;
  return ast.args.slice(1).reduce((left, right) => ({ op: ast.op, args: [left, right] }), ast.args[0]);
}

function canonicalAst(ast) {
  if (ast.op === "signal") return `s:${ast.name}`;
  if (ast.op === "constant") return `c:${ast.value}`;
  const folded = foldAst(ast);
  return `${folded.op}(${folded.args.map(canonicalAst).join(",")})`;
}

function validatePort(port, kind) {
  if (!port || typeof port !== "object") throw new Error(`${kind} port must be an object.`);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(port.name ?? "")) throw new Error(`Invalid ${kind} port name: ${port.name}`);
  const width = Number(port.width ?? 1);
  if (!Number.isInteger(width) || width < 1 || width > 64) throw new Error(`${kind} port ${port.name} width must be 1..64.`);
  return { ...port, width };
}

function inputBitNet(port, bit) {
  return port.width === 1 ? `in_${port.name}` : `in_${port.name}_b${bit}`;
}

function outputBitExpression(port, bit) {
  if (port.width === 1) return port.expression ?? port.bits?.[0];
  if (!Array.isArray(port.bits) || port.bits.length !== port.width) throw new Error(`Output ${port.name} requires ${port.width} LSB-first bit expressions.`);
  return port.bits[bit];
}

export function compileLogicProject(spec) {
  if (!spec || typeof spec !== "object") throw new Error("spec must be an object.");
  const name = spec.name ?? "main";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid circuit name: ${name}`);
  const inputs = (spec.inputs ?? []).map((port) => validatePort(port, "input"));
  const outputs = (spec.outputs ?? []).map((port) => validatePort(port, "output"));
  if (!inputs.length) throw new Error("At least one input port is required.");
  if (!outputs.length) throw new Error("At least one output port is required.");
  const portNames = new Set();
  for (const port of [...inputs, ...outputs]) {
    const normalized = port.name.toLocaleLowerCase("en-US");
    if (portNames.has(normalized)) throw new Error(`Port names must be unique ignoring case: ${port.name}`);
    portNames.add(normalized);
  }

  const signalSources = new Map();
  for (const port of inputs) {
    if (port.width === 1) signalSources.set(port.name, inputBitNet(port, 0));
    else for (let bit = 0; bit < port.width; bit += 1) signalSources.set(`${port.name}[${bit}]`, inputBitNet(port, bit));
  }
  const definitions = spec.definitions ?? {};
  for (const name of Object.keys(definitions)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid definition name: ${name}`);
    if (signalSources.has(name)) throw new Error(`Definition collides with an input: ${name}`);
  }

  const nodes = [];
  const nodeByCanonical = new Map();
  const definitionCache = new Map();
  const resolvingDefinitions = new Set();
  let nextNodeId = 1;

  const resolveAst = (ast) => {
    if (ast.op === "signal") {
      if (signalSources.has(ast.name)) return { net: signalSources.get(ast.name), depth: 0 };
      if (Object.hasOwn(definitions, ast.name)) {
        if (definitionCache.has(ast.name)) return definitionCache.get(ast.name);
        if (resolvingDefinitions.has(ast.name)) throw new Error(`Cyclic definition: ${ast.name}`);
        resolvingDefinitions.add(ast.name);
        const resolved = resolveAst(parseLogicExpression(definitions[ast.name]));
        resolvingDefinitions.delete(ast.name);
        definitionCache.set(ast.name, resolved);
        return resolved;
      }
      throw new Error(`Unknown signal ${ast.name}. Bus signals require an explicit bit such as ${ast.name}[0].`);
    }
    if (ast.op === "constant") return { net: `const_${ast.value}`, depth: 0, constant: ast.value };
    const folded = foldAst(ast);
    const key = canonicalAst(folded);
    if (nodeByCanonical.has(key)) return nodeByCanonical.get(key);
    const args = folded.args.map(resolveAst);
    const node = {
      id: nextNodeId++,
      op: folded.op,
      args,
      net: `gate_${nextNodeId - 1}`,
      depth: Math.max(...args.map((arg) => arg.depth)) + 1,
    };
    nodes.push(node);
    nodeByCanonical.set(key, node);
    return node;
  };

  const outputNets = [];
  for (const output of outputs) {
    for (let bit = 0; bit < output.width; bit += 1) {
      const expression = outputBitExpression(output, bit);
      if (typeof expression !== "string" || !expression.trim()) throw new Error(`Output ${output.name}[${bit}] is missing an expression.`);
      outputNets.push({ output, bit, ...resolveAst(parseLogicExpression(expression)) });
    }
  }

  const components = [];
  const wires = [];
  let nextInputY = 100;
  for (const port of inputs) {
    const y = nextInputY;
    components.push({ library: "Wiring", name: "Pin", loc: [100, y], attrs: { appearance: "NewPins", label: port.name, ...(port.width > 1 ? { width: String(port.width) } : {}) } });
    if (port.width === 1) {
      components.push({ library: "Wiring", name: "Tunnel", loc: [140, y], attrs: { label: inputBitNet(port, 0) } });
      wires.push({ from: [100, y], to: [140, y] });
      nextInputY += 70;
    } else {
      components.push({ library: "Wiring", name: "Splitter", loc: [150, y], attrs: { appear: "center", facing: "east", fanout: String(port.width), incoming: String(port.width) } });
      wires.push({ from: [100, y], to: [150, y] });
      const firstY = y - 10 * Math.floor(port.width / 2);
      for (let bit = 0; bit < port.width; bit += 1) {
        const branchY = firstY + bit * 10;
        components.push({ library: "Wiring", name: "Tunnel", loc: [200, branchY], attrs: { label: inputBitNet(port, bit) } });
        wires.push({ from: [170, branchY], to: [200, branchY] });
      }
      nextInputY += Math.max(90, port.width * 10 + 50);
    }
  }

  const constants = new Set(outputNets.filter((item) => item.constant !== undefined).map((item) => item.constant));
  for (const node of nodes) for (const arg of node.args) if (arg.constant !== undefined) constants.add(arg.constant);
  let constantY = nextInputY;
  for (const value of constants) {
    components.push({ library: "Wiring", name: "Constant", loc: [180, constantY], attrs: { value } });
    components.push({ library: "Wiring", name: "Tunnel", loc: [220, constantY], attrs: { label: `const_${value}` } });
    wires.push({ from: [180, constantY], to: [220, constantY] });
    constantY += 60;
  }

  const nodesByDepth = new Map();
  for (const node of nodes) {
    const list = nodesByDepth.get(node.depth) ?? [];
    list.push(node);
    nodesByDepth.set(node.depth, list);
  }
  for (const [depth, depthNodes] of [...nodesByDepth.entries()].sort(([a], [b]) => a - b)) {
    depthNodes.forEach((node, index) => {
      const x = 320 + (depth - 1) * 120;
      const y = 100 + index * 70;
      const gateName = node.op === "not" ? "NOT Gate" : `${node.op.toUpperCase()} Gate`;
      const gateAttrs = node.op === "not" ? {} : { inputs: "2", size: "30" };
      components.push({ library: "Gates", name: gateName, loc: [x, y], attrs: gateAttrs });
      if (node.op === "not") {
        components.push({ library: "Wiring", name: "Tunnel", loc: [x - 50, y], attrs: { facing: "east", label: node.args[0].net } });
        wires.push({ from: [x - 50, y], to: [x - 30, y] });
      } else {
        const inputYs = [y - 10, y + 10];
        node.args.forEach((arg, argIndex) => {
          components.push({ library: "Wiring", name: "Tunnel", loc: [x - 50, inputYs[argIndex]], attrs: { facing: "east", label: arg.net } });
          wires.push({ from: [x - 50, inputYs[argIndex]], to: [x - 30, inputYs[argIndex]] });
        });
      }
      components.push({ library: "Wiring", name: "Tunnel", loc: [x + 30, y], attrs: { label: node.net } });
      wires.push({ from: [x, y], to: [x + 30, y] });
    });
  }

  const maxDepth = Math.max(0, ...nodes.map((node) => node.depth));
  const outputX = Math.max(700, 440 + maxDepth * 120);
  let nextOutputY = 100;
  for (const port of outputs) {
    const y = nextOutputY;
    components.push({ library: "Wiring", name: "Pin", loc: [outputX, y], attrs: { appearance: "NewPins", facing: "west", label: port.name, type: "output", ...(port.width > 1 ? { width: String(port.width) } : {}) } });
    if (port.width === 1) {
      const net = outputNets.find((item) => item.output === port)?.net;
      components.push({ library: "Wiring", name: "Tunnel", loc: [outputX - 40, y], attrs: { facing: "east", label: net } });
      wires.push({ from: [outputX - 40, y], to: [outputX, y] });
      nextOutputY += 70;
    } else {
      components.push({ library: "Wiring", name: "Splitter", loc: [outputX - 50, y], attrs: { appear: "center", facing: "west", fanout: String(port.width), incoming: String(port.width) } });
      wires.push({ from: [outputX - 50, y], to: [outputX, y] });
      const firstY = y - 10 * Math.floor(port.width / 2);
      for (let bit = 0; bit < port.width; bit += 1) {
        const branchY = firstY + bit * 10;
        const net = outputNets.find((item) => item.output === port && item.bit === bit)?.net;
        components.push({ library: "Wiring", name: "Tunnel", loc: [outputX - 100, branchY], attrs: { label: net } });
        wires.push({ from: [outputX - 100, branchY], to: [outputX - 70, branchY] });
      }
      nextOutputY += Math.max(90, port.width * 10 + 50);
    }
  }

  return {
    project: { source: spec.source ?? "4.1.0", main: name, circuits: [{ name, components, wires }] },
    compilation: {
      circuitName: name,
      inputPorts: inputs,
      outputPorts: outputs.map(({ expression, bits, ...port }) => port),
      gateCount: nodes.length,
      maxLogicDepth: maxDepth,
      primitiveCounts: nodes.reduce((counts, node) => ({ ...counts, [node.op]: (counts[node.op] ?? 0) + 1 }), {}),
      note: "Bus bit arrays are LSB-first. Native loading and functional vectors are still required before claiming correctness.",
    },
  };
}

export function createLogicProject({ outputPath, spec, overwrite = false, native = true, executablePath, timeoutMs } = {}) {
  const compiled = compileLogicProject(spec);
  const created = createProject({ outputPath, project: compiled.project, overwrite, native, executablePath, timeoutMs });
  return { ...created, compilation: compiled.compilation };
}

function vectorValue(value, width, direction) {
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value !== "string" || !value.trim()) throw new Error("Test-vector values must be numbers or non-empty strings.");
  const normalized = value.trim();
  if (/\s/.test(normalized) || normalized.includes("#")) throw new Error(`Invalid test-vector token: ${value}`);
  if (/^<dc>$/i.test(normalized) && direction === "input") throw new Error("<DC> is valid only for output columns.");
  if (/^<(?:dc|float)>$/i.test(normalized)) return normalized;
  if (/^-?\d[\d_]*$/.test(normalized) || /^0[xo][0-9a-fx_]+$/i.test(normalized) || /^[01x_]+$/i.test(normalized)) return normalized;
  throw new Error(`Unsupported test-vector token '${value}' for width ${width}.`);
}

function atomicWriteText(path, contents, { overwrite = false, extensions } = {}) {
  const output = assertManagedPath(path, { extensions, write: true });
  if (existsSync(output) && !overwrite) throw new Error(`Output already exists; set overwrite=true to replace it: ${output}`);
  const temp = join(dirname(output), `.${basename(output)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temp, contents, { encoding: "utf8", flag: "wx" });
    renameSync(temp, output);
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
  return { path: output, bytes: Buffer.byteLength(contents), sha256: sha256(contents) };
}

export function writeTestVector({ outputPath, columns, rows, overwrite = false, comment } = {}) {
  if (!Array.isArray(columns) || !columns.length) throw new Error("columns must be a non-empty array.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("rows must be a non-empty array.");
  const normalizedColumns = columns.map((column) => {
    if (!column || typeof column !== "object" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column.name ?? "")) throw new Error(`Invalid vector column: ${JSON.stringify(column)}`);
    const width = Number(column.width ?? 1);
    if (!Number.isInteger(width) || width < 1 || width > 65_536) throw new Error(`Invalid width for ${column.name}.`);
    const direction = column.direction ?? "input";
    if (!["input", "output"].includes(direction)) throw new Error(`Column ${column.name} direction must be input or output.`);
    return { name: column.name, width, direction };
  });
  const names = new Set(normalizedColumns.map((column) => column.name));
  if (names.size !== normalizedColumns.length) throw new Error("Test-vector column names must be unique.");
  const sequential = rows.some((row) => !Array.isArray(row) && (row["<set>"] !== undefined || row["<seq>"] !== undefined || row.set !== undefined || row.seq !== undefined));
  const header = [
    ...normalizedColumns.map((column) => column.width > 1 ? `${column.name}[${column.width}]` : column.name),
    ...(sequential ? ["<set>", "<seq>"] : []),
  ];
  const lines = [];
  if (comment) lines.push(`# ${String(comment).replaceAll(/\r?\n/g, " ").replaceAll("#", "")}`);
  lines.push(header.join(" "));
  rows.forEach((row, rowIndex) => {
    let values;
    let set = 0;
    let seq = 0;
    if (Array.isArray(row)) {
      if (row.length !== normalizedColumns.length) throw new Error(`Row ${rowIndex + 1} has ${row.length} values; expected ${normalizedColumns.length}.`);
      values = row;
    } else if (row && typeof row === "object") {
      values = normalizedColumns.map((column) => {
        if (!Object.hasOwn(row, column.name)) throw new Error(`Row ${rowIndex + 1} is missing ${column.name}.`);
        return row[column.name];
      });
      set = Number(row["<set>"] ?? row.set ?? 0);
      seq = Number(row["<seq>"] ?? row.seq ?? 0);
    } else {
      throw new Error(`Row ${rowIndex + 1} must be an array or object.`);
    }
    if (sequential && (!Number.isInteger(set) || set < 0 || !Number.isInteger(seq) || seq < 0)) throw new Error(`Row ${rowIndex + 1} has invalid set/seq values.`);
    const tokens = normalizedColumns.map((column, index) => vectorValue(values[index], column.width, column.direction));
    if (sequential) tokens.push(String(set), String(seq));
    lines.push(tokens.join(" "));
  });
  lines.push("");
  const contents = lines.join("\n");
  return { ...atomicWriteText(outputPath, contents, { overwrite, extensions: [".txt", ".vec", ".test"] }), rowCount: rows.length, header };
}

export function convertProject({ inputPath, outputPath, overwrite = false, executablePath, timeoutMs } = {}) {
  const input = assertManagedPath(inputPath, { extensions: [".circ"], mustExist: true });
  const output = assertManagedPath(outputPath, { extensions: [".circ"], write: true });
  if (existsSync(output) && !overwrite) throw new Error(`Output already exists; set overwrite=true to replace it: ${output}`);
  const temp = join(dirname(output), `.${basename(output)}.${process.pid}.${Date.now()}.tmp.circ`);
  try {
    const run = nativeRun(["--new-file-format", input, temp], { executablePath, timeoutMs, cwd: dirname(input) });
    if (run.status !== 0 || !existsSync(temp) || statSync(temp).size === 0) throw new Error(`Logisim conversion failed: ${run.stderr || run.stdout || run.error || "unknown error"}`);
    const xml = readBounded(temp, MAX_PROJECT_BYTES);
    const { diagnostics } = staticDiagnostics(xml);
    const errors = diagnostics.filter((item) => item.severity === "error");
    if (errors.length) throw new Error(`Converted project failed validation: ${errors.map((item) => item.message).join("; ")}`);
    renameSync(temp, output);
    return { path: output, bytes: Buffer.byteLength(xml), sha256: sha256(xml), run, summary: inspectProject({ projectPath: output }) };
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
}

export function openProject({ projectPath, appPath = "/Applications/Logisim-evolution.app" } = {}) {
  const project = assertManagedPath(projectPath, { extensions: [".circ"], mustExist: true });
  if (process.platform === "darwin") {
    const resolvedApp = resolve(appPath);
    if (!existsSync(resolvedApp)) throw new Error(`Logisim app was not found: ${resolvedApp}`);
    execFileSync("open", ["-a", resolvedApp, project], { stdio: "ignore" });
    return { opened: true, projectPath: project, application: resolvedApp };
  }
  const executable = findLogisimExecutable();
  const child = spawnSync(executable, [project], { detached: true, stdio: "ignore", timeout: 2_000 });
  return { opened: !child.error, projectPath: project, application: executable, error: child.error?.message ?? null };
}
