# MCP tool routing

Use absolute paths. Project writes accept only `.circ`; vector writes accept `.txt`, `.vec`, or `.test`. Existing files are preserved unless `overwrite: true` is explicit.

## Design tools

### `create_logic_project`

Use for combinational designs expressible with scalar Boolean logic and buses.

- Operators: `!`/`~`, `&`/`&&`, `^`, `|`/`||`, and parentheses.
- Functions: `not`, `and`, `or`, `xor`, `nand`, `nor`, `xnor`, and `mux(select, when0, when1)`.
- A bus input is referenced one bit at a time, such as `A[0]`.
- Bus output `bits` are LSB-first and must contain exactly `width` expressions.
- `definitions` are reusable scalar expressions and may reference other acyclic definitions.

Example shape:

```json
{
  "outputPath": "/absolute/path/full-adder.circ",
  "spec": {
    "name": "FullAdder",
    "inputs": [{"name":"A"},{"name":"B"},{"name":"Cin"}],
    "definitions": {"AXB":"A ^ B"},
    "outputs": [
      {"name":"Sum","expression":"AXB ^ Cin"},
      {"name":"Cout","expression":"(A & B) | (Cin & AXB)"}
    ]
  }
}
```

### `create_project`

Use for explicit hierarchical or sequential construction. Each component needs a library, exact location, canonical component name, and only source-backed attributes. A component with `library: null` or `"project"` is a subcircuit instance whose `name` must match another circuit in the same file.

Native loading catches malformed or unknown constructs, but it does not prove that wires reach the intended ports.

## Verification tools

- `inspect_project`: read-only inventory and SHA-256 identity.
- `validate_project`: static diagnostics, optional native normalization, and optional vector execution. Prefer this as the final gate.
- `truth_table`: bounded combinational characterization. Default maximum is 12 input bits; never raise the limit casually.
- `write_test_vector`: deterministic vector writer; include directions so `<DC>` is rejected for inputs.
- `run_test_vector`: native functional evidence with explicit passed/failed counts.
- `convert_project`: writes a separate normalized project using the installed Logisim version.
- `open_project`: opens the artifact for actual-canvas inspection.
- `component_catalog`: identifies the profiles that the high-level compiler knows. Treat all other components as identity-only.

## Evidence interpretation

`verificationLevel` means:

- `failed`: at least one required layer failed.
- `static-only`: the XML/project structure passed local checks only.
- `native-load`: Logisim loaded and normalized the project; behavior remains unproven.
- `native-test-vector`: supplied vectors passed; behavior outside their coverage remains unproven.
