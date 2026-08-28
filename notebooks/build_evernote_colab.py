#!/usr/bin/env python3
"""Build the source-faithful Arquitectura de Computadores Colab from Evernote HTML exports."""

from __future__ import annotations

import base64
import contextlib
import copy
import hashlib
import io
import json
import re
import subprocess
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path

from lxml import html


WORKSPACE = Path("/Users/sebastian.ruiz/Dev/arqui-compu")
NOTES_DIR = Path("/Users/sebastian.ruiz/Downloads/My Notes")
ORIGINAL_NOTEBOOK = WORKSPACE / "notebooks/Arquitectura_de_Computadores_Cuaderno_Integral.drive-original.ipynb"
OUTPUT_NOTEBOOK = WORKSPACE / "notebooks/Arquitectura_de_Computadores_Cuaderno_Integral.ipynb"

NOTE_ORDER = [
    "Clase 12 Agosto 2026.html",
    "Clase 19 de Agosto.html",
    "Tarea.html",
    "Clase 20 de Agosto.html",
    "Clase 26 de Agosto.html",
]

AUDIO_BY_NOTE = {
    "Clase 12 Agosto 2026.html": [
        "Clase 12 Agosto 2026 files/8.12.2026, 8.01.14 AM.mp3",
        "Clase 12 Agosto 2026 files/8.12.2026, 10.01.17 AM.mp3",
    ],
    "Clase 19 de Agosto.html": [
        "Clase 19 de Agosto files/8.19.2026, 7.20.19 AM.mp3",
        "Clase 19 de Agosto files/8.19.2026, 10.06.33 AM.mp3",
    ],
    "Clase 20 de Agosto.html": [
        "Clase 20 de Agosto files/8.20.2026, 7.55.17 AM.mp3",
    ],
    "Clase 26 de Agosto.html": [
        "Clase 26 de Agosto files/8.26.2026, 8.29.35 AM.mp3",
    ],
}

IMAGE_INFO = {
    "Clase 12 Agosto 2026 files/image.png": ("clase12_tabla_ascii.png", "Tabla de caracteres del código ASCII"),
    "Clase 26 de Agosto files/image.png": ("clase26_buffer.png", "Símbolo original de la compuerta BUFFER"),
    "Clase 26 de Agosto files/image (1).png": ("clase26_not.png", "Símbolo original de la compuerta NOT"),
    "Clase 26 de Agosto files/image (2).png": ("clase26_and.png", "Símbolo original de la compuerta AND"),
    "Clase 26 de Agosto files/image (3).png": ("clase26_or.png", "Símbolo original de la compuerta OR"),
    "Clase 26 de Agosto files/image (4).png": ("clase26_nand.png", "Símbolo original de la compuerta NAND"),
    "Clase 26 de Agosto files/image (5).png": ("clase26_nor.png", "Símbolo original de la compuerta NOR"),
    "Clase 26 de Agosto files/image (6).png": ("clase26_xor.png", "Símbolo original de la compuerta XOR"),
    "Clase 26 de Agosto files/image (7).png": ("clase26_xnor.png", "Símbolo original de la compuerta XNOR"),
    "Clase 26 de Agosto files/Teoremas booleanos.png": ("clase26_teoremas_booleanos.png", "Teoremas booleanos y ejercicios de simplificación"),
}

BLOCK_TAGS = {
    "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "en-table",
    "en-codeblock", "en-callout", "en-mermaidblock", "en-formulablock", "hr", "blockquote",
}


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def as_lines(text: str) -> list[str]:
    if not text.endswith("\n"):
        text += "\n"
    return text.splitlines(keepends=True)


def markdown_cell(text: str, *, source_note: str | None = None, attachments: dict | None = None) -> dict:
    metadata = {"id": new_id()}
    if source_note:
        metadata["evernote_source"] = source_note
    cell = {
        "cell_type": "markdown",
        "metadata": metadata,
        "source": as_lines(text.strip() + "\n"),
        "id": metadata["id"],
    }
    if attachments:
        cell["attachments"] = attachments
    return cell


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def clean_root(note_path: Path):
    doc = html.parse(str(note_path)).getroot()
    roots = doc.xpath("//en-note")
    if not roots:
        raise ValueError(f"No en-note root in {note_path}")
    root = roots[0]
    for bad in root.xpath(".//icons|.//note-attributes|.//style|.//script|.//template|.//input|.//button"):
        bad.drop_tree()
    # Evernote exports UI icons and Mermaid preview SVGs. The underlying Mermaid source is retained separately.
    for svg in root.xpath(".//svg"):
        svg.drop_tree()
    return root


def direct_heading_text(el) -> tuple[str, str]:
    title_bits = [el.text or ""]
    remainder_bits: list[str] = []
    for child in el:
        if child.tag in BLOCK_TAGS:
            remainder_bits.append(element_to_markdown(child))
        else:
            remainder_bits.append(inline_to_markdown(child))
        if child.tail:
            remainder_bits.append(child.tail)
    return normalize_ws("".join(title_bits)), normalize_ws(" ".join(remainder_bits))


def inline_to_markdown(el) -> str:
    if not isinstance(el.tag, str):
        return ""
    tag = el.tag.lower()
    if tag in {"img", "svg", "input", "button"}:
        return ""
    if tag == "br":
        return "\n"
    inner = (el.text or "") + "".join(inline_to_markdown(c) + (c.tail or "") for c in el)
    inner = normalize_ws(inner) if "\n" not in inner else re.sub(r"[ \t]+", " ", inner)
    if not inner:
        return ""
    if tag in {"b", "strong"}:
        return f"**{inner}**"
    if tag in {"i", "em"}:
        return f"*{inner}*"
    if tag in {"code", "kbd"}:
        return f"`{inner}`"
    if tag == "a":
        href = el.get("href", "").strip()
        return f"[{inner}]({href})" if href else inner
    if tag == "sub":
        return f"<sub>{inner}</sub>"
    if tag == "sup":
        return f"<sup>{inner}</sup>"
    return inner


def list_to_markdown(el, level: int = 0) -> str:
    ordered = el.tag.lower() == "ol"
    rows: list[str] = []
    index = 1
    for li in el.xpath("./li"):
        inline_parts: list[str] = []
        nested: list = []
        if li.text:
            inline_parts.append(li.text)
        for child in li:
            if isinstance(child.tag, str) and child.tag.lower() in {"ul", "ol"}:
                nested.append(child)
            else:
                inline_parts.append(inline_to_markdown(child))
            if child.tail:
                inline_parts.append(child.tail)
        value = normalize_ws(" ".join(inline_parts))
        marker = f"{index}." if ordered else "-"
        rows.append(f"{'  ' * level}{marker} {value}")
        for child in nested:
            rows.append(list_to_markdown(child, level + 1))
        index += 1
    return "\n".join(rows)


def table_to_markdown(el) -> str:
    table = el if el.tag.lower() == "table" else (el.xpath(".//table")[0] if el.xpath(".//table") else el)
    rows: list[list[str]] = []
    for tr in table.xpath(".//tr"):
        cells = tr.xpath("./th|./td")
        if not cells:
            continue
        row = []
        for cell in cells:
            parts = [normalize_ws(t) for t in cell.itertext() if normalize_ws(t)]
            value = "<br>".join(parts)
            value = value.replace("|", "\\|")
            row.append(value or " ")
        rows.append(row)
    if not rows:
        return normalize_ws(" ".join(el.itertext()))
    width = max(len(r) for r in rows)
    rows = [r + [" "] * (width - len(r)) for r in rows]
    header = rows[0]
    body = rows[1:]
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in body)
    return "\n".join(lines)


def formula_to_markdown(el) -> str:
    annotations = el.xpath('.//annotation[@encoding="application/x-tex"]')
    if annotations:
        formula = normalize_ws("".join(annotations[0].itertext()))
        return f"$$\n{formula}\n$$"
    text = normalize_ws(" ".join(el.itertext()))
    return f"`{text}`" if text else ""


def element_to_markdown(el) -> str:
    if not isinstance(el.tag, str):
        return ""
    tag = el.tag.lower()
    if tag in {"meta", "img"}:
        return ""
    if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        title, remainder = direct_heading_text(el)
        # Each Evernote note already lives under an H2 notebook section.
        level = min(6, max(3, int(tag[1]) + 2))
        result = f"{'#' * level} {title}" if title else ""
        if remainder:
            result += f"\n\n{remainder}"
        return result
    if tag in {"ul", "ol"}:
        return list_to_markdown(el)
    if tag in {"table", "en-table"}:
        return table_to_markdown(el)
    if tag == "en-codeblock":
        text = "\n".join(normalize_ws(t) for t in el.itertext() if normalize_ws(t))
        text = re.sub(r"^(Auto|Bash|HTML, XML)\s*", "", text)
        return f"```text\n{text}\n```"
    if tag == "en-mermaidblock":
        text = "\n".join(t.strip() for t in el.itertext() if t.strip())
        return f"```mermaid\n{text}\n```"
    if tag == "en-formulablock":
        return formula_to_markdown(el)
    if tag in {"en-callout", "blockquote"}:
        content = normalize_ws(" ".join(el.itertext()))
        return "\n".join(f"> {line}" for line in content.splitlines())
    if tag == "hr":
        return "---"
    if tag == "li":
        return normalize_ws(" ".join(el.itertext()))
    if tag in {"div", "p", "span", "en-note"}:
        pieces: list[str] = []
        if el.text and normalize_ws(el.text):
            pieces.append(normalize_ws(el.text))
        for child in el:
            rendered = element_to_markdown(child) if isinstance(child.tag, str) and child.tag.lower() in BLOCK_TAGS else inline_to_markdown(child)
            if rendered:
                pieces.append(rendered)
            if child.tail and normalize_ws(child.tail):
                pieces.append(normalize_ws(child.tail))
        separator = "\n\n" if tag in {"div", "p", "en-note"} else " "
        return separator.join(pieces)
    return inline_to_markdown(el)


def image_cell(note_name: str, relative_src: str) -> dict:
    if relative_src not in IMAGE_INFO:
        raise KeyError(f"Unmapped image: {relative_src}")
    attachment_name, caption = IMAGE_INFO[relative_src]
    path = NOTES_DIR / relative_src
    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    # Colab does not resolve Jupyter's attachment: protocol reliably. A data URI
    # keeps the image inside the notebook and renders directly in Colab.
    text = f"#### {caption}\n\n![{caption}](data:image/png;base64,{encoded})\n\n*Imagen original exportada desde Evernote (`{attachment_name}`).*"
    return markdown_cell(text, source_note=note_name)


def audio_duration(path: Path) -> str:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True,
            text=True,
            capture_output=True,
        )
        seconds = round(float(proc.stdout.strip()))
        hours, rem = divmod(seconds, 3600)
        minutes, secs = divmod(rem, 60)
        return f"{hours:d}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:d}:{secs:02d}"
    except Exception:
        return "duración no verificada"


def note_header_cell(note_path: Path, root) -> dict:
    title = root.xpath('string(.//meta[@itemprop="title"]/@content)') or note_path.stem
    created = root.xpath('string(.//meta[@itemprop="created"]/@content)')
    updated = root.xpath('string(.//meta[@itemprop="updated"]/@content)')
    lines = [f"## {title}", "", f"**Fuente directa:** `{note_path.name}` (exportación HTML de Evernote)."]
    if created:
        dt = datetime.strptime(created, "%Y%m%dT%H%M%SZ")
        lines.append(f"**Creada en Evernote:** {dt:%Y-%m-%d %H:%M} UTC.")
    if updated:
        dt = datetime.strptime(updated, "%Y%m%dT%H%M%SZ")
        lines.append(f"**Última actualización exportada:** {dt:%Y-%m-%d %H:%M} UTC.")
    audio_files = AUDIO_BY_NOTE.get(note_path.name, [])
    if audio_files:
        lines.extend(["", "**Grabaciones originales asociadas (inventario; no incrustadas por tamaño y privacidad):**"])
        for relative in audio_files:
            path = NOTES_DIR / relative
            lines.append(f"- `{Path(relative).name}` — {audio_duration(path)}, {path.stat().st_size / (1024 * 1024):.1f} MB")
    return markdown_cell("\n".join(lines), source_note=note_path.name)


def split_markdown(text: str, max_chars: int = 14000) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) <= max_chars:
        return [text] if text else []
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for paragraph in paragraphs:
        if current and size + len(paragraph) + 2 > max_chars:
            chunks.append("\n\n".join(current))
            current = []
            size = 0
        current.append(paragraph)
        size += len(paragraph) + 2
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def cells_from_note(note_path: Path) -> tuple[list[dict], str]:
    root = clean_root(note_path)
    cells = [note_header_cell(note_path, root)]
    used_images: set[str] = set()
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        text = "\n\n".join(part for part in buffer if part.strip()).strip()
        for index, chunk in enumerate(split_markdown(text)):
            prefix = "" if index == 0 else "#### Continuación de la nota\n\n"
            cells.append(markdown_cell(prefix + chunk, source_note=note_path.name))
        buffer = []

    for child in root:
        if not isinstance(child.tag, str):
            continue
        tag = child.tag.lower()
        if tag == "meta" or "noteTitle" in (child.get("class") or ""):
            continue
        image_nodes = child.xpath(".//img") if tag != "img" else [child]
        rendered = element_to_markdown(child)
        if tag == "div" and child.get("data-type") == "en-audio":
            flush()
            audio_text = rendered.strip()
            if audio_text:
                for index, chunk in enumerate(split_markdown(audio_text, max_chars=12000)):
                    heading = "### Grabación y transcripción conservada desde Evernote" if index == 0 else "#### Continuación de la transcripción"
                    cells.append(markdown_cell(f"{heading}\n\n{chunk}", source_note=note_path.name))
            continue
        if rendered:
            buffer.append(rendered)
        if image_nodes:
            flush()
            for image in image_nodes:
                src = image.get("src", "")
                if src and not src.startswith("data:") and src not in used_images:
                    cells.append(image_cell(note_path.name, src))
                    used_images.add(src)
        if tag in {"h1", "h2", "hr"}:
            flush()
    flush()

    # Ensure every exported PNG belonging to the note is present even if Evernote nested it in a complex table.
    note_prefix = note_path.stem + " files/"
    for src in IMAGE_INFO:
        if src.startswith(note_prefix) and src not in used_images:
            cells.append(image_cell(note_path.name, src))
            used_images.add(src)

    source_text = normalize_ws(" ".join(root.itertext()))
    return cells, source_text


def execute_code_cells(cells: list[dict]) -> None:
    namespace: dict = {"__name__": "__main__"}
    count = 0
    for cell in cells:
        if cell.get("cell_type") != "code":
            continue
        count += 1
        source = "".join(cell.get("source", []))
        stdout = io.StringIO()
        stderr = io.StringIO()
        cell["execution_count"] = count
        cell["outputs"] = []
        try:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                exec(compile(source, f"<cell-{count}>", "exec"), namespace)
        except Exception as exc:
            cell["outputs"] = [{
                "output_type": "error",
                "ename": type(exc).__name__,
                "evalue": str(exc),
                "traceback": [],
            }]
            raise RuntimeError(f"Code cell {count} failed: {exc}") from exc
        if stdout.getvalue():
            cell["outputs"].append({"output_type": "stream", "name": "stdout", "text": as_lines(stdout.getvalue())})
        if stderr.getvalue():
            cell["outputs"].append({"output_type": "stream", "name": "stderr", "text": as_lines(stderr.getvalue())})
        cell["metadata"] = {k: v for k, v in cell.get("metadata", {}).items() if k != "executionInfo"}


def token_counter(text: str) -> Counter:
    return Counter(re.findall(r"[\wÁÉÍÓÚÜÑáéíóúüñ]+", text.lower()))


def main() -> None:
    original = json.loads(ORIGINAL_NOTEBOOK.read_text(encoding="utf-8"))
    cells: list[dict] = []
    cells.append(markdown_cell(
        """# Arquitectura de Computadores — cuaderno original de clase

Este cuaderno toma como **fuente directa** las exportaciones HTML de Evernote de las clases del 12, 19, 20 y 26 de agosto de 2026 y la nota `Tarea.html`. El texto, las transcripciones, las tablas, los ejercicios y las imágenes se conservan dentro del notebook para que el Colab funcione como el cuaderno principal donde se tomaron las notas.

## Organización

1. **Apuntes originales de Evernote**, en orden cronológico.
2. **Material ejecutable y verificaciones**, con calculadoras y comprobaciones en Python derivadas de esos apuntes.
3. **Registro de procedencia**, para auditar qué archivos fueron incorporados.

> Las grabaciones MP3 se inventarían por nombre, duración y tamaño, pero no se incrustan: juntas superan los 460 MB y contienen audio privado. Sus transcripciones exportadas sí se conservan íntegramente cuando Evernote las incluye."""
    ))
    cells.append(markdown_cell("# Parte I — Apuntes originales de Evernote\n\nEl contenido siguiente conserva el orden de cada exportación. Las instrucciones escritas dentro de `Tarea.html` son apuntes de la asignatura, no instrucciones para modificar este cuaderno."))

    source_text_by_note: dict[str, str] = {}
    for name in NOTE_ORDER:
        note_cells, source_text = cells_from_note(NOTES_DIR / name)
        cells.extend(note_cells)
        source_text_by_note[name] = source_text

    cells.append(markdown_cell(
        "# Parte II — Material ejecutable y verificaciones\n\nEsta parte complementa los apuntes originales con código reproducible. No sustituye ni reescribe las notas: permite comprobar conversiones, Huffman, IEEE 754, BCD, circuitos y álgebra booleana."
    ))
    # Preserve the existing executable material, but omit its old cover and broken visual appendix.
    for source_cell in original.get("cells", [])[1:39]:
        cell = copy.deepcopy(source_cell)
        cell.pop("attachments", None)
        cells.append(cell)

    provenance_rows = []
    for name in NOTE_ORDER:
        path = NOTES_DIR / name
        provenance_rows.append(f"| `{name}` | HTML Evernote | {path.stat().st_size:,} | `{hashlib.sha256(path.read_bytes()).hexdigest()[:16]}` |")
    for relative, (attachment_name, caption) in IMAGE_INFO.items():
        path = NOTES_DIR / relative
        provenance_rows.append(f"| `{relative}` | Imagen incrustada: {caption} | {path.stat().st_size:,} | `{hashlib.sha256(path.read_bytes()).hexdigest()[:16]}` |")
    for note, audio_files in AUDIO_BY_NOTE.items():
        for relative in audio_files:
            path = NOTES_DIR / relative
            provenance_rows.append(f"| `{relative}` | Audio inventariado, no incrustado | {path.stat().st_size:,} | `{hashlib.sha256(path.read_bytes()).hexdigest()[:16]}` |")
    cells.append(markdown_cell(
        "# Parte III — Registro de procedencia\n\n"
        "| Archivo original | Tratamiento | Bytes | SHA-256 (16 caracteres) |\n"
        "| --- | --- | ---: | --- |\n" + "\n".join(provenance_rows)
    ))

    execute_code_cells(cells)
    nb = {
        "cells": cells,
        "metadata": copy.deepcopy(original.get("metadata", {})),
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    nb["metadata"].setdefault("kernelspec", {"display_name": "Python 3", "language": "python", "name": "python3"})
    nb["metadata"].setdefault("language_info", {"name": "python", "version": "3"})
    nb["metadata"]["evernote_source_migration"] = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_directory": "Exportación HTML de Evernote proporcionada por el usuario",
        "html_notes": NOTE_ORDER,
        "embedded_images": len(IMAGE_INFO),
        "inventoried_audio_files": sum(len(v) for v in AUDIO_BY_NOTE.values()),
    }
    OUTPUT_NOTEBOOK.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # Source-faithfulness check: compare source text tokens against cells tagged with each source note.
    coverage = {}
    for name, source_text in source_text_by_note.items():
        notebook_text = " ".join("".join(c.get("source", [])) for c in cells if c.get("metadata", {}).get("evernote_source") == name)
        source_tokens = token_counter(source_text)
        notebook_tokens = token_counter(notebook_text)
        covered = sum((source_tokens & notebook_tokens).values())
        total = sum(source_tokens.values()) or 1
        coverage[name] = covered / total
        # Evernote repeats MathML/SVG accessibility text and editor language labels.
        # The migration keeps one readable representation, so token coverage is
        # expected to be slightly below 100% after those duplicates are removed.
        if coverage[name] < 0.93:
            raise RuntimeError(f"Low source token coverage for {name}: {coverage[name]:.3%}")

    embedded_image_count = sum(
        "".join(c.get("source", [])).count("data:image/png;base64,") for c in cells
    )
    error_count = sum(
        1 for c in cells for output in c.get("outputs", []) if output.get("output_type") == "error"
    )
    if embedded_image_count != len(IMAGE_INFO):
        raise RuntimeError(f"Expected {len(IMAGE_INFO)} embedded images, found {embedded_image_count}")
    if error_count:
        raise RuntimeError(f"Notebook contains {error_count} code errors")
    print(json.dumps({
        "output": str(OUTPUT_NOTEBOOK),
        "cells": len(cells),
        "markdown_cells": sum(c["cell_type"] == "markdown" for c in cells),
        "code_cells": sum(c["cell_type"] == "code" for c in cells),
        "embedded_images": embedded_image_count,
        "code_errors": error_count,
        "source_token_coverage": {k: round(v, 5) for k, v in coverage.items()},
        "bytes": OUTPUT_NOTEBOOK.stat().st_size,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
