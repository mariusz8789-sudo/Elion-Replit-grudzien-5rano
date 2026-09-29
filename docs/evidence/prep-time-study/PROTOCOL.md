# Preparation time study — what to do, and how it is timed

## Why this exists

Genesis's own times are measured. What nobody has ever measured is how long the same work takes
a person by hand. Without that second number, any claim that Genesis "saves X%" is invented, and
we will not publish one. This study produces the missing number.

It is deliberately small: ten complexes, one afternoon. A small measurement that exists beats a
large one that never happens.

## The task, identical for both arms

You are given ten deposited structure files (`inputs/*.cif`, straight from the PDB). For each one,
produce the three things a docking run needs:

| file | what it must be |
|---|---|
| `receptor.pdb` (or `receptor.pdbqt`) | the prepared receptor |
| `ligand.sdf` (or `ligand.mol`) | the crystal ligand as a 3D molecule with correct bond orders, in the receptor's coordinate frame |
| `box.json` | `{"center": [x, y, z], "size": [x, y, z]}` in Ångström, a pocket box around that ligand |

Put them in a folder named after the PDB id:

```
my-results/
  5SAK/  receptor.pdb  ligand.sdf  box.json
  6ZC3/  receptor.pdb  ligand.sdf  box.json
  ...
```

The ligand of each complex is named in `inputs/manifest.json`.

**Use whatever tools you normally use.** PyMOL, Chimera, OpenBabel, RDKit, MGLTools, Meeko, a text
editor — anything. Nothing about the route is prescribed. Only the result is judged.

## When a complex counts as done

By the gate, not by opinion:

```
python3 scripts/prep-time-study-check.py --dir my-results
```

It checks that the receptor really is a protein, that the ligand is the right molecule with the
right number of heavy atoms against its wwPDB chemical-component entry, that its bonds have
orders, that it sits in the receptor's frame, and that the box actually contains it. It does not
judge quality, taste or method, and it never looks at docking results.

The same gate judges the Genesis arm. A complex is done when the gate accepts it.

## How to time it

This is the part that decides whether the number is worth anything.

**Record ACTIVE time — time your hands and attention are on the task.**

- Start the clock when you begin working on a complex.
- **Stop the clock whenever you are waiting on a computer** and not doing anything: a long
  minimisation, a download, a conversion that takes a minute. Note that wait separately.
- Stop the clock for interruptions, coffee, email. Note roughly how long.
- Restart it when you resume.

Why the split matters: Genesis does not make a computer faster. A person running the same tools
waits for their own machine just as long. The only thing worth measuring is **the time a
specialist spends working**, and that is the number this study needs.

Per-complex times, not one total: the first complex always takes longest and we want to see that
learning curve rather than hide it.

## Ground rules

- No help from Genesis, and no looking at its output.
- If you use an AI assistant at any point, **say so on the sheet** and say for what. It does not
  disqualify anything; an unrecorded one destroys the measurement.
- If you give up on a complex, write that down. A complex nobody can prepare in reasonable time
  is a result, not a failure to hide.
- Work in your normal environment. Do not optimise for speed, and do not slow down for care you
  would not normally take. We want your ordinary pace.

## What is recorded about you

On the sheet: whether you have done protein–ligand docking before, roughly how often, and which
tools you use. Not to judge you — a first-timer's number measures learning the tool, an
experienced user's number measures the work, and those are different quantities. We will say
in the report which one this is.

## What we do with it

Active time per complex, in both arms, with the spread. Then, and only then, a statement of the
form "preparation took N minutes of active specialist time by hand and M seconds of unattended
machine time in Genesis". No percentage is computed until this sheet is filled in, and the
interpretation is fixed in `prep-time-study-prereg.json` before any of it is read.
