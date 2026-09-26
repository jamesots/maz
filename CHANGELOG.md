# CHANGELOG

## v0.6.0 (unreleased)

New:

- Libraries of routines: `.library "file"` assembles only the routines in the file which are used, defined with `.routine name` and `.endroutine`. Libraries can use other libraries, and are found using the search paths.
- `.if` can use symbols: equs defined anywhere, and labels defined before the `.if`. A symbol can be defined in more than one branch of such an `.if`. `.include`, `.incbin` and macro definitions can't be inside one.
- `(ix-d)` and `(ix)` index register addressing, as well as `(ix+d)`. The same goes for `iy`.
- Instruction operands are checked for range: 8 bit values must be -128 to 255, 16 bit values -32768 to 65535, and index offsets -128 to 127.
- Division by zero is an error in instruction operands, `db` and `dw`.
- Unbalanced `.if`, `.else` and `.endif` are reported.
- `getSegments()`, `getLines()` and a `symbols` map of final values, for tools which use maz as a library.

Fixed:

- A `defb`/`defw` whose size depends on a label defined after it (e.g. `defw cat(label, "x")`) could be overwritten by the following bytes.
- An `.if` nested inside a false `.if` was assembled.
- `.incbin` in an included file looked for the file relative to the top level file.
- Nested includes could look for files in the wrong directory.
- Assembling was slow for large files (40,000 lines took 11.6 seconds, now under a second).
- `ld hl,(ix)`, and other instructions which don't exist, reported "Symbol 'ix' not found". They now report "Register 'ix' can't be used here".
- A circular equ is reported as one error showing the cycle, instead of several.
- The CLI showed the wrong version number.
- The listing showed "undefined" or an extra line at the end of some included files.

Changed:

- "Cannot ORG to earlier address than first ORG" is reported when assembling, so no output file is written.
- `$` is no longer listed in the listing's symbol table.

## v0.5.0

Added .incbin directive

## v0.4.7

Upgrade pacakges again.

## v0.4.6

Upgrade packages, add prettier.
