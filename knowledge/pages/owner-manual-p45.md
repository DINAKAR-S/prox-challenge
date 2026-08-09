---
source: owner-manual
page: 45
topics: [wiring-schematic, electrical-diagram, igbt, pfc, mcu-board, transformer, rectifier]
---

Page 45
For technical questions, please call 1-800-444-3353.
Item 57812
Sidebar tabs: Safety · CONTROLS · Wire · TIG / Stick · WELDING TIPS · MAINTENANCE (highlighted black)

## Wiring Schematic

Full electrical schematic of the welder's power and control circuitry (no accompanying prose text on this page — diagram only, page title "Wiring Schematic").

### Figure: Wiring Schematic (full-page circuit diagram)

**Power input stage (bottom-left):**
- "K1 AC 120-240V/50/60HZ" — main AC input rated for 120–240V at 50/60Hz, feeding two switch contacts labeled AC1 and AC2, plus a ground (G) connection.
- AC1/AC2 feed into a bridge arrangement with four "1/4" rated components (fuses) in series, then into two "RECTIFIER" blocks (each with 4 pins: 1,2,3,4 and +/- and ～/～ markings) — these convert incoming AC to DC.
- A small auxiliary transformer/flyback section below with capacitors and a "24V" labeled regulator block feeds a low-voltage control supply (with diodes and what looks like an opto-isolator symbol) — this generates the 24V rail for control electronics.
- Two cooling fans, "FAN" and "FAN2" (each 2-pin connectors), are shown at the bottom, wired to the low-voltage supply, driving two large cross-hatched circular fan symbols at the bottom of the page (the physical cooling fans of the unit).

**Main power conversion stage (top-left, large upper block):**
- Output studs "OUT+" (top-left) and "OUT-" (top, right of center) — the welding output terminals. "OUT+" passes through a "Hall" sensor (current sensor) and an inductor coil before entering the main circuit board (drawn as a bold-outlined rectangle box).
- Inside the main board: a bank of diodes/rectifier bridge (multiple diode symbols in parallel rows) feeding a transformer labeled "T1 / T60*30*28" (a toroidal/ferrite transformer core), which is driven by two sets of IGBT switching transistor pairs.
- A "PFC" (Power Factor Correction) block and an "IGBT" labeled block are shown as a separate outlined sub-section feeding the main switching transformer stage — the PFC/IGBT combination conditions and switches the incoming DC before the transformer.
- A row of capacitors bridges sections of the switching circuit (smoothing/snubber capacitors).

**Control / low-voltage board (right side, "CN5" connector, labeled "MCU BOARD"):**
- The MCU BOARD is drawn as a large rectangle with a 34-pin connector "CN5" (pins 1–34, with pins 28 and 29 shown out of strict numeric sequence in the original artwork) linking it to the power stage board.
- Three small relay/transistor driver symbol groups sit inside the MCU BOARD outline (each with pins 1/2/3), likely driving contactors or solenoids.
- A small pushbutton symbol appears twice near the top and bottom edges of the MCU BOARD (front-panel buttons or test points).
- "CN7" is a 7-pin connector at the bottom of the MCU BOARD.

**LCD Screen (top-right):**
- Box labeled "LCD SCREEN" connects to the MCU BOARD via a 4-pin connector "CN5" (1,2,3,4) on the screen side matching a "CN5" 4-pin header on the MCU board — the display's data/power connection.

**Peripheral connectors from MCU BOARD (right/lower-right):**
- "CN6" (2-pin) → "FAST WIRE FEED SWITCH" (a 4-pin switch symbol, labeled pins 3/4 and 1/2) — controls a fast wire-feed / purge function.
- "CN3" (2-pin, listed twice — once near CN6/fast switch group, once near remote board group) → "SOLENOID VALVE" (gas solenoid valve, shown twice as two separate solenoid valve blocks) — controls shielding gas flow.
- "CN4" (5-pin) → "WIRE FEEDER" labeled with a motor symbol "M" — drives the wire feed motor.
- "CN7" (2-pin, second instance) and "CN8" (7-pin) connect to a "REMOTE BOARD" block, which in turn connects via "CN1" (9-pin) and "CN2"/"CN3" to two "AVIATION PLUG" circular connectors (external accessory ports on the machine's front/side panel for remote control or foot pedal accessories).

**Summary of major labeled components:** AC1, AC2, G (ground) — input; K1 relay/switch — main power relay; RECTIFIER (×2) — AC-DC conversion; IGBT — power switching transistors (insulated-gate bipolar transistors); PFC — power factor correction; T1 (T60*30*28 core) — main high-frequency transformer; Hall sensor — output current sensing; FAN, FAN2 — cooling fans; MCU BOARD — main control/microcontroller board; LCD SCREEN — front-panel display; REMOTE BOARD — remote accessory interface board; WIRE FEEDER (M) — wire feed drive motor; SOLENOID VALVE (×2) — gas flow control valves; FAST WIRE FEED SWITCH — trigger/inch switch; AVIATION PLUG (×2) — external round multi-pin accessory connectors; OUT+ / OUT- — welding output terminals.

Page footer: Item 57812 · For technical questions, please call 1-800-444-3353. · Page 45
