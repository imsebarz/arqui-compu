const BYTE_MODULO = 256;

const normalizeByte = num => ((num % BYTE_MODULO) + BYTE_MODULO) % BYTE_MODULO;
const toBin = (num, bits = 8) => normalizeByte(num).toString(2).padStart(bits, '0').slice(-bits);

const parseInput = (inputStr, format) => {
  const cleanStr = inputStr.trim();
  const pattern = format === 'BIN' ? /^[01]{1,8}$/ : /^(?:0|[1-9]\d{0,2})$/;

  if (!pattern.test(cleanStr)) {
    const requirement = format === 'BIN'
      ? 'debe contener entre 1 y 8 bits (solo 0 y 1)'
      : 'debe ser un número entero entre 0 y 255';
    throw new Error(`El valor “${inputStr}” ${requirement}.`);
  }

  const parsed = parseInt(cleanStr, format === 'BIN' ? 2 : 10);
  if (parsed > 255) {
    throw new Error(`El valor “${inputStr}” debe estar entre 0 y 255.`);
  }
  return parsed;
};

const calculateResult = (operation, valueA, valueB) => {
  if (operation === 'DIV' && valueB === 0) {
    throw new Error('La división por cero no está permitida.');
  }

  const operations = {
    ADD: () => valueA + valueB,
    SUB: () => valueA - valueB,
    MUL: () => valueA * valueB,
    DIV: () => Math.floor(valueA / valueB)
  };
  const raw = operations[operation]();
  const byte = normalizeByte(raw);
  return { raw, byte, overflow: raw !== byte };
};

class VonNeumannSimulator {
  constructor() {
    this.memory = {};
    this.currentStep = 0;
    this.stepsSequence = [];
    this.autoInterval = null;

    this.dom = {
      formatSelect: document.getElementById('formatSelect'),
      form: document.getElementById('simulationForm'),
      appMain: document.getElementById('appMain'),
      sidebar: document.getElementById('configSidebar'),
      sidebarToggle: document.getElementById('sidebarToggle'),
      sidebarToggleLabel: document.getElementById('sidebarToggleLabel'),
      diagramScroll: document.querySelector('.diagram-scroll'),
      diagramContainer: document.getElementById('diagramContainer'),
      opSelect: document.getElementById('opSelect'),
      valA: document.getElementById('valA'),
      valB: document.getElementById('valB'),
      lblA: document.getElementById('lblA'),
      lblB: document.getElementById('lblB'),
      btnNext: document.getElementById('btnNext'),
      btnAuto: document.getElementById('btnAuto'),
      btnReset: document.getElementById('btnReset'),
      descPanel: document.getElementById('descPanel'),
      stepProgress: document.getElementById('stepProgress'),
      inputError: document.getElementById('inputError'),
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
    this.initializeLayout();
  }

  bindEvents() {
    this.dom.formatSelect.addEventListener('change', () => this.handleFormatChange());
    this.dom.form.addEventListener('submit', event => {
      event.preventDefault();
      this.setupSimulation();
    });
    this.dom.btnNext.addEventListener('click', () => this.nextStep());
    this.dom.btnAuto.addEventListener('click', () => this.toggleAuto());
    this.dom.btnReset.addEventListener('click', () => this.reset());
    this.dom.sidebarToggle.addEventListener('click', () => {
      const isCollapsed = this.dom.appMain.classList.contains('sidebar-collapsed');
      this.setSidebarCollapsed(!isCollapsed);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.dom.appMain.classList.contains('sidebar-collapsed')) {
        this.setSidebarCollapsed(true);
        this.dom.sidebarToggle.focus();
      }
    });
  }

  initializeLayout() {
    this.setSidebarCollapsed(window.matchMedia('(max-width: 960px)').matches, false);

    const scheduleFit = () => window.requestAnimationFrame(() => this.fitDiagram());
    if (typeof ResizeObserver !== 'undefined') {
      this.layoutObserver = new ResizeObserver(scheduleFit);
      this.layoutObserver.observe(this.dom.diagramScroll);
    } else {
      window.addEventListener('resize', scheduleFit);
    }
    scheduleFit();
  }

  setSidebarCollapsed(collapsed, animate = true) {
    if (!animate) this.dom.appMain.classList.add('layout-initializing');
    this.dom.appMain.classList.toggle('sidebar-collapsed', collapsed);
    this.dom.sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    this.dom.sidebarToggleLabel.textContent = collapsed ? 'Mostrar configuración' : 'Ocultar configuración';
    this.dom.sidebar.inert = collapsed;
    this.dom.sidebar.setAttribute('aria-hidden', String(collapsed));

    window.requestAnimationFrame(() => {
      this.fitDiagram();
      this.dom.appMain.classList.remove('layout-initializing');
    });
  }

  fitDiagram() {
    const width = Math.max(0, this.dom.diagramScroll.clientWidth - 8);
    const height = Math.max(0, this.dom.diagramScroll.clientHeight - 8);
    if (!width || !height) return;

    const minimumScale = window.innerWidth <= 960 ? 0.58 : 0.7;
    const scale = Math.max(minimumScale, Math.min(1, width / 1000, height / 680));
    this.dom.diagramContainer.style.zoom = scale.toFixed(3);
  }

  handleFormatChange() {
    const isBin = this.dom.formatSelect.value === 'BIN';
    const previousFormat = isBin ? 'DEC' : 'BIN';
    this.dom.lblA.innerText = isBin ? 'Valor A (Binario)' : 'Valor A (Decimal)';
    this.dom.lblB.innerText = isBin ? 'Valor B (Binario)' : 'Valor B (Decimal)';
    this.dom.valA.maxLength = isBin ? 8 : 3;
    this.dom.valB.maxLength = isBin ? 8 : 3;

    [this.dom.valA, this.dom.valB].forEach(input => {
      try {
        const value = parseInput(input.value, previousFormat);
        input.value = isBin ? toBin(value) : String(value);
      } catch {
        input.value = isBin ? '00000000' : '0';
      }
    });
    this.clearInputError();
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

  clearInputError() {
    this.dom.inputError.textContent = '';
    this.dom.valA.removeAttribute('aria-invalid');
    this.dom.valB.removeAttribute('aria-invalid');
  }

  showInputError(message) {
    this.dom.inputError.textContent = message;
    this.dom.valA.setAttribute('aria-invalid', 'true');
    this.dom.valB.setAttribute('aria-invalid', 'true');
    this.dom.valA.focus();
  }

  setupSimulation() {
    const format = this.dom.formatSelect.value;
    const op = this.dom.opSelect.value;

    let numA, numB;
    try {
      numA = parseInput(this.dom.valA.value, format);
      numB = parseInput(this.dom.valB.value, format);
      calculateResult(op, numA, numB);
    } catch (err) {
      this.showInputError(err.message);
      return;
    }
    this.clearInputError();

    const binA = toBin(numA, 8);
    const binB = toBin(numB, 8);

    // Códigos de operación
    // ISA: 1000 = LOAD; 0000 = ADD; 0001 = SUB.
    // 0010 = MUL y 0011 = DIV son extensiones de esta calculadora.
    const opCodeLoad = '1000';
    let opCodeMath = '0000';
    if (op === 'SUB') opCodeMath = '0001';
    if (op === 'MUL') opCodeMath = '0010';
    if (op === 'DIV') opCodeMath = '0011';

    const addrValA = '0100';
    const addrValB = '0101';

    this.memory['0000'] = opCodeLoad + addrValA;
    this.memory['0001'] = opCodeMath + addrValB;
    this.memory['0100'] = binA;
    this.memory['0101'] = binB;

    this.renderMemoryTable();

    this.stepsSequence = this.generateDetailedSteps(op, numA, numB, binA, binB, opCodeLoad, opCodeMath, addrValA, addrValB);

    this.reset();

    const opSymbols = { ADD: '+', SUB: '-', MUL: '×', DIV: '÷' };
    this.dom.descPanel.innerHTML = `<span class="status-badge">Estado</span><p><b>Simulación lista:</b> ${numA} ${opSymbols[op]} ${numB}.<br>` +
      `Memoria configurada. Todos los registros inician en cero. Presiona "Siguiente Paso" para comenzar el ciclo de búsqueda (Fetch).</p>`;
    this.restartAnimation(this.dom.descPanel, 'step-enter');
    if (window.innerWidth <= 960) this.setSidebarCollapsed(true);
  }

  generateDetailedSteps(op, numA, numB, binA, binB, opCodeLoad, opCodeMath, addrValA, addrValB) {
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

    const result = calculateResult(op, numA, numB);
    resultNum = result.raw;
    const resultBin = toBin(result.byte, 8);
    const overflowNote = result.overflow
      ? `<br><strong>Desbordamiento de 8 bits:</strong> ${resultNum} se almacena como ${result.byte} (módulo 256).`
      : '';
    const inst1Bin = opCodeLoad + addrValA;
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
              `El Decodificador evalúa los bits de código de operación (<code>${opCodeLoad}</code>) e identifica: <b>CARGAR (LOAD)</b>.<br>` +
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
              `El Valor A (<code>${binA}</code>) pasa por el registro de entrada y la ALU hasta el Acumulador.<br>` +
              "<i>El Acumulador abandona el cero y queda cargado con el primer operando.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-rentrada', 'reg-acum'],
        activePaths: ['path-rdatos-rentrada', 'path-alu-acum'],
        vals: { rentrada: binA, acum: binA }
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
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 10: Incremento del PC</b><br>" +
              "El Contador de Programa (PC) se incrementa a <code>0010</code> después de direccionar la segunda instrucción.<br>" +
              "<i>El PC queda listo para buscar la siguiente instrucción del programa.</i></p>",
        activeRegs: ['reg-pc'],
        activePaths: [],
        vals: { pc: '0010' }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 11: Lectura de Instrucción 2 al MBR</b><br>" +
              `La celda <code>0001</code> entrega la instrucción de operación (<code>${inst2Bin}</code>) al MBR.<br>` +
              "<i>Extrae la instrucción desde la RAM.</i></p>",
        activeRegs: ['reg-rdatos'],
        activePaths: ['path-rdir-mem', 'path-mem-rdatos'],
        activeMem: 'mem-0001',
        vals: { rdatos: inst2Bin }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 12: Transferencia de Instrucción 2 al RI</b><br>" +
              `La instrucción en el MBR (<code>${inst2Bin}</code>) pasa al Registro de Instrucciones (RI).<br>` +
              "<i>Almacena la nueva orden en la Unidad de Control.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-ri'],
        activePaths: ['path-rdatos-rinst'],
        vals: { ri: inst2Bin }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 13: Decodificación de Operación</b><br>" +
              `El Decodificador interpreta el código <code>${opCodeMath}</code> y establece: <b>${opSymbol}</b>.<br>` +
              "<i>Configura la ALU para la operación solicitada.</i></p>",
        activeRegs: ['reg-ri', 'decodificador'],
        activePaths: ['path-rinst-deco'],
        vals: { deco: opSymbol }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 14: Dirección del Valor B al MAR</b><br>" +
              `La dirección del operando B (<code>${addrValB}</code>) se transfiere desde el RI hacia el MAR.<br>` +
              "<i>Apunta a la ubicación del segundo dato numérico.</i></p>",
        activeRegs: ['reg-ri', 'reg-rdir'],
        activePaths: ['path-rinst-rdir'],
        vals: { rdir: addrValB }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 15: Lectura del Valor B al MBR</b><br>" +
              `La celda <code>${addrValB}</code> lee el Valor B (<code>${binB}</code>) y lo coloca en el MBR.<br>` +
              "<i>Trae el segundo operando desde la memoria RAM.</i></p>",
        activeRegs: ['reg-rdatos'],
        activePaths: ['path-rdir-mem', 'path-mem-rdatos'],
        activeMem: `mem-${addrValB}`,
        vals: { rdatos: binB }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 16: Transferencia a R. Entrada de la ALU</b><br>" +
              `El Valor B (<code>${binB}</code>) pasa del MBR al Registro de Entrada de la ALU.<br>` +
              "<i>Posiciona el dato en el terminal de entrada del circuito de cálculo.</i></p>",
        activeRegs: ['reg-rdatos', 'reg-rentrada'],
        activePaths: ['path-rdatos-rentrada'],
        vals: { rentrada: binB }
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 17: Ejecución del Cálculo en la ALU</b><br>" +
              `La ALU procesa la operación (${opSymbol}) entre el Acumulador (<code>${binA}</code>) y el R. Entrada (<code>${binB}</code>).<br>` +
              `<i>Realiza la operación aritmética a nivel circuital.</i></p>`,
        activeRegs: ['reg-acum', 'reg-rentrada', 'alu-core'],
        activePaths: [],
        vals: {}
      },
      {
        desc: "<span class='status-badge'>Instrucción 2/2: OPERACIÓN</span><p><b>Paso 18: Escritura del Resultado al Acumulador</b><br>" +
              `El resultado del cálculo (<code>${resultBin}</code>) se transfiere al Acumulador.<br>` +
              "<i>El valor en el Acumulador se reemplaza por el resultado final.</i></p>",
        activeRegs: ['reg-acum'],
        activePaths: ['path-alu-acum'],
        vals: { acum: resultBin }
      },
      {
        desc: "<span class='status-badge'>Finalizado</span><p><b>Paso 19: Ciclo completado</b><br>" +
              `Resultado final en el acumulador: <code>${resultBin}</code> (Decimal ${result.byte}).${overflowNote}<br>` +
              "<i>El programa ha finalizado exitosamente todas sus instrucciones.</i></p>",
        activeRegs: ['reg-acum'],
        activePaths: [],
        vals: { acum: resultBin }
      }
    ];
  }

  updateView() {
    this.clearHighlights();

    if (this.currentStep === 0) {
      this.updateControls();
      return;
    }

    const state = this.stepsSequence[this.currentStep - 1];

    this.dom.descPanel.innerHTML = state.desc;
    this.restartAnimation(this.dom.descPanel, 'step-enter');

    if (state.vals.pc !== undefined) this.updateValue(this.dom.valPc, state.vals.pc);
    if (state.vals.ri !== undefined) this.updateValue(this.dom.valRi, state.vals.ri);
    if (state.vals.rdir !== undefined) this.updateValue(this.dom.valRdir, state.vals.rdir);
    if (state.vals.rdatos !== undefined) this.updateValue(this.dom.valRdatos, state.vals.rdatos);
    if (state.vals.rentrada !== undefined) this.updateValue(this.dom.valRentrada, state.vals.rentrada);
    if (state.vals.acum !== undefined) this.updateValue(this.dom.valAcum, state.vals.acum);
    if (state.vals.deco !== undefined) this.updateValue(this.dom.decodificador, state.vals.deco);

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
    this.updateControls();
  }

  restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  updateValue(element, value) {
    if (element.innerText === value) return;
    element.innerText = value;
    this.restartAnimation(element, 'value-updating');
  }

  updateControls() {
    const total = this.stepsSequence.length;
    this.dom.stepProgress.textContent = total ? `Paso ${this.currentStep} de ${total}` : 'Sin iniciar';
    this.dom.btnNext.disabled = !total || this.currentStep >= total || Boolean(this.autoInterval);
    this.dom.btnAuto.disabled = !total;
    this.dom.btnReset.disabled = !total || this.currentStep === 0;
  }

  clearHighlights() {
    document.querySelectorAll('.component').forEach(el => el.classList.remove('active'));
    this.dom.memTableBody.querySelectorAll('tr').forEach(el => el.classList.remove('active-row'));
    document.querySelectorAll('svg.connections > path').forEach(path => {
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

    this.dom.descPanel.innerHTML = this.stepsSequence.length
      ? '<p>La simulación volvió al estado inicial. Presiona <strong>“Siguiente paso”</strong> o inicia la reproducción automática.</p>'
      : '<p>Ingresa los valores numéricos y presiona <strong>“Cargar y calcular”</strong> para inicializar el ciclo de instrucción en la memoria.</p>';

    this.clearHighlights();
    this.updateControls();
  }

  toggleAuto() {
    if (this.autoInterval) {
      clearInterval(this.autoInterval);
      this.autoInterval = null;
      this.dom.btnAuto.innerText = 'Reproducción automática';
      this.dom.btnAuto.setAttribute('aria-pressed', 'false');
      this.updateControls();
    } else {
      if (this.currentStep >= this.stepsSequence.length) this.reset();
      this.dom.btnAuto.innerText = 'Pausar';
      this.dom.btnAuto.setAttribute('aria-pressed', 'true');
      this.autoInterval = setInterval(() => {
        if (this.currentStep < this.stepsSequence.length) {
          this.nextStep();
        } else {
          this.toggleAuto();
        }
      }, 2500);
      this.updateControls();
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new VonNeumannSimulator();
  });
}

if (typeof module !== 'undefined') {
  module.exports = { calculateResult, normalizeByte, parseInput, toBin };
}
