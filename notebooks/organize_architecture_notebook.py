#!/usr/bin/env python3
"""Reorganize the live Arquitectura de Computadores Colab by study topic.

The transformation is intentionally source-faithful: it reuses the current
notebook cells, images, metadata, exercises, and Python code, while replacing
chronological wrapper headings with a thematic reading order.  Only Python's
standard library is required so the script can be rerun in the repository.
"""

from __future__ import annotations

import argparse
import contextlib
import copy
import hashlib
import io
import json
import re
import sys
import traceback
from pathlib import Path
from typing import Any, Iterable


DRIVE_ID = "1gz-wH5AmnTXY7kQqt-V6zagr-g8q5ouf"
LIVE_COLAB_URL = f"https://colab.research.google.com/drive/{DRIVE_ID}"
ORIGINAL_REFERENCE_URL = (
    "https://colab.research.google.com/drive/"
    "1f1xb5ApauaPOw0J-VMbmbkwnO_lGS2VB#scrollTo=65d398d8"
)
TASK_URL = "https://udearroba.udea.edu.co/internos/mod/assign/view.php?id=2798250"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--source-modified",
        default="2026-08-27T14:53:44.061Z",
        help="Drive modification timestamp of the downloaded source notebook.",
    )
    return parser.parse_args()


def text_of(cell: dict[str, Any]) -> str:
    source = cell.get("source", "")
    return "".join(source) if isinstance(source, list) else str(source)


def source_lines(text: str) -> list[str]:
    if not text:
        return []
    return text.splitlines(keepends=True)


def stable_id(key: str) -> str:
    return hashlib.sha1(f"organized-architecture:{key}".encode()).hexdigest()[:12]


def markdown_cell(key: str, text: str) -> dict[str, Any]:
    cell_id = stable_id(key)
    clean = text.strip() + "\n"
    return {
        "cell_type": "markdown",
        "id": cell_id,
        "metadata": {"id": cell_id, "organized_section": key},
        "source": source_lines(clean),
    }


def clone_cell(
    source_cells: list[dict[str, Any]],
    index: int,
    *,
    formatter: str = "notes",
    remove_first_heading: bool = False,
    remove_trailing_huffman_heading: bool = False,
) -> dict[str, Any]:
    cell = copy.deepcopy(source_cells[index])
    if cell.get("cell_type") != "markdown":
        return cell

    text = text_of(cell)
    if remove_trailing_huffman_heading:
        text = re.sub(r"\n###\s+Algoritmo de Huffman\s*$", "", text)
    if remove_first_heading:
        text = re.sub(r"\A\s*#{1,6}\s+[^\n]+\n?", "", text, count=1)

    if formatter == "notes":
        # Under a thematic ## module, source h4-h6 headings become h3-h5.
        text = re.sub(
            r"(?m)^(#{4,6})(\s+)",
            lambda match: "#" * (len(match.group(1)) - 1) + match.group(2),
            text,
        )
    elif formatter == "visual":
        # Keep individual gate-image titles at h4 so the TOC stays compact.
        pass
    elif formatter == "executable":
        # Executable companions formerly used h1/h2 as standalone sections.
        text = re.sub(r"(?m)^##(\s+)", r"###\1", text)
        text = re.sub(r"(?m)^#(\s+)", r"###\1", text)
    elif formatter != "none":
        raise ValueError(f"Unknown formatter: {formatter}")

    replacements = {
        "#### Numeros Negativos en Binario": "### Números negativos en binario",
        "### Numeros Negativos en Binario": "### Números negativos en binario",
        "#### Algebra Booleana": "### Álgebra booleana",
        "### Algebra Booleana": "### Álgebra booleana",
        "#### Identificacion de mi resistencias:": "### Identificación de mis resistencias",
        "##### Identificacion de mi resistencias:": "#### Identificación de mis resistencias",
        "### Identificacion de mi resistencias:": "### Identificación de mis resistencias",
        "#### EJERCICIO": "### Ejercicio",
        "### Operaciones Binarias": "### Operaciones binarias",
        "Representacion de Datos y Algebra Booleana": "**Contexto:** representación de datos y álgebra booleana.",
        "Codificar:reemplazas": "Codificar: reemplazas",
        "El\n\n**formato de coma flotante binario**\n\npermite": "El **formato de coma flotante binario** permite",
        "El estándar\n\n**IEEE 754**\n\ndefine": "El estándar **IEEE 754** define",
        "**signo**\n\n,\n\n**exponente**\n\ny\n\n**fracción**\n\no\n\n**mantisa**\n\n.": "**signo**, **exponente** y **fracción** o **mantisa**.",
        "El\n\n**código BCD**\n\n(\n\n*Binary-Coded Decimal*\n\n, o decimal codificado en binario) representa cada\n\n**dígito decimal**\n\nde forma independiente": "El **código BCD** (*Binary-Coded Decimal*, o decimal codificado en binario) representa cada **dígito decimal** de forma independiente",
    }
    for before, after in replacements.items():
        text = text.replace(before, after)

    cell["source"] = source_lines(text.rstrip() + "\n")
    metadata = cell.setdefault("metadata", {})
    metadata["organized_from_cell_index"] = index
    return cell


def extend_clones(
    output: list[dict[str, Any]],
    source_cells: list[dict[str, Any]],
    indices: Iterable[int],
    *,
    formatter: str = "notes",
) -> None:
    output.extend(clone_cell(source_cells, index, formatter=formatter) for index in indices)


def module_intro(number: int, title: str, objective: str, includes: str) -> dict[str, Any]:
    return markdown_cell(
        f"module-{number}",
        f"""## {number}. {title}

<div style="border-left: 4px solid #0f766e; background: #f0fdfa; padding: 12px 16px; margin: 8px 0 18px 0; border-radius: 4px;">
  <strong>Objetivo</strong><br>{objective}<br><br>
  <strong>Incluye</strong><br>{includes}
</div>""",
    )


def execute_code_cells(cells: list[dict[str, Any]]) -> list[str]:
    """Execute the notebook's print-based Python cells in one shared namespace."""

    namespace: dict[str, Any] = {"__name__": "__main__"}
    errors: list[str] = []
    execution_count = 0

    for notebook_index, cell in enumerate(cells):
        if cell.get("cell_type") != "code":
            continue
        execution_count += 1
        code = text_of(cell)
        cell["execution_count"] = execution_count
        cell["outputs"] = []
        stdout = io.StringIO()
        stderr = io.StringIO()
        try:
            compiled = compile(code, f"<organized-cell-{notebook_index}>", "exec")
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                exec(compiled, namespace)
        except Exception as exc:  # pragma: no cover - surfaced in CLI validation
            error = traceback.format_exc()
            errors.append(f"cell {notebook_index}: {exc}\n{error}")
            cell["outputs"].append(
                {
                    "ename": type(exc).__name__,
                    "evalue": str(exc),
                    "output_type": "error",
                    "traceback": error.splitlines(),
                }
            )
            continue

        if stdout.getvalue():
            cell["outputs"].append(
                {
                    "name": "stdout",
                    "output_type": "stream",
                    "text": source_lines(stdout.getvalue()),
                }
            )
        if stderr.getvalue():
            cell["outputs"].append(
                {
                    "name": "stderr",
                    "output_type": "stream",
                    "text": source_lines(stderr.getvalue()),
                }
            )

    return errors


def validate_notebook(
    notebook: dict[str, Any], source_notebook: dict[str, Any]
) -> dict[str, int]:
    cells = notebook.get("cells")
    if not isinstance(cells, list) or not cells:
        raise ValueError("Notebook must contain cells")
    if notebook.get("nbformat") != 4:
        raise ValueError("Only nbformat 4 is supported")

    ids: list[str] = []
    code_count = 0
    error_outputs = 0
    executed_code = 0
    for index, cell in enumerate(cells):
        if cell.get("cell_type") not in {"markdown", "code", "raw"}:
            raise ValueError(f"Invalid cell type at {index}: {cell.get('cell_type')}")
        cell_id = cell.get("id") or cell.get("metadata", {}).get("id")
        if not cell_id:
            raise ValueError(f"Missing cell id at {index}")
        ids.append(cell_id)
        if cell.get("cell_type") == "code":
            code_count += 1
            if cell.get("execution_count") is not None:
                executed_code += 1
            error_outputs += sum(
                output.get("output_type") == "error" for output in cell.get("outputs", [])
            )

    if len(ids) != len(set(ids)):
        raise ValueError("Cell ids are not unique")

    source_blob = json.dumps(source_notebook, ensure_ascii=False)
    output_blob = json.dumps(notebook, ensure_ascii=False)
    source_images = source_blob.count("data:image/")
    output_images = output_blob.count("data:image/")
    if source_images != output_images:
        raise ValueError(
            f"Embedded image mismatch: source={source_images}, output={output_images}"
        )
    if code_count != executed_code:
        raise ValueError(f"Not all code cells executed: {executed_code}/{code_count}")
    if error_outputs:
        raise ValueError(f"Notebook has {error_outputs} error output(s)")

    required_titles = [
        "## 1. Sistemas de numeración y representación de datos",
        "## 2. Codificación de Huffman",
        "## 3. Enteros con signo, IEEE 754 y BCD",
        "## 4. Electrónica básica y análisis de circuitos",
        "## 5. Compuertas lógicas y álgebra booleana",
        "## 6. Práctica, repaso y pendientes",
        "## 7. Procedencia y trazabilidad",
    ]
    all_markdown = "\n".join(
        text_of(cell) for cell in cells if cell.get("cell_type") == "markdown"
    )
    missing = [title for title in required_titles if title not in all_markdown]
    if missing:
        raise ValueError(f"Missing thematic sections: {missing}")

    return {
        "cells": len(cells),
        "code_cells": code_count,
        "executed_code_cells": executed_code,
        "error_outputs": error_outputs,
        "embedded_images": output_images,
    }


def build_notebook(source_notebook: dict[str, Any], source_modified: str) -> dict[str, Any]:
    source_cells = source_notebook["cells"]
    if len(source_cells) != 96:
        raise ValueError(
            "Expected the downloaded Drive revision to contain 96 cells; "
            f"found {len(source_cells)}. Re-audit the index map before transforming."
        )

    cells: list[dict[str, Any]] = []
    cells.append(
        markdown_cell(
            "cover",
            """# Arquitectura de Computadores

### Cuaderno integral de teoría, ejercicios y laboratorios

> **Propósito.** Reunir los apuntes de clase en una ruta de estudio temática, clara y ejecutable. El contenido original, las imágenes y los ejercicios se conservan; cambia la organización para facilitar el repaso.

**Convenciones**

| Marca | Significado |
|---|---|
| 📘 | Concepto o explicación |
| 🧮 | Ejemplo o procedimiento resuelto |
| 🧪 | Celda de Python que se puede volver a ejecutar |
| ✅ | Comprobación o criterio de autoevaluación |""",
        )
    )
    cells.append(
        markdown_cell(
            "route",
            """## Ruta del cuaderno

| Módulo | Tema central | Resultado esperado |
|---:|---|---|
| 1 | Sistemas numéricos y representación | Convertir entre bases y operar en binario |
| 2 | Huffman | Construir, codificar y validar un código prefijo |
| 3 | C2, IEEE 754 y BCD | Representar enteros, reales y dígitos decimales |
| 4 | Electrónica y circuitos | Aplicar Ley de Ohm, serie, paralelo y medición |
| 5 | Lógica booleana | Leer compuertas, tablas de verdad y simplificaciones |
| 6 | Práctica y pendientes | Repasar, resolver ejercicios y consultar la tarea |
| 7 | Procedencia | Rastrear cada tema a la clase original |

> Abre la **Tabla de contenido** de Colab para saltar entre módulos. Para verificar todo el material práctico, usa **Entorno de ejecución → Ejecutar todas**.""",
        )
    )
    cells.append(
        markdown_cell(
            "how-to",
            """### Cómo estudiar con este notebook

1. Lee primero el objetivo de cada módulo.
2. Recorre la teoría y reproduce a mano los ejemplos señalados.
3. Ejecuta las celdas de Python para comprobar conversiones, tablas y cálculos.
4. Compara cada salida con tu procedimiento manual.
5. Cierra el tema usando la lista de control del módulo 6.

Las celdas ejecutables complementan los apuntes: no sustituyen el desarrollo manual que exige el curso.""",
        )
    )

    # Module 1: systems, ASCII, and binary arithmetic.
    cells.append(
        module_intro(
            1,
            "Sistemas de numeración y representación de datos",
            "Comprender cómo se representan datos en distintas bases y cómo se realizan conversiones y operaciones binarias.",
            "Sistemas posicionales, decimal/binario/octal/hexadecimal, ASCII, suma, resta y multiplicación binaria.",
        )
    )
    cells.append(clone_cell(source_cells, 65, formatter="executable", remove_first_heading=True))
    extend_clones(cells, source_cells, [3, 4, 5, 6, 7, 8, 9])
    cells.append(
        clone_cell(
            source_cells,
            10,
            formatter="notes",
            remove_trailing_huffman_heading=True,
        )
    )
    cells.append(markdown_cell("module-1-python", "### 🧪 Conversión y aritmética reproducible"))
    cells.append(clone_cell(source_cells, 66, formatter="none"))
    cells.append(clone_cell(source_cells, 67, formatter="executable"))
    cells.append(clone_cell(source_cells, 68, formatter="none"))

    # Module 2: Huffman theory and runnable implementation.
    cells.append(
        module_intro(
            2,
            "Codificación de Huffman",
            "Construir un árbol de Huffman con una regla de desempate explícita y verificar que la codificación se decodifica sin pérdida.",
            "Frecuencias, cola de prioridad, árbol, código prefijo, ejercicio completo, calculadora y métricas de compresión.",
        )
    )
    cells.append(clone_cell(source_cells, 59, formatter="executable", remove_first_heading=True))
    extend_clones(cells, source_cells, [11, 12, 13, 14, 15, 16])
    cells.append(
        markdown_cell(
            "module-2-assignment",
            f"""### Consigna original de la tarea

- Trabajar **sin contar tildes**.
- Usar **orden alfabético** como criterio documentado de desempate.
- Mantener un único enlace de Colab e ir actualizándolo.
- La primera entrega pedía completar sólo las dos primeras secciones.

[Abrir la tarea del curso]({TASK_URL})""",
        )
    )
    cells.append(markdown_cell("module-2-python", "### 🧪 Implementación reproducible"))
    cells.append(clone_cell(source_cells, 60, formatter="none"))
    cells.append(clone_cell(source_cells, 61, formatter="none"))
    cells.append(clone_cell(source_cells, 62, formatter="none"))
    cells.append(clone_cell(source_cells, 63, formatter="none"))
    cells.append(clone_cell(source_cells, 82, formatter="executable", remove_first_heading=True))
    cells.append(clone_cell(source_cells, 83, formatter="none"))
    cells.append(clone_cell(source_cells, 64, formatter="none"))

    # Module 3: signed numbers, floating point, and BCD.
    cells.append(
        module_intro(
            3,
            "Enteros con signo, IEEE 754 y BCD",
            "Distinguir representaciones binarias según el tipo de dato y reconocer sus límites, sesgos y patrones inválidos.",
            "Signo-magnitud, C1, C2, IEEE 754 de 32 bits, BCD 8421 y display de siete segmentos.",
        )
    )
    extend_clones(cells, source_cells, [19, 20, 21])
    cells.append(clone_cell(source_cells, 69, formatter="executable", remove_first_heading=True))
    cells.append(clone_cell(source_cells, 70, formatter="none"))
    extend_clones(cells, source_cells, [22, 23, 24])
    cells.append(clone_cell(source_cells, 71, formatter="executable", remove_first_heading=True))
    cells.append(clone_cell(source_cells, 72, formatter="none"))
    cells.append(clone_cell(source_cells, 73, formatter="executable"))
    cells.append(clone_cell(source_cells, 25, formatter="notes"))
    cells.append(clone_cell(source_cells, 74, formatter="none"))
    cells.append(clone_cell(source_cells, 84, formatter="executable"))
    cells.append(clone_cell(source_cells, 85, formatter="none"))

    # Module 4: electronics and electrical-circuit calculations.
    cells.append(
        module_intro(
            4,
            "Electrónica básica y análisis de circuitos",
            "Relacionar el diseño físico del laboratorio con los cálculos eléctricos y con una medición segura.",
            "Protoboard, resistencias, LEDs, multímetro, Ley de Ohm, circuitos en serie/paralelo y potencia.",
        )
    )
    extend_clones(cells, source_cells, range(29, 41))
    cells.append(markdown_cell("module-4-python", "### 🧪 Verificación de circuitos con Python"))
    cells.append(clone_cell(source_cells, 75, formatter="executable", remove_first_heading=True))
    cells.append(clone_cell(source_cells, 76, formatter="none"))
    cells.append(clone_cell(source_cells, 86, formatter="executable"))
    cells.append(clone_cell(source_cells, 87, formatter="none"))

    # Module 5: gates, imagery, Boolean laws, and complete validations.
    cells.append(
        module_intro(
            5,
            "Compuertas lógicas y álgebra booleana",
            "Pasar con fluidez entre símbolo, tabla de verdad, expresión booleana, simplificación y aplicación.",
            "BUFFER, NOT, AND, OR, NAND, NOR, XOR, XNOR, leyes, universalidad y ejercicios de tres variables.",
        )
    )
    cells.append(markdown_cell("module-5-foundations", "### 5.1 Fundamentos y tablas de verdad"))
    cells.append(clone_cell(source_cells, 77, formatter="executable", remove_first_heading=True))
    extend_clones(cells, source_cells, [44, 45])
    cells.append(clone_cell(source_cells, 78, formatter="none"))
    cells.append(clone_cell(source_cells, 88, formatter="executable", remove_first_heading=True))
    cells.append(clone_cell(source_cells, 89, formatter="none"))
    cells.append(markdown_cell("module-5-visuals", "### 5.2 Catálogo visual de compuertas"))
    extend_clones(cells, source_cells, range(46, 55), formatter="visual")
    cells.append(markdown_cell("module-5-algebra", "### 5.3 Leyes y simplificación booleana"))
    cells.append(clone_cell(source_cells, 55, formatter="notes"))
    cells.append(clone_cell(source_cells, 57, formatter="notes"))
    cells.append(clone_cell(source_cells, 79, formatter="executable"))
    cells.append(clone_cell(source_cells, 80, formatter="none"))
    cells.append(clone_cell(source_cells, 90, formatter="executable"))
    cells.append(clone_cell(source_cells, 91, formatter="none"))
    cells.append(clone_cell(source_cells, 92, formatter="executable"))
    cells.append(clone_cell(source_cells, 93, formatter="none"))
    cells.append(clone_cell(source_cells, 94, formatter="executable"))
    cells.append(clone_cell(source_cells, 95, formatter="none"))

    # Practice and handoff.
    cells.append(
        module_intro(
            6,
            "Práctica, repaso y pendientes",
            "Cerrar el estudio con ejercicios concretos y una lista de control verificable.",
            "Aplicaciones, ejercicios integradores, autoevaluación y acceso a la tarea vigente.",
        )
    )
    cells.append(clone_cell(source_cells, 81, formatter="executable"))
    cells.append(
        markdown_cell(
            "module-6-task",
            f"""### Pendiente del curso

[Abrir la actividad en Ude@]({TASK_URL})

**Registro de la nota fuente**

- Fuente: `Tarea.html` (exportación de Evernote).
- Creada: 19 de agosto de 2026, 14:07 UTC.
- Última actualización exportada: 19 de agosto de 2026, 14:14 UTC.

> Antes de entregar, ejecuta todo el notebook y confirma que no haya celdas con error.""",
        )
    )

    # Provenance: chronological information remains accessible without driving the flow.
    cells.append(
        markdown_cell(
            "provenance",
            f"""## 7. Procedencia y trazabilidad

La organización principal es temática. Esta tabla conserva la relación con las notas cronológicas originales.

| Nota / fecha | Contenido trasladado |
|---|---|
| Clase 12 de agosto de 2026 | Sistemas numéricos, ASCII, operaciones binarias y Huffman |
| Clase 19 de agosto de 2026 | Enteros negativos, IEEE 754 y BCD |
| Clase 20 de agosto de 2026 | Electrónica básica, laboratorio y análisis de circuitos |
| Clase 26 de agosto de 2026 | Compuertas lógicas y álgebra booleana |
| Tarea, 19 de agosto de 2026 | Consigna de Huffman y enlace de la actividad |

**Enlaces conservados**

- [Notebook actual en Colab]({LIVE_COLAB_URL})
- [Referencia de Colab incluida en la nota del 12 de agosto]({ORIGINAL_REFERENCE_URL})

**Criterio editorial:** se reordenaron celdas, se normalizó la jerarquía de títulos y se acercaron las verificaciones de Python a la teoría correspondiente. No se eliminaron imágenes, ejercicios ni cálculos sustantivos de la revisión descargada.""",
        )
    )

    notebook = copy.deepcopy(source_notebook)
    notebook["cells"] = cells
    metadata = notebook.setdefault("metadata", {})
    colab_metadata = metadata.setdefault("colab", {})
    colab_metadata["toc_visible"] = True
    metadata["organization"] = {
        "version": 1,
        "strategy": "thematic-study-flow",
        "source_drive_id": DRIVE_ID,
        "source_modified_time": source_modified,
        "source_cell_count": len(source_cells),
        "replaced_wrapper_indices": [0, 1, 2, 17, 18, 26, 27, 28, 41, 42, 43, 56, 58],
        "module_order": [
            "Sistemas de numeración y representación de datos",
            "Codificación de Huffman",
            "Enteros con signo, IEEE 754 y BCD",
            "Electrónica básica y análisis de circuitos",
            "Compuertas lógicas y álgebra booleana",
            "Práctica, repaso y pendientes",
            "Procedencia y trazabilidad",
        ],
    }
    return notebook


def main() -> int:
    args = parse_args()
    source_notebook = json.loads(args.input.read_text(encoding="utf-8"))
    notebook = build_notebook(source_notebook, args.source_modified)
    execution_errors = execute_code_cells(notebook["cells"])
    if execution_errors:
        print("\n\n".join(execution_errors), file=sys.stderr)
        return 1

    stats = validate_notebook(notebook, source_notebook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(notebook, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(stats, ensure_ascii=False, sort_keys=True))
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
