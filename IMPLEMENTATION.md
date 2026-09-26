Implementation Notes
====================

Disclaimer: I don't know much about parsers, lexers, grammars and the like, so I will probably use all the wrong terms in this document. Also, I can't remember how everything works, so this document is me trying to work it out again.

maz uses peggy (previously pegjs).

parser.pegjs parses the z80 source file into what I've called an AST, but I don't think it is really. It's an array of objects which represent the source.

expr.pegjs evaluates expressions. It produces a string or number. An object containing variable values can be passed to it. It handles strings and numbers in different bases, and automatically casts various things and has a few functions included. (Rules for converting between types need to be spelt out somewhere). The parser also parses expressions, but it doesn't evaluate them — it does however extract a list of variables used in the expression.


Parser
------

The parser returns an array of Element objects, each of which has a location.

If an expression is found, if there are no variables used then it will be evaluated and returned. Otherwise, an object is returned containing the expression, a list of variables and the expression's location:

{
    expression: text(),
    vars: t1,
    location: loc()
}

A location object is:
{
    line: options.line,
    column: location().start.column,
    source: options.source (the file?)
}

See els.ts for all the objects that are produced.

Compiler
--------

The compiler (compiler.ts) first changes the structure of the AST: it
parses included files and libraries and inserts them, expands macros, and
gives labels in blocks, routines and macro calls a prefix (e.g. %0_label).
selectRoutines works out which routines in libraries are used, by following
the symbol names in expressions from the code outside routines. Routines
which aren't used are then skipped, like code in a false .if. getSymbols then records
where each symbol is defined: a label, an equ, or a macro argument.

After that the AST isn't changed. assemble() runs passes over it, each of
which works out the address of every element, the value of every label,
and the bytes for every instruction, db and dw, and keeps them in a Pass
object. Expressions are evaluated by an Evaluator for that pass, which
evaluates equs when they are used.

The size of some elements depends on labels defined later, e.g.
`defw cat(label, "x")`, so passes are repeated, using the values of labels
from the previous pass for forward references, until nothing moves. Only
db, dw and instruction operands can use forward references; org, phase,
align, ds and .if can't, so that the passes settle. Errors from the final
pass are the ones reported.

An .if whose condition is a constant is decided before assembling, so it
can contain anything, including .include. An .if whose condition uses
symbols is decided in each pass. Before that, both of its branches are
processed (so a symbol can be defined in each), and the definitions in them
are marked as conditional. Each pass uses the definition which is
assembled.

The output (getBytes, getSegments, getLines, getList and symbols) comes
from the final pass.


Tests
-----

`pnpm test` builds maz, then runs the tests. test/opcodes.ts lists every
instruction and the bytes it should be assembled to. If z88dk is installed
(z88dk-z80asm, or z88dk.z88dk-z80asm from the snap, or set MAZ_Z80ASM),
test/z88dk.spec.ts also checks that z88dk's assembler produces the same
bytes for them, and that maz can assemble every instruction z88dk's
disassembler knows about. Otherwise those tests are skipped.

The examples are assembled and compared with snapshots in test/snapshots.
Run with UPDATE_SNAPSHOTS=1 to update them, after checking the differences.
