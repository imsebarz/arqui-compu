---
name: logisim-circuit-engineer
description: Design, create, inspect, repair, simulate, and verify digital circuits in Logisim Evolution, including .circ projects, Boolean logic, buses, hierarchy, truth tables, and sequential test vectors. Use when work must end in a real Logisim project rather than only an HDL sketch or conceptual diagram.
---

# Logisim Circuit Engineer

Produce a real `.circ` artifact and evidence proportional to the circuit's risk. Treat the MCP's static checks, Logisim's native loader, functional simulation, and visual inspection as different claims.

## Route the work

- Inspect an existing project before editing it. Preserve circuit names, pin interfaces, widths, library references, and unrelated circuits unless the user asks to change them.
- Use `create_logic_project` for Boolean combinational logic. Prefer named definitions and buses over manually positioning equivalent primitive gates.
- Use `create_project` for hierarchy, sequential elements, memories, or specialized components only when exact component attributes and port geometry are known from the project or a source-backed profile. Never guess unprofiled port locations.
- Use `convert_project` only to create a separate normalized copy. Do not convert in place.
- Read [references/mcp-tools.md](references/mcp-tools.md) when choosing tool inputs or interpreting results.
- Read [references/design-and-verification.md](references/design-and-verification.md) for CPUs, ALUs, FSMs, registers, memories, clocks, resets, or other stateful/multi-module designs.
- Read [references/logisim-format.md](references/logisim-format.md) before low-level `.circ` construction or repair.

## Required workflow

1. Establish the intended interface: named inputs and outputs, widths, signedness, clock/reset behavior, truth table or state transitions, and required edge cases. State any inferred convention.
2. Call `environment`, then inspect any existing `.circ` file. Do not design against a presumed Logisim version when the installed runtime is available.
3. Build a hierarchical design when complexity warrants it. Keep control, datapath, memory, and reusable arithmetic blocks separately testable.
4. Validate in layers:
   - `validate_project` for static structure and native load evidence;
   - `truth_table` for bounded combinational circuits;
   - `write_test_vector` plus `run_test_vector` for explicit requirements and all stateful designs;
   - `open_project` and visually inspect the actual canvas when composition, readability, or manual usability matters.
5. Fix every observed failure, rerun the affected layer, and report the final artifact path plus the evidence that actually passed.

## Correctness invariants

- Unique pin labels are case-insensitive. Every externally tested pin needs a stable label and correct width.
- Bus bit arrays and expression references are LSB-first. Say so in the design handoff.
- Test reset assertion/deassertion, initial state, clock edges, carry/borrow/overflow boundaries, selector extremes, illegal or unused opcodes, and representative data patterns when applicable.
- Sequential vectors must use `<set>` and `<seq>` so state is preserved only within the intended sequence.
- Bound exhaustive truth tables. Use targeted vectors when input width makes `2^n` enumeration unreasonable.
- Do not report “sin errores” from well-formed XML or a successful native load alone. A defensible completion requires passing functional tests that cover the stated contract; visual cleanliness is a separate check.
- Keep the source `.circ`, vector files, memory images, and generated evidence together when the user expects a reproducible deliverable.

## Completion language

Distinguish these states explicitly: generated, structurally valid, loaded by Logisim, functionally verified by named vectors, visually inspected, and opened for the user. Mention uncovered behavior rather than implying universal proof.
