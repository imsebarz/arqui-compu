# Logisim Evolution 4.1 project conventions

The MCP targets the installed 4.1.x XML project format and asks Logisim itself to load generated files. The format is not a stable external interchange specification, so use native normalization as the compatibility check.

## Built-in library ids

| id | descriptor | common use |
|---:|---|---|
| 0 | `#Wiring` | Pin, Tunnel, Splitter, Constant, Clock |
| 1 | `#Gates` | NOT, AND, OR, XOR and related gates |
| 2 | `#Plexers` | muxes, demuxes, encoders, decoders |
| 3 | `#Arithmetic` | adders, comparators, shifters, multipliers |
| 4 | `#Memory` | flip-flops, registers, counters, RAM, ROM |
| 5 | `#I/O` | displays, buttons, keyboards, terminals |
| 6 | `#TTL` | 74xx components |
| 7 | `#TCL` | TCL components |
| 8 | `#Base` | editing tools and text |

Project subcircuits omit `lib` and use a `name` matching a circuit in the same project.

## Source-backed deterministic profiles

The high-level compiler intentionally profiles a small set:

- `Pin`: connection is at `loc`; output pins use `facing=west` and `type=output`; bus width uses `width`.
- `Tunnel`: connection is at `loc`; equal `label` values form one logical net.
- `Splitter`: trunk is at `loc`; `incoming` is bus width; `fanout` is branch count; the compiler uses `appear=center` and maps bit 0 to the first branch. Bus arrays are LSB-first.
- `Constant`: one-bit constant source with `value=0` or `value=1`.
- `NOT Gate`: output at `loc`, input 30 grid units to the west in the compiler profile.
- two-input `AND Gate`, `OR Gate`, and `XOR Gate`: `size=30`, `inputs=2`; output at `loc`, inputs at `x-30,y-10` and `x-30,y+10` when facing east.

Do not infer that other built-in components share these port conventions. For unprofiled components, obtain exact coordinates/attributes from an existing project, the installed application, or matching-version source, then require a native load and functional vector.

## Wiring rules

- Coordinates should align to the 10-pixel grid.
- Wires must be horizontal or vertical; split diagonal routes into orthogonal segments.
- Crossings and shared endpoints can change connectivity. Prefer labeled tunnels for generated long-distance nets.
- Pin labels must be stable and unique ignoring case for CLI vectors.
- A successfully parsed wire can still terminate at the wrong port; functional tests are mandatory.
