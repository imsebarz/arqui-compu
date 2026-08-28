# Complex digital-circuit workflow

## Architecture before placement

For a complex design, write a compact contract before creating components:

1. module hierarchy and top-level circuit;
2. port table with direction, width, and signedness;
3. combinational equations or opcode/function table;
4. registers, memories, initial values, and state transitions;
5. clock edge, reset polarity, reset synchrony, enables, and halt/done behavior;
6. verification matrix mapping every requirement to vectors or exhaustive enumeration.

Partition datapath and control. Typical CPU-scale boundaries are `ALU`, `RegisterFile`, `ProgramCounter`, `InstructionRegister`, `ControlUnit`, `MemoryInterface`, and a small top-level integration circuit. Test each subcircuit before integration.

## Combinational coverage

- Exhaust inputs only when the total input-bit count is bounded.
- For arithmetic blocks, cover zero, one, all ones, alternating patterns, maximum/minimum signed values when signed, carry-in, carry-out, borrow, overflow, and wraparound.
- For muxes/decoders, cover every selector and disabled/illegal states.
- Reject floating or error-valued outputs unless the contract explicitly expects them.

## Sequential coverage

Use vector `<set>` as a scenario boundary and `<seq>` as the ordered step within the scenario. Each set starts from reset or a declared initial state. Include:

- reset asserted and released;
- inactive clock level, active edge, and post-edge observation;
- enable low/high transitions;
- hold behavior;
- wraparound, saturation, terminal count, or illegal-state recovery;
- at least two independent sets to prove state is not leaking across scenarios.

For circuits whose correctness depends on analog timing, metastability, asynchronous hazards, vendor FPGA primitives, or an external VHDL simulator, explain that Logisim functional simulation is not physical timing proof.

## Visual QA

After functional checks, open the project and inspect every requested circuit at a usable zoom. Look for overlapping symbols, clipped labels, unreadable bus routing, off-canvas blocks, ambiguous tunnels, unexplained floating pins, and a top-level layout that reflects the hierarchy. Visual quality cannot replace vectors, and vectors cannot prove the canvas is usable.

## Stopping condition

Finish only after the required project exists, Logisim loads it, all contract vectors pass, and any requested visual inspection is complete. If a requirement lacks a testable interpretation, report that gap instead of treating it as verified.
