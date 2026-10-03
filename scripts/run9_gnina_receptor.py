"""Run 9: make a Vina receptor PDBQT readable by GNINA, changing nothing GNINA could already read.

Run 8 lost three cases (7SUC, 7UMW, 7XRL) as UNAVAILABLE because the rigid cofactor written into
receptor_with_extra.pdbqt carried Meeko macrocycle 'glue' types: a ring-closure carbon typed CGn
and a dummy atom typed Gn. Vina understands both (CGn scores as C, Gn does not interact), GNINA's
parser does not. This module rewrites only the copy handed to GNINA, so that GNINA sees what Vina
scored against:
  * an atom typed CG0..CG9 becomes C,
  * an atom typed G0..G9 is removed.
Every other byte is kept. A receptor with neither type comes back byte-identical, which is how the
seal A condition 'every other case's receptor file stays byte-identical' is met by construction.
The receptor Vina docks against is never touched.
"""
import re

_GLUE_C = re.compile(r"^CG[0-9]$")
_DUMMY = re.compile(r"^G[0-9]$")


def _type(line):
    return line[77:].strip()


def sanitize(text):
    """Return (new_text, report). report counts the atoms changed and removed."""
    out, retyped, removed = [], 0, 0
    for line in text.splitlines(keepends=True):
        if line.startswith(("ATOM", "HETATM")):
            t = _type(line)
            if _DUMMY.match(t):
                removed += 1
                continue
            if _GLUE_C.match(t):
                body = line.rstrip("\r\n")
                nl = line[len(body):]
                line = body[:77] + "C " + nl
                retyped += 1
        out.append(line)
    new = "".join(out)
    return (text if not (retyped or removed) else new), {"retypedGlueCarbons": retyped,
                                                         "removedDummyAtoms": removed}
