# Simulador de arquitectura Von Neumann

Calculadora educativa de 8 bits que muestra, paso a paso, cómo una CPU con arquitectura Von Neumann busca, decodifica y ejecuta instrucciones. La interfaz permite observar el PC, RI, MAR, MBR, registro de entrada, acumulador, memoria y buses activos durante cada ciclo.

## Demo

La versión publicada está disponible en [GitHub Pages](https://imsebarz.github.io/arqui-compu/).

## Funcionalidades

- Entrada decimal o binaria de hasta 8 bits.
- Suma, resta, multiplicación y división entera.
- Ejecución manual o reproducción automática de 19 pasos.
- Representación visual de los ciclos de búsqueda, decodificación y ejecución.
- Aritmética de 8 bits con explicación de desbordamiento módulo 256.
- Controles accesibles por teclado y layout adaptable con desplazamiento horizontal del diagrama en pantallas pequeñas.

## Formato de instrucción

Cada instrucción ocupa 8 bits: los primeros 4 identifican la operación y los últimos 4 indican una dirección de memoria.

| Código | Instrucción | Uso |
| --- | --- | --- |
| `0000` | ADD | Sumar el operando al acumulador |
| `0001` | SUB | Restar el operando al acumulador |
| `0010` | MUL | Multiplicar; extensión de la calculadora |
| `0011` | DIV | División entera; extensión de la calculadora |
| `0110` | STORE | Reservada para guardar en memoria |
| `0111` | HALT | Reservada para finalizar un programa |
| `1000` | LOAD | Cargar un dato en el acumulador |

La simulación actual carga dos instrucciones en `0000` y `0001`, y guarda los operandos en `0100` y `0101`. El resultado termina en el acumulador.

## Ejecutar localmente

No requiere instalación ni dependencias. Desde la raíz del repositorio:

```bash
python3 -m http.server 8000 --directory CalculadoraJs
```

Abre `http://localhost:8000` en el navegador.

## Pruebas

Con Node.js 18 o superior:

```bash
node --check CalculadoraJs/script.js
node --test CalculadoraJs/script.test.js
```

## Despliegue

El workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) valida el JavaScript y publica el contenido de `CalculadoraJs` en GitHub Pages después de cada cambio relevante enviado a `main`. El repositorio debe tener **Settings → Pages → Source** configurado como **GitHub Actions**.
