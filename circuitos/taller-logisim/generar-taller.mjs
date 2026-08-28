import {
  createProject,
  writeTestVector,
} from "../../plugins/logisim-evolution/mcp/logisim-core.mjs";

const ROOT = "/Users/sebastian.ruiz/Dev/arqui-compu/circuitos/taller-logisim";
const PROJECT_PATH = `${ROOT}/taller-clase-completo.circ`;
const VECTOR_ROOT = `${ROOT}/vectores`;

const NOT = (value) => (value ? 0 : 1);
const AND = (...values) => (values.every(Boolean) ? 1 : 0);
const OR = (...values) => (values.some(Boolean) ? 1 : 0);
const XOR = (...values) => values.reduce((acc, value) => acc ^ value, 0);
const XNOR = (...values) => NOT(XOR(...values));

function makeCircuit(name) {
  return {
    name,
    attrs: { appearance: "logisim_evolution" },
    components: [],
    wires: [],
  };
}

function addComponent(circuit, library, name, x, y, attrs = {}) {
  circuit.components.push({ library, name, loc: [x, y], attrs });
}

function addWire(circuit, x1, y1, x2, y2) {
  circuit.wires.push({ from: [x1, y1], to: [x2, y2] });
}

function addText(circuit, x, y, text) {
  addComponent(circuit, "Base", "Text", x, y, { halign: "left", text });
}

function wrapText(text, maxCharacters = 66) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function addInput(circuit, name, y) {
  addComponent(circuit, "Wiring", "Pin", 80, y, {
    appearance: "NewPins",
    label: name,
  });
  return [80, y];
}

function addWirePath(circuit, points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    if (x1 !== x2 && y1 !== y2) {
      throw new Error(`Wire segment must be orthogonal: (${x1},${y1}) -> (${x2},${y2})`);
    }
    addWire(circuit, x1, y1, x2, y2);
  }
}

function addRail(circuit, x, yValues) {
  const sorted = [...new Set(yValues)].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    addWire(circuit, x, sorted[index], x, sorted[index + 1]);
  }
}

function addOutput(circuit, label, source, y, x = 920, via = []) {
  addComponent(circuit, "Wiring", "Pin", x, y, {
    appearance: "NewPins",
    facing: "west",
    label,
    type: "output",
  });
  addWirePath(circuit, [source, ...via, [x, y]]);
}

function gateInputOffset(inputCount, size, index) {
  let skipStart;
  let skipDist;
  let skipLowerEven;
  if (inputCount <= 3) {
    if (size < 40) {
      skipStart = -5;
      skipDist = 10;
      skipLowerEven = 10;
    } else if (size < 60 || inputCount <= 2) {
      skipStart = -10;
      skipDist = 20;
      skipLowerEven = 20;
    } else {
      skipStart = -15;
      skipDist = 30;
      skipLowerEven = 30;
    }
  } else if (inputCount === 4 && size >= 60) {
    skipStart = -5;
    skipDist = 20;
    skipLowerEven = 0;
  } else {
    skipStart = -5;
    skipDist = 10;
    skipLowerEven = 10;
  }

  let dy;
  if ((inputCount & 1) === 1) {
    dy = skipStart * (inputCount - 1) + skipDist * index;
  } else {
    dy = skipStart * inputCount + skipDist * index;
    if (index >= inputCount / 2) dy += skipLowerEven;
    if (inputCount === 4 && size >= 60) dy -= 10;
  }
  return dy;
}

function addGate(circuit, name, x, y, inputNets, outputNet, size = 30) {
  const attrs = name === "NOT Gate"
    ? {}
    : { inputs: String(inputNets.length), size: String(size) };
  addComponent(circuit, "Gates", name, x, y, attrs);

  let inputPorts;
  if (name === "NOT Gate") {
    inputPorts = [[x - 30, y]];
  } else {
    const outputBubble = ["NAND Gate", "NOR Gate", "XNOR Gate"].includes(name);
    const inputX = x - size - (outputBubble ? 10 : 0);
    inputPorts = inputNets.map((_, index) => [
      inputX,
      y + gateInputOffset(inputNets.length, size, index),
    ]);
  }
  return { inputs: inputPorts, output: [x, y], net: outputNet };
}

function truthRows(inputs, evaluate) {
  const rows = [];
  for (let value = 0; value < 2 ** inputs.length; value += 1) {
    const assignment = {};
    const bits = inputs.map((name, index) => {
      const bit = (value >> (inputs.length - index - 1)) & 1;
      assignment[name] = bit;
      return bit;
    });
    rows.push([...bits, evaluate(assignment)]);
  }
  return rows;
}

function addDocumentation(circuit, exercise) {
  const docsY = exercise.docsY ?? 420;
  const tableX = exercise.tableX ?? 730;
  let lineY = docsY;
  [
    `Función original: ${exercise.original}`,
    `Forma simplificada: ${exercise.simplified}`,
    `Explicación: ${exercise.explanation}`,
  ].forEach((paragraph) => {
    wrapText(paragraph).forEach((line) => {
      addText(circuit, 80, lineY, line);
      lineY += 30;
    });
  });
  addText(circuit, tableX, docsY, "Tabla de verdad");
  addText(circuit, tableX, docsY + 30, `${exercise.inputs.join("    ")}    |    ${exercise.output}`);
  truthRows(exercise.inputs, exercise.evaluate).forEach((row, index) => {
    const inputs = row.slice(0, -1).join("    ");
    addText(circuit, tableX, docsY + 60 + index * 30, `${inputs}    |    ${row.at(-1)}`);
  });
}

const circuits = [];
const exercises = [];

function addExercise(definition) {
  const circuit = makeCircuit(definition.name);
  addText(circuit, 80, 30, definition.title);
  const positions = definition.inputY ?? (definition.inputs.length === 2
    ? { A: 100, B: 240 }
    : { A: 80, B: 170, C: 260 });
  const inputPorts = Object.fromEntries(
    definition.inputs.map((input) => [input, addInput(circuit, input, positions[input])]),
  );
  definition.layout(circuit, inputPorts);
  addDocumentation(circuit, definition);
  circuits.push(circuit);
  exercises.push(definition);
}

const index = makeCircuit("INDICE_TALLER");
addText(index, 80, 60, "TALLER DE CLASE - LOGISIM");
addText(index, 80, 100, "Proyecto único con 15 ejercicios completamente documentados.");
addText(index, 80, 140, "Seleccione un circuito en el árbol de la izquierda para abrirlo.");
addText(index, 80, 200, "1. Pasar del circuito al álgebra");
[
  "A_RON", "B_GINEBRA", "C_WHISKEY", "D_AGUA", "E_VODKA",
  "F_TEQUILA", "G_BRANDY", "H_CACHACA", "I_PACHARAN", "J_VINO",
].forEach((name, indexValue) => addText(index, 100, 240 + indexValue * 30, name));
addText(index, 430, 200, "2. Pasar del álgebra al circuito");
[
  "K_BENEDETTI", "L_MACHADO", "M_TAGORE", "N_CORTAZAR", "O_NERUDA",
].forEach((name, indexValue) => addText(index, 450, 240 + indexValue * 30, name));
addText(index, 430, 430, "Convención: + = OR, · = AND, ¬ = NOT, ⊕ = XOR.");
addText(index, 430, 470, "Cada pestaña incluye circuito, explicación y función.");
addText(index, 430, 500, "También incluye su tabla de verdad exhaustiva.");
circuits.push(index);

addExercise({
  name: "A_RON",
  title: "Ejercicio a — RON",
  inputs: ["A", "B"],
  output: "RON",
  original: "RON = ¬A · B",
  simplified: "RON = ¬A · B",
  explanation: "Se invierte A y el resultado se combina con B mediante una AND.",
  evaluate: ({ A, B }) => AND(NOT(A), B),
  layout: (circuit, { A, B }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 100, ["A"], "nA");
    const result = addGate(circuit, "AND Gate", 540, 160, ["nA", "B"], "OUT_RON");
    addWirePath(circuit, [A, nA.inputs[0]]);
    addWirePath(circuit, [nA.output, [400, 100], [400, 150], result.inputs[0]]);
    addWirePath(circuit, [B, [430, 240], [430, 170], result.inputs[1]]);
    addOutput(circuit, "RON", result.output, 160);
  },
});

addExercise({
  name: "B_GINEBRA",
  title: "Ejercicio b — GINEBRA",
  inputs: ["A", "B"],
  output: "GINEBRA",
  original: "GINEBRA = A + ¬B",
  simplified: "GINEBRA = A + ¬B",
  explanation: "B se invierte y luego se aplica OR entre A y ¬B.",
  evaluate: ({ A, B }) => OR(A, NOT(B)),
  layout: (circuit, { A, B }) => {
    const nB = addGate(circuit, "NOT Gate", 300, 240, ["B"], "nB");
    const result = addGate(circuit, "OR Gate", 540, 160, ["A", "nB"], "OUT_GINEBRA");
    addWirePath(circuit, [B, nB.inputs[0]]);
    addWirePath(circuit, [A, [430, 100], [430, 150], result.inputs[0]]);
    addWirePath(circuit, [nB.output, [450, 240], [450, 170], result.inputs[1]]);
    addOutput(circuit, "GINEBRA", result.output, 160);
  },
});

addExercise({
  name: "C_WHISKEY",
  title: "Ejercicio c — WHISKEY",
  inputs: ["A", "B"],
  output: "WHISKEY",
  original: "WHISKEY = ¬A + A·B",
  simplified: "WHISKEY = ¬A + B",
  explanation: "Una rama produce ¬A; la otra A·B. Ambas se unen con OR.",
  evaluate: ({ A, B }) => OR(NOT(A), AND(A, B)),
  layout: (circuit, { A, B }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 100, ["A"], "nA");
    const product = addGate(circuit, "AND Gate", 360, 280, ["A", "B"], "AB");
    const result = addGate(circuit, "OR Gate", 600, 170, ["nA", "AB"], "OUT_WHISKEY");
    addWirePath(circuit, [A, [220, 100], nA.inputs[0]]);
    addWirePath(circuit, [[220, 100], [220, 270], product.inputs[0]]);
    addWirePath(circuit, [B, [250, 240], [250, 290], product.inputs[1]]);
    addWirePath(circuit, [nA.output, [500, 100], [500, 160], result.inputs[0]]);
    addWirePath(circuit, [product.output, [520, 280], [520, 180], result.inputs[1]]);
    addOutput(circuit, "WHISKEY", result.output, 170);
  },
});

addExercise({
  name: "D_AGUA",
  title: "Ejercicio d — AGUA",
  inputs: ["A", "B"],
  output: "AGUA",
  original: "AGUA = A·¬B + ¬A·B",
  simplified: "AGUA = A ⊕ B",
  explanation: "Las dos AND detectan entradas distintas; la OR implementa XOR.",
  evaluate: ({ A, B }) => XOR(A, B),
  docsY: 400,
  inputY: { A: 100, B: 300 },
  layout: (circuit, { A, B }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 180, ["A"], "nA");
    const nB = addGate(circuit, "NOT Gate", 300, 220, ["B"], "nB");
    const upper = addGate(circuit, "AND Gate", 520, 130, ["A", "nB"], "T1");
    const lower = addGate(circuit, "AND Gate", 520, 250, ["nA", "B"], "T2");
    const result = addGate(circuit, "OR Gate", 720, 190, ["T1", "T2"], "OUT_AGUA");
    addWirePath(circuit, [A, [180, 100], [180, 180], nA.inputs[0]]);
    addWirePath(circuit, [[180, 100], [200, 100], [200, 120], upper.inputs[0]]);
    addWirePath(circuit, [B, [220, 300], [220, 220], nB.inputs[0]]);
    addWirePath(circuit, [[220, 300], [240, 300], [240, 260], lower.inputs[1]]);
    addWirePath(circuit, [nA.output, [450, 180], [450, 240], lower.inputs[0]]);
    addWirePath(circuit, [nB.output, [430, 220], [430, 140], upper.inputs[1]]);
    addWirePath(circuit, [upper.output, [620, 130], [620, 180], result.inputs[0]]);
    addWirePath(circuit, [lower.output, [640, 250], [640, 200], result.inputs[1]]);
    addOutput(circuit, "AGUA", result.output, 190);
  },
});

addExercise({
  name: "E_VODKA",
  title: "Ejercicio e — VODKA",
  inputs: ["A", "B"],
  output: "VODKA",
  original: "VODKA = ¬A + ¬(A·B)",
  simplified: "VODKA = ¬A + ¬B = ¬(A·B)",
  explanation: "Se hace OR entre ¬A y la salida NAND de A con B.",
  evaluate: ({ A, B }) => OR(NOT(A), NOT(AND(A, B))),
  inputY: { A: 100, B: 300 },
  layout: (circuit, { A, B }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 100, ["A"], "nA");
    const nand = addGate(circuit, "NAND Gate", 420, 250, ["A", "B"], "nAB");
    const result = addGate(circuit, "OR Gate", 650, 170, ["nA", "nAB"], "OUT_VODKA");
    addWirePath(circuit, [A, [200, 100], nA.inputs[0]]);
    addWirePath(circuit, [[200, 100], [200, 240], nand.inputs[0]]);
    addWirePath(circuit, [B, [260, 300], [260, 260], nand.inputs[1]]);
    addWirePath(circuit, [nA.output, [540, 100], [540, 160], result.inputs[0]]);
    addWirePath(circuit, [nand.output, [560, 250], [560, 180], result.inputs[1]]);
    addOutput(circuit, "VODKA", result.output, 170);
  },
});

addExercise({
  name: "F_TEQUILA",
  title: "Ejercicio f — TEQUILA",
  inputs: ["A", "B", "C"],
  output: "TEQUILA",
  original: "TEQUILA = ¬(A·B) + ¬(B+C)",
  simplified: "TEQUILA = ¬A + ¬B = ¬(A·B)",
  explanation: "Una NAND procesa A,B; una NOR procesa B,C; sus salidas van a OR.",
  evaluate: ({ A, B, C }) => OR(NOT(AND(A, B)), NOT(OR(B, C))),
  layout: (circuit, { A, B, C }) => {
    const nand = addGate(circuit, "NAND Gate", 400, 110, ["A", "B"], "nAB");
    const nor = addGate(circuit, "NOR Gate", 400, 230, ["B", "C"], "nBorC");
    const result = addGate(circuit, "OR Gate", 650, 170, ["nAB", "nBorC"], "OUT_TEQUILA");
    addWirePath(circuit, [A, [200, 80], [200, 100], nand.inputs[0]]);
    addWirePath(circuit, [B, [270, 170]]);
    addWirePath(circuit, [[270, 170], [270, 120], nand.inputs[1]]);
    addWirePath(circuit, [[270, 170], [270, 220], nor.inputs[0]]);
    addWirePath(circuit, [C, [300, 260], [300, 240], nor.inputs[1]]);
    addWirePath(circuit, [nand.output, [540, 110], [540, 160], result.inputs[0]]);
    addWirePath(circuit, [nor.output, [560, 230], [560, 180], result.inputs[1]]);
    addOutput(circuit, "TEQUILA", result.output, 170);
  },
});

addExercise({
  name: "G_BRANDY",
  title: "Ejercicio g — BRANDY",
  inputs: ["A", "B", "C"],
  output: "BRANDY",
  original: "BRANDY = ¬A + B + ¬(A·C)",
  simplified: "BRANDY = ¬A + B + ¬C",
  explanation: "La OR de tres entradas reúne ¬A, B y la NAND de A con C.",
  evaluate: ({ A, B, C }) => OR(NOT(A), B, NOT(AND(A, C))),
  layout: (circuit, { A, B, C }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 80, ["A"], "nA");
    const nand = addGate(circuit, "NAND Gate", 420, 260, ["A", "C"], "nAC");
    const result = addGate(circuit, "OR Gate", 670, 160, ["nA", "B", "nAC"], "OUT_BRANDY", 50);
    addWirePath(circuit, [A, [200, 80], nA.inputs[0]]);
    addWirePath(circuit, [[200, 80], [220, 80], [220, 250], nand.inputs[0]]);
    addWirePath(circuit, [C, [240, 260], [240, 270], nand.inputs[1]]);
    addWirePath(circuit, [nA.output, [560, 80], [560, 140], result.inputs[0]]);
    addWirePath(circuit, [B, [540, 170], [540, 160], result.inputs[1]]);
    addWirePath(circuit, [nand.output, [580, 260], [580, 180], result.inputs[2]]);
    addOutput(circuit, "BRANDY", result.output, 160);
  },
});

addExercise({
  name: "H_CACHACA",
  title: "Ejercicio h — CACHACA",
  inputs: ["A", "B", "C"],
  output: "CACHACA",
  original: "CACHACA = (A ⊕ B) + ¬(B ⊕ C)",
  simplified: "CACHACA = (A ⊕ B) + (B XNOR C)",
  explanation: "La rama superior es XOR, la inferior XNOR y luego se aplica OR.",
  evaluate: ({ A, B, C }) => OR(XOR(A, B), XNOR(B, C)),
  layout: (circuit, { A, B, C }) => {
    const xor = addGate(circuit, "XOR Gate", 400, 110, ["A", "B"], "AXB");
    const xnor = addGate(circuit, "XNOR Gate", 400, 250, ["B", "C"], "BXC_n");
    const result = addGate(circuit, "OR Gate", 650, 180, ["AXB", "BXC_n"], "OUT_CACHACA");
    addWirePath(circuit, [A, [220, 80], [220, 100], xor.inputs[0]]);
    addWirePath(circuit, [B, [280, 170]]);
    addWirePath(circuit, [[280, 170], [280, 120], xor.inputs[1]]);
    addWirePath(circuit, [[280, 170], [280, 240], xnor.inputs[0]]);
    addWirePath(circuit, [C, xnor.inputs[1]]);
    addWirePath(circuit, [xor.output, [550, 110], [550, 170], result.inputs[0]]);
    addWirePath(circuit, [xnor.output, [570, 250], [570, 190], result.inputs[1]]);
    addOutput(circuit, "CACHACA", result.output, 180);
  },
});

addExercise({
  name: "I_PACHARAN",
  title: "Ejercicio i — PACHARAN",
  inputs: ["A", "B", "C"],
  output: "PACHARAN",
  original: "PACHARAN = ¬A·B·C + ¬B·C + ¬A·B·¬C + A·¬C",
  simplified: "PACHARAN = ¬A·B + ¬B·C + A·¬C",
  explanation: "Cuatro productos canónicos/parciales se combinan mediante una OR de cuatro entradas.",
  evaluate: ({ A, B, C }) => OR(
    AND(NOT(A), B, C),
    AND(NOT(B), C),
    AND(NOT(A), B, NOT(C)),
    AND(A, NOT(C)),
  ),
  docsY: 440,
  tableX: 760,
  inputY: { A: 60, B: 170, C: 270 },
  layout: (circuit, { A, B, C }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 60, ["A"], "nA");
    const nB = addGate(circuit, "NOT Gate", 300, 170, ["B"], "nB");
    const nC = addGate(circuit, "NOT Gate", 300, 270, ["C"], "nC");
    const m1 = addGate(circuit, "AND Gate", 650, 80, ["nA", "B", "C"], "M1", 50);
    const m2 = addGate(circuit, "AND Gate", 650, 170, ["nB", "C"], "M2");
    const m3 = addGate(circuit, "AND Gate", 650, 260, ["nA", "B", "nC"], "M3", 50);
    const m4 = addGate(circuit, "AND Gate", 650, 350, ["A", "nC"], "M4");
    const result = addGate(circuit, "OR Gate", 850, 215, ["M1", "M2", "M3", "M4"], "OUT_PACHARAN", 70);

    addWirePath(circuit, [A, [160, 60], nA.inputs[0]]);
    addWirePath(circuit, [B, [200, 170], nB.inputs[0]]);
    addWirePath(circuit, [C, [240, 270], nC.inputs[0]]);
    addWirePath(circuit, [nA.output, [340, 60]]);
    addWirePath(circuit, [nB.output, [380, 170]]);
    addWirePath(circuit, [nC.output, [420, 270]]);

    addRail(circuit, 160, [60, 340]);
    addRail(circuit, 200, [80, 170, 260]);
    addRail(circuit, 240, [100, 180, 270]);
    addRail(circuit, 340, [60, 240]);
    addRail(circuit, 380, [160, 170]);
    addRail(circuit, 420, [270, 280, 360]);

    addWirePath(circuit, [[340, 60], m1.inputs[0]]);
    addWirePath(circuit, [[200, 80], m1.inputs[1]]);
    addWirePath(circuit, [[240, 100], m1.inputs[2]]);
    addWirePath(circuit, [[380, 160], m2.inputs[0]]);
    addWirePath(circuit, [[240, 180], m2.inputs[1]]);
    addWirePath(circuit, [[340, 240], m3.inputs[0]]);
    addWirePath(circuit, [[200, 260], m3.inputs[1]]);
    addWirePath(circuit, [[420, 280], m3.inputs[2]]);
    addWirePath(circuit, [[160, 340], m4.inputs[0]]);
    addWirePath(circuit, [[420, 360], m4.inputs[1]]);

    addWirePath(circuit, [m1.output, [740, 80], [740, 185], result.inputs[0]]);
    addWirePath(circuit, [m2.output, [720, 170], [720, 205], result.inputs[1]]);
    addWirePath(circuit, [m3.output, [700, 260], [700, 225], result.inputs[2]]);
    addWirePath(circuit, [m4.output, [680, 350], [680, 245], result.inputs[3]]);
    addOutput(circuit, "PACHARAN", result.output, 215, 980);
  },
});

addExercise({
  name: "J_VINO",
  title: "Ejercicio j — VINO",
  inputs: ["A", "B", "C"],
  output: "VINO",
  original: "VINO = ¬(¬A + ¬B) ⊕ (B·C)",
  simplified: "VINO = (A·B) ⊕ (B·C)",
  explanation: "La NOR de ¬A,¬B produce A·B; luego se aplica XOR con B·C.",
  evaluate: ({ A, B, C }) => XOR(NOT(OR(NOT(A), NOT(B))), AND(B, C)),
  layout: (circuit, { A, B, C }) => {
    const nA = addGate(circuit, "NOT Gate", 300, 80, ["A"], "nA");
    const nB = addGate(circuit, "NOT Gate", 300, 170, ["B"], "nB");
    const nor = addGate(circuit, "NOR Gate", 520, 120, ["nA", "nB"], "AB");
    const and = addGate(circuit, "AND Gate", 520, 260, ["B", "C"], "BC");
    const result = addGate(circuit, "XOR Gate", 750, 190, ["AB", "BC"], "OUT_VINO");
    addWirePath(circuit, [A, nA.inputs[0]]);
    addWirePath(circuit, [B, [200, 170], nB.inputs[0]]);
    addWirePath(circuit, [[200, 170], [200, 250], and.inputs[0]]);
    addWirePath(circuit, [C, [220, 260], [220, 270], and.inputs[1]]);
    addWirePath(circuit, [nA.output, [420, 80], [420, 110], nor.inputs[0]]);
    addWirePath(circuit, [nB.output, [440, 170], [440, 130], nor.inputs[1]]);
    addWirePath(circuit, [nor.output, [640, 120], [640, 180], result.inputs[0]]);
    addWirePath(circuit, [and.output, [660, 260], [660, 200], result.inputs[1]]);
    addOutput(circuit, "VINO", result.output, 190);
  },
});

addExercise({
  name: "K_BENEDETTI",
  title: "Álgebra → circuito — BENEDETTI",
  inputs: ["A", "B"],
  output: "BENEDETTI",
  original: "BENEDETTI = ¬(A·B) + ¬A·¬B",
  simplified: "BENEDETTI = ¬(A·B) = ¬A + ¬B",
  explanation: "Se implementan una NAND y el producto ¬A·¬B; luego se unen con OR.",
  evaluate: ({ A, B }) => OR(NOT(AND(A, B)), AND(NOT(A), NOT(B))),
  docsY: 410,
  inputY: { A: 80, B: 320 },
  layout: (circuit, { A, B }) => {
    const nand = addGate(circuit, "NAND Gate", 400, 120, ["A", "B"], "T1");
    const nA = addGate(circuit, "NOT Gate", 300, 210, ["A"], "nA");
    const nB = addGate(circuit, "NOT Gate", 300, 290, ["B"], "nB");
    const and = addGate(circuit, "AND Gate", 520, 260, ["nA", "nB"], "T2");
    const result = addGate(circuit, "OR Gate", 720, 180, ["T1", "T2"], "OUT_BENEDETTI");
    addWirePath(circuit, [A, [200, 80]]);
    addWirePath(circuit, [[200, 80], [200, 210], nA.inputs[0]]);
    addWirePath(circuit, [[200, 80], [220, 80], [220, 110], nand.inputs[0]]);
    addWirePath(circuit, [B, [240, 320]]);
    addWirePath(circuit, [[240, 320], [240, 290], nB.inputs[0]]);
    addWirePath(circuit, [[240, 320], [330, 320], [330, 130], nand.inputs[1]]);
    addWirePath(circuit, [nA.output, [420, 210], [420, 250], and.inputs[0]]);
    addWirePath(circuit, [nB.output, [440, 290], [440, 270], and.inputs[1]]);
    addWirePath(circuit, [nand.output, [620, 120], [620, 170], result.inputs[0]]);
    addWirePath(circuit, [and.output, [640, 260], [640, 190], result.inputs[1]]);
    addOutput(circuit, "BENEDETTI", result.output, 180);
  },
});

addExercise({
  name: "L_MACHADO",
  title: "Álgebra → circuito — MACHADO",
  inputs: ["A", "B", "C"],
  output: "MACHADO",
  original: "MACHADO = ¬(B·C) + ¬(A + ¬C)",
  simplified: "MACHADO = ¬A + ¬B + ¬C = ¬(A·B·C)",
  explanation: "La primera rama es NAND(B,C); la segunda es NOR(A,¬C); luego OR.",
  evaluate: ({ A, B, C }) => OR(NOT(AND(B, C)), NOT(OR(A, NOT(C)))),
  inputY: { A: 80, B: 170, C: 280 },
  layout: (circuit, { A, B, C }) => {
    const nand = addGate(circuit, "NAND Gate", 400, 100, ["B", "C"], "T1");
    const nC = addGate(circuit, "NOT Gate", 300, 280, ["C"], "nC");
    const nor = addGate(circuit, "NOR Gate", 520, 250, ["A", "nC"], "T2");
    const result = addGate(circuit, "OR Gate", 740, 170, ["T1", "T2"], "OUT_MACHADO");
    addWirePath(circuit, [B, [180, 170], [180, 90], nand.inputs[0]]);
    addWirePath(circuit, [C, [220, 280], nC.inputs[0]]);
    addWirePath(circuit, [[220, 280], [260, 280], [260, 110], nand.inputs[1]]);
    addWirePath(circuit, [A, [420, 80], [420, 240], nor.inputs[0]]);
    addWirePath(circuit, [nC.output, [440, 280], [440, 260], nor.inputs[1]]);
    addWirePath(circuit, [nand.output, [640, 100], [640, 160], result.inputs[0]]);
    addWirePath(circuit, [nor.output, [660, 250], [660, 180], result.inputs[1]]);
    addOutput(circuit, "MACHADO", result.output, 170);
  },
});

addExercise({
  name: "M_TAGORE",
  title: "Álgebra → circuito — TAGORE",
  inputs: ["A", "B", "C"],
  output: "TAGORE",
  original: "TAGORE = ¬(A + ¬C) + ¬B + ¬¬C",
  simplified: "TAGORE = ¬B + C",
  explanation: "Se respetan la NOR de A,¬C, el inversor de B y la doble inversión de C.",
  evaluate: ({ A, B, C }) => OR(NOT(OR(A, NOT(C))), NOT(B), NOT(NOT(C))),
  docsY: 410,
  inputY: { A: 80, B: 170, C: 300 },
  layout: (circuit, { A, B, C }) => {
    const nC = addGate(circuit, "NOT Gate", 300, 300, ["C"], "nC");
    const nor = addGate(circuit, "NOR Gate", 520, 120, ["A", "nC"], "T1");
    const nB = addGate(circuit, "NOT Gate", 300, 170, ["B"], "nB");
    const cDouble = addGate(circuit, "NOT Gate", 520, 300, ["nC"], "C_doble");
    const result = addGate(circuit, "OR Gate", 740, 200, ["T1", "nB", "C_doble"], "OUT_TAGORE", 50);
    addWirePath(circuit, [A, [440, 80], [440, 110], nor.inputs[0]]);
    addWirePath(circuit, [B, nB.inputs[0]]);
    addWirePath(circuit, [C, nC.inputs[0]]);
    addWirePath(circuit, [nC.output, cDouble.inputs[0]]);
    addWirePath(circuit, [nC.output, [420, 300], [420, 130], nor.inputs[1]]);
    addWirePath(circuit, [nor.output, [640, 120], [640, 180], result.inputs[0]]);
    addWirePath(circuit, [nB.output, [360, 170], [360, 100], [660, 100], [660, 200], result.inputs[1]]);
    addWirePath(circuit, [cDouble.output, [670, 300], [670, 220], result.inputs[2]]);
    addOutput(circuit, "TAGORE", result.output, 200);
  },
});

addExercise({
  name: "N_CORTAZAR",
  title: "Álgebra → circuito — CORTAZAR",
  inputs: ["A", "B", "C"],
  output: "CORTAZAR",
  original: "CORTAZAR = ¬( ¬(A·¬B) + C )",
  simplified: "CORTAZAR = A·¬B·¬C",
  explanation: "Se invierte B, se forma ¬(A·¬B) con NAND y la barra exterior se implementa con NOR.",
  evaluate: ({ A, B, C }) => NOT(OR(NOT(AND(A, NOT(B))), C)),
  inputY: { A: 80, B: 170, C: 280 },
  layout: (circuit, { A, B, C }) => {
    const nB = addGate(circuit, "NOT Gate", 300, 170, ["B"], "nB");
    const nand = addGate(circuit, "NAND Gate", 520, 130, ["A", "nB"], "T1");
    const result = addGate(circuit, "NOR Gate", 740, 200, ["T1", "C"], "OUT_CORTAZAR");
    addWirePath(circuit, [B, nB.inputs[0]]);
    addWirePath(circuit, [A, [400, 80], [400, 120], nand.inputs[0]]);
    addWirePath(circuit, [nB.output, [420, 170], [420, 140], nand.inputs[1]]);
    addWirePath(circuit, [nand.output, [620, 130], [620, 190], result.inputs[0]]);
    addWirePath(circuit, [C, [640, 280], [640, 210], result.inputs[1]]);
    addOutput(circuit, "CORTAZAR", result.output, 200);
  },
});

addExercise({
  name: "O_NERUDA",
  title: "Álgebra → circuito — NERUDA",
  inputs: ["A", "B", "C"],
  output: "NERUDA",
  original: "NERUDA = ¬( ¬(A + ¬B) ⊕ ¬(¬B·C) )",
  simplified: "NERUDA = ¬A·B + ¬A·C + ¬B·C",
  explanation: "Las ramas NOR(A,¬B) y NAND(¬B,C) entran a una XNOR, que representa la barra del XOR.",
  evaluate: ({ A, B, C }) => XNOR(NOT(OR(A, NOT(B))), NOT(AND(NOT(B), C))),
  inputY: { A: 80, B: 170, C: 280 },
  layout: (circuit, { A, B, C }) => {
    const nB = addGate(circuit, "NOT Gate", 300, 170, ["B"], "nB");
    const nor = addGate(circuit, "NOR Gate", 520, 110, ["A", "nB"], "L");
    const nand = addGate(circuit, "NAND Gate", 520, 260, ["nB", "C"], "R");
    const result = addGate(circuit, "XNOR Gate", 750, 180, ["L", "R"], "OUT_NERUDA");
    addWirePath(circuit, [B, nB.inputs[0]]);
    addWirePath(circuit, [A, [400, 80], [400, 100], nor.inputs[0]]);
    addWirePath(circuit, [nB.output, [380, 170]]);
    addWirePath(circuit, [[380, 170], [420, 170], [420, 120], nor.inputs[1]]);
    addWirePath(circuit, [[380, 170], [380, 250], nand.inputs[0]]);
    addWirePath(circuit, [C, [420, 280], [420, 270], nand.inputs[1]]);
    addWirePath(circuit, [nor.output, [630, 110], [630, 170], result.inputs[0]]);
    addWirePath(circuit, [nand.output, [650, 260], [650, 190], result.inputs[1]]);
    addOutput(circuit, "NERUDA", result.output, 180);
  },
});

const created = createProject({
  outputPath: PROJECT_PATH,
  overwrite: true,
  native: false,
  project: {
    source: "4.1.0",
    main: "INDICE_TALLER",
    circuits,
  },
});

const vectors = exercises.map((exercise) => {
  const columns = [
    ...exercise.inputs.map((name) => ({ name, width: 1, direction: "input" })),
    { name: exercise.output, width: 1, direction: "output" },
  ];
  const rows = truthRows(exercise.inputs, exercise.evaluate);
  return writeTestVector({
    outputPath: `${VECTOR_ROOT}/${exercise.name}.test`,
    columns,
    rows,
    overwrite: true,
    comment: `${exercise.title}: tabla exhaustiva de ${rows.length} combinaciones`,
  });
});

console.log(JSON.stringify({
  project: created,
  circuits: circuits.length,
  exercises: exercises.length,
  vectors: vectors.map(({ path, rowCount }) => ({ path, rowCount })),
}, null, 2));
