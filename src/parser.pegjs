start = ws? statements ws?

statements = statement separator statements
    / statement

separator = [ \t]* [;\r\n] [ \t]*

statement = directive
    / code
    / comment

directive = org
    / macro
    // etc

comment = ';' [^\n]*

org = 'org'i ws expr

macro = 'macro'i ws label

code = (label ':' ws?)? z80

label = [a-zA-Z][a-zA-Z0-9]*

z80 = ld_r_r
    / jp

ld_r_r = 'ld'i ws reg ws? ',' ws? reg
jp = 'jp'i ws expr

reg = [abcdehlABCDEHL]

ws = [ \t\r\n]+

expr = number_literal
    / label

number_literal = decimal_literal
    / hex_literal
    / binary_literal
    / octal_literal

decimal_literal = [0-9][0-9_]* {
        return parseInt(text().replace(/_/g,''), 10)
    }
hex_literal = '$' [0-9a-fA-F][0-9a-fA-F_]* {
        return parseInt(text().replace(/[_\$]/g,''), 16);
    }
    / [0-9a-fA-F][0-9a-fA-F_]* 'h' {
        return parseInt(text().replace(/[_h]/g,''), 16)
    }
binary_literal = [01][01_]* 'b' {
        return parseInt(text().replace(/[_b]/g,''), 2)
    }
octal_literal = [0-7][0-7_]* 'o' {
        return parseInt(text().replace(/[_o]/g,''), 8)
    }
