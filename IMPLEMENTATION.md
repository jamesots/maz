Implementation Notes
====================

Disclaimer: I don't know much about parsers, lexers, grammars and the like, so I will probably use all the wrong terms in this document. Also, I can't remember how everything works, so this document is me trying to work it out again.

maz uses pegjs.

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