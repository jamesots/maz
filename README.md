maz
===

Macro Assembler for Z80
-----------------------

Maz is a Z80 macro assembler, which is currently under development. I wouldn't advise using it until it's at version 1, or at least until I change this message.

Numbers
-------

Numbers are decimal unless one of the following applies:

* Numbers which start with $ or end with h are in hex
* Numbers which end with o are in octal
* Numbers which end with b are in binary

Numbers can have _ in them to improve readability: eg: 1101_0100_1010_1111b

Labels
------

Labels contains any of the following: a-z, A-Z, 0-9, _

$ can be used to refer to the address of the current statement. In the case of DBs, it refers to the address of the start of the DBs.

Directives
----------

Any directive shown below without a leading full stop (period) may also be written with a leading full stop. The full stop is not optional if it is shown.

<dl>
<dt>db <i>bytes</i></dt>
<dt>defb <i>bytes</i></dt>
<dd>Declare bytes. Strings are converted into their ASCII values.

    db 0,1,100,$12,"hello\n"
</dd>
<dt>ds <i>expression</i></dt>
<dt>defs <i>expression</i></dt>
<dd>Declare storage. The expression is the number of bytes of storage to reserve. The bytes will be initialised to zeroes.

    ds 12
</dd>
<dt>equ</dt>
<dd></dd>
<dt>org <i>expression</i></dt>
<dd>Set origin. Sets the address where the next instructions will be compiled to, or bytes will be stored.

    org $100
</dd>
<dt>.phase <i>expression</i></dt>
<dd>Set phase. This sets the location that code is compiled to run at, but the code continues to be placed directly after the previous code. (TODO: Explain this properly).</dd>
<dt>.endphase</dt>
<dt>.dephase</dt>
<dd>End phase – Ends phased compilation, and returns to compiling at the address the code is being placed. (TODO: This is a terrible explanation).</dd>
<dt>macro <i>macroname</i> <i>labels</i></dt>
<dd>Define a macro. The parameters can be treated the same as EQUates until the macro ends.

    macro add a,b
</dd>
<dt>endm</dt>
<dd>End a macro definition.</dd>
<dt><i>macroname</i> <i>arguments</i></dt>
<dd>Call a macro.</dd>
<dt>.block</dt>
<dd>Start a block. Any labels declared within the block are only visible within that block. Blocks can be nested, so labels are also visible to blocks within the block.</dd>
<dt>.endblock</dt>
<dd>End a block.</dd>
<dt>.align <i>expression</i></dt>
<dd>Align the next byte so that its address modulo <i>expression</i> is zero. (If we're in phased compilation, the phase address is aligned.)</dd>
</dl>