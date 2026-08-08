const toBin = (num, bits) => (num >>> 0).toString(2).padStart(bits, '0').slice(-bits);

class VonNeumannSimulator {
  constructor() {
    this.memory = {};
    this.currentStep = 0;
    this.stepsSequence = [];
    this.autoInterval = null;

    this.dom = {
      formatSelect: document.getElementById('formatSelect'),
      opSelect: document.getElementById('opSelect'),
      valA: document.getElementById('valA'),
      valB: document.getElementById('valB'),
      lblA: document.getElementById('lblA'),
      lblB: document.getElementById('lblB'),
      btnLoad: document.getElementById('btnLoadInstruction'),
      btnNext: document.getElementById('btnNext'),
      btnAuto: document.getElementById('btnAuto'),
      btnReset: document.getElementById('btnReset'),
      descPanel: document.getElementById('descPanel'),
      memTableBody: document.getElementById('memTableBody'),
      valPc: document.getElementById('val-pc'),
      valRi: document.getElementById('val-ri'),
      valRdir: document.getElementById('val-rdir'),
      valRdatos: document.getElementById('val-rdatos'),
      valRentrada: document.getElementById('val-rentrada'),
      valAcum: document.getElementById('val-acum'),
      decodificador: document.getElementById('decodificador')
    };

    this.bindEvents();
    this.resetMemory();
  }

  bindEvents() {
    this.dom.formatSelect.addEventListener('change', () => this.handleFormatChange());
    this.dom.btnLoad.addEventListener('click', () => this.setupSimulation());
    this.dom.btnNext.addEventListener('click', () => this.nextStep());
    this.dom.btnAuto.addEventListener('click', () => this.toggleAuto());
    this.dom.btnReset.addEventListener('click', () => this.reset());
  }

  handleFormatChange() {
    const isBin = this.dom.formatSelect.value === 'BIN';
    this.dom.lblA.innerText = isBin ? 'Valor A (Binario)' : 'Valor A (Decimal)';
    this.dom.lblB.innerText = isBin ? 'Valor B (Binario)' : 'Valor B (Decimal)';
    
    if (isBin) {
      this.dom.valA.value = '00000101'; // 5 en binario
      this.dom.valB.value = '00001011'; // 11 en binario
    } else {
      this.dom.valA.value = '5';
      this.dom.valB.value = '11';
    }
  }

  resetMemory() {
    this.memory = {
      '0000': '00000000',
      '0001': '00000000',
      '0010': '00000000',
      '0011': '00000000',
      '0100': '00000000',
      '0101': '00000000',
      '0110': '00000000',
      '0111': '00000000'
    };
    this.renderMemoryTable();
  }

  renderMemoryTable() {
    this.dom.memTableBody.innerHTML = '';
    Object.keys(this.memory).forEach(addr => {
      const row = document.createElement('tr');
      row.id = `mem-${addr}`;
      row.innerHTML = `<td>${addr}</td><td id="cell-${addr}">${this.memory[addr]}</td>`;
      this.dom.memTableBody.appendChild(row);
    });
  }

  parseInput(inputStr, format) {
    const cleanStr = inputStr.trim();
    if (format === 'BIN') {
      if (!/^[01]+$/.test(cleanStr)) {
        throw new Error(`El valor "${inputStr}" contiene caracteres no válidos para formato binario (solo 0 y 1).`);
      }
      if (cleanStr.length > 8) {
        throw new Error(`El valor binario "${inputStr}" excede los 8 bits permitidos.`);
      }
      return parseInt(cleanStr, 2);
    } else {
      const parsed = parseInt(cleanStr, 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 255) {
        throw new Error(`El valor decimal "${inputStr}" debe ser un número entero entre 0 y 255.`);
      }
      return parsed;
    }
  }

  setupSimulation() {
    const format = this.dom.formatSelect.value;
    const op = this.dom.opSelect.value;

    let numA, numB;
    try {
      numA = this.parseInput(this.dom.valA.value, format);
      numB = this.parseInput(this.dom.valB.value, format);
    } catch (err) {
      alert(`Error de Entrada: ${err.message}`);
      return;
    }

    if (op === 'DIV' && numB === 0) {
      alert('Error: División por cero no permitida.');
      return;
    }

    const binA = toBin(numA, 8);
    const binB = toBin(numB, 8);

    // Códigos de operación
    // 0001 = LOAD
    // 0000 = ADD | 0010 = SUB | 0011 = MUL | 0100 = DIV
    const opCodeLoad = '0001';
    let opCodeMath = '0000';
    if (op === 'SUB') opCodeMath = '0010';
    if (op === 'MUL') opCodeMath = '0011';
    if (op === 'DIV') opCodeMath = '0100';

    const addrValA = '0100';
    const addrValB = '0101';

    this.memory['0000'] = opCodeLoad + addrValA;
    this.memory['0001'] = opCodeMath + addrValB;
    this.memory['0100'] = binA;
    this.memory['0101'] = binB;

    this.renderMemoryTable();

    this.stepsSequence = this.generateDetailedSteps(op, numA, numB, binA, binB, opCodeMath, addrValA, addrValB);

    this.reset();
    this.dom.btnNext.disabled = false;
    this.dom.btnAuto.disabled = false;

    const opSymbols = { ADD: '+', SUB: '-', MUL: '×', DIV: '÷' };
    this.dom.descPanel.innerHTML = `<span class="status-badge">Estado</span><p><b>Simulación lista:</b> ${numA} ${opSymbols[op]} ${numB}.<br>` +
      `Memoria configurada. Todos los registros inician en cero. Presiona "Siguiente Paso" para comenzar el ciclo de búsqueda (Fetch).</p>`;
  }

  generateDetailedSteps(op, numA, numB, binA, binB, opCodeMath, addrValA, addrValB) {
    let resultNum = 0;
    let opSymbol = '';

    switch (op) {
      case 'ADD':
        resultNum = numA + numB;
        opSymbol = 'SUMA (+)';
        break;
      case 'SUB':
        resultNum = numA - numB;
        opSymbol = 'RESTA (-)';
        break;
      case 'MUL':
        resultNum = numA * numB;
        opSymbol = 'MULTIPLICACIÓN (×)';
        break;
      case 'DIV':
        resultNum = Math.floor(numA / numB);
        opSymbol = 'DIVISIÓN ENT. (÷)';
        break;
    }

    const resultBin = toBin(resultNum, 8);
    const inst1Bin = '0001' + addrValA;
    const inst2Bin = opCodeMath + addrValB;

    return [
      // --- INSTRUCCIÓN 1: LOAD A ---
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 1: Dirección al MAR</b><br>" +
              "La UC lee la dirección actual del PC (<code>0000</code>) y la transmite al Registro de Direcciones (MAR).<br>" +
              "<i>Apunta a la primera celda de la memoria RAM.</i></p>",
        activeRegs: ['reg-pc', 'reg-rdir'],
        activePaths: ['path-pc-rdir'],
        vals: { rdir: '0000' }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 2: Incremento del PC</b><br>" +
              "El Contador de Programa (PC) se incrementa en 1, pasando a <code>0001</code>.<br>" +
              "<i>Prepara la dirección para la siguiente instrucción.</i></p>",
        activeRegs: ['reg-pc'],
        activePaths: [],
        vals: { pc: '0001' }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 3: Lectura de Instrucción a MBR</b><br>" +
              `La memoria RAM entrega el contenido de la celda <code>0000</code> (<code>${inst1Bin}</code>) al Registro de Datos (MBR).<br>` +
              "<i>Trae la instrucción desde la RAM hacia el bus de datos.</i></p>",
        activeRegs: ['reg-rdatos'],
        activePaths: ['path-rdir-mem', 'path-mem-rdatos'],
        activeMem: 'mem-0000',
        vals: { rdatos: inst1Bin }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 4: Transferencia del MBR al RI</b><br>" +
              `El dato del MBR (<code>${inst1Bin}</code>) se copia directamente al Registro de Instrucciones (RI).<br>` +
              "<i>Coloca el comando en el registro de control activo.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-ri'],
        activePaths: ['path-rdatos-rinst'],
        vals: { ri: inst1Bin }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 5: Decodificación</b><br>" +
              "El Decodificador evalúa los bits de código de operación (<code>0001</code>) e identifica: <b>CARGAR (LOAD)</b>.<br>" +
              "<i>Determina que debe leer un dato de la RAM y llevarlo al Acumulador.</i></p>",
        activeRegs: ['reg-ri', 'decodificador'],
        activePaths: ['path-rinst-deco'],
        vals: { deco: 'CARGAR' }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 6: Dirección del Valor A al MAR</b><br>" +
              `Se extrae el operando de la instrucción en el RI (<code>${addrValA}</code>) y se envía al MAR.<br>` +
              `<i>Señala la celda donde está guardado el Valor A (${numA}).</i></p>`,
        activeRegs: ['reg-ri', 'reg-rdir'],
        activePaths: ['path-rinst-rdir'],
        vals: { rdir: addrValA }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 7: Lectura del Valor A al MBR</b><br>" +
              `La celda de memoria <code>${addrValA}</code> entrega el Valor A (<code>${binA}</code>) al MBR.<br>` +
              "<i>Obtiene el dato numérico desde la RAM.</i></p>",
        activeRegs: ['reg-rdatos'],
        activePaths: ['path-rdir-mem', 'path-mem-rdatos'],
        activeMem: `mem-${addrValA}`,
        vals: { rdatos: binA }
      },
      {
        desc: "<span class='status-badge'>Instrucción 1/2: LOAD</span><p><b>Paso 8: Carga Inicial al Acumulador</b><br>" +
              `El Valor A (<code>${binA}</code>) presente en el MBR se guarda en el Acumulador.<br>` +
              "<i>El Acumulador abandona el cero y queda cargado con el primer operando.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-acum'],
        activePaths: ['path-rdatos-rentrada', 'path-alu-acum'],
        vals: { acum: binA }
      },

      // --- INSTRUCCIÓN 2: OPERACIÓN ---
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 9: Dirección de Instrucción 2 al MAR</b><br>" +
              "La UC lee la nueva dirección del PC (<code>0001</code>) y la envía al MAR.<br>" +
              "<i>Solicita la siguiente instrucción a la memoria.</i></p>",
        activeRegs: ['reg-pc', 'reg-rdir'],
        activePaths: ['path-pc-rdir'],
        vals: { rdir: '0001' }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 10: Lectura de Instrucción 2 al MBR</b><br>" +
              `La celda <code>0001</code> entrega la instrucción de operación (<code>${inst2Bin}</code>) al MBR.<br>` +
              "<i>Extrae la instrucción desde la RAM.</i></p>",
        activeRegs: ['reg-rdatos'],
        activePaths: ['path-rdir-mem', 'path-mem-rdatos'],
        activeMem: 'mem-0001',
        vals: { rdatos: inst2Bin }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 11: Transferencia de Instrucción 2 al RI</b><br>" +
              `La instrucción en el MBR (<code>${inst2Bin}</code>) pasa al Registro de Instrucciones (RI).<br>` +
              "<i>Almacena la nueva orden en la Unidad de Control.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-ri'],
        activePaths: ['path-rdatos-rinst'],
        vals: { ri: inst2Bin }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 12: Decodificación de Operación</b><br>" +
              `El Decodificador interpreta el código <code>${opCodeMath}</code> y establece: <b>${opSymbol}</b>.<br>` +
              "<i>Configura la ALU para la operación solicitada.</i></p>",
        activeRegs: ['reg-ri', 'decodificador'],
        activePaths: ['path-rinst-deco'],
        vals: { deco: opSymbol }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 13: Dirección del Valor B al MAR</b><br>" +
              `La dirección del operando B (<code>${addrValB}</code>) se transfiere desde el RI hacia el MAR.<br>` +
              "<i>Apunta a la ubicación del segundo dato numérico.</i></p>",
        activeRegs: ['reg-ri', 'reg-rdir'],
        activePaths: ['path-rinst-rdir'],
        vals: { rdir: addrValB }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 14: Lectura del Valor B al MBR</b><br>" +
              `La celda <code>${addrValB}</code> lee el Valor B (<code>${binB}</code>) y lo coloca en el MBR.<br>` +
              "<i>Trae el segundo operando desde la memoria RAM.</i></p>",
        activeRegs: ['reg-rdatos'],
        activePaths: ['path-rdir-mem', 'path-mem-rdatos'],
        activeMem: `mem-${addrValB}`,
        vals: { rdatos: binB }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 15: Transferencia a R. Entrada de la ALU</b><br>" +
              `El Valor B (<code>${binB}</code>) pasa del MBR al Registro de Entrada de la ALU.<br>` +
              "<i>Posiciona el dato en el terminal de entrada del circuito de cálculo.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-rentrada'],
        activePaths: ['path-rdatos-rentrada'],
        vals: { rentrada: binB }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 16: Ejecución del Cálculo en la ALU</b><br>" +
              `La ALU procesa la operación (${opSymbol}) entre el Acumulador (<code>${binA}</code>) y el R. Entrada (<code>${binB}</code>).<br>` +
              `<i>Realiza la operación aritmética a nivel circuital.</i></p>`,
        activeRegs: ['reg-acum', 'reg-rentrada'],
        activePaths: [],
        vals: {}
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 17: Escritura del Resultado al Acumulador</b><br>" +
              `El resultado del cálculo (<code>${resultBin}</code>) se transfiere al Acumulador.<br>` +
              "<i>El valor en el Acumulador se reemplaza por el resultado final.</i></p>",
        activeRegs: ['reg-acum'],
        activePaths: ['path-alu-acum'],
        vals: { acum: resultBin }
      },
      {
        desc: "<span class='status-badge'>Finalizado</span><p><b>Paso 18: Ciclo Completado</b><br>" +
              `Resultado final: <code>${resultBin}</code> (Decimal ${resultNum}).<br>` +
              "<i>El programa ha finalizado exitosamente todas sus instrucciones.</i></p>",
        activeRegs: ['reg-acum'],
        activePaths: [],
        vals: { acum: resultBin }
      }
    ];
  }

  updateView() {
    this.clearHighlights();

    if (this.currentStep === 0) return;

    const state = this.stepsSequence[this.currentStep - 1];

    this.dom.descPanel.innerHTML = state.desc;

    if (state.vals.pc !== undefined) this.dom.valPc.innerText = state.vals.pc;
    if (state.vals.ri !== undefined) this.dom.valRi.innerText = state.vals.ri;
    if (state.vals.rdir !== undefined) this.dom.valRdir.innerText = state.vals.rdir;
    if (state.vals.rdatos !== undefined) this.dom.valRdatos.innerText = state.vals.rdatos;
    if (state.vals.rentrada !== undefined) this.dom.valRentrada.innerText = state.vals.rentrada;
    if (state.vals.acum !== undefined) this.dom.valAcum.innerText = state.vals.acum;
    if (state.vals.deco !== undefined) this.dom.decodificador.innerText = state.vals.deco;

    state.activeRegs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    });

    if (state.activeMem) {
      const memRow = document.getElementById(state.activeMem);
      if (memRow) memRow.classList.add('active-row');
    }

    state.activePaths.forEach(id => {
      const path = document.getElementById(id);
      if (path) {
        path.classList.add('active-path');
        path.setAttribute('marker-end', 'url(#arrow-active)');
      }
    });
  }

  clearHighlights() {
    document.querySelectorAll('.component').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('tr').forEach(el => el.classList.remove('active-row'));
    document.querySelectorAll('path').forEach(path => {
      path.classList.remove('active-path');
      path.setAttribute('marker-end', 'url(#arrow)');
    });
  }

  nextStep() {
    if (this.currentStep < this.stepsSequence.length) {
      this.currentStep++;
      this.updateView();
    } else if (this.autoInterval) {
      this.toggleAuto();
    }
  }

  reset() {
    if (this.autoInterval) this.toggleAuto();
    this.currentStep = 0;
    this.dom.valPc.innerText = '0000';
    this.dom.valRi.innerText = '00000000';
    this.dom.valRdir.innerText = '0000';
    this.dom.valRdatos.innerText = '00000000';
    this.dom.valRentrada.innerText = '00000000';
    this.dom.valAcum.innerText = '00000000';
    this.dom.decodificador.innerText = 'Decodificador';

    this.dom.descPanel.innerHTML = '<span class="status-badge">Estado</span>' +
      '<p>Ingresa los valores numéricos y presiona <b>"Cargar y Calcular"</b> para inicializar el ciclo de instrucción en la memoria.</p>';

    this.clearHighlights();
  }

  toggleAuto() {
    if (this.autoInterval) {
      clearInterval(this.autoInterval);
      this.autoInterval = null;
      this.dom.btnAuto.innerText = 'Reproducir Auto';
    } else {
      this.dom.btnAuto.innerText = 'Pausar';
      this.autoInterval = setInterval(() => {
        if (this.currentStep < this.stepsSequence.length) {
          this.nextStep();
        } else {
          this.toggleAuto();
        }
      }, 2500);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.simulator = new VonNeumannSimulator();
});