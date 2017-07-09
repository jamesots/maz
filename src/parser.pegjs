{
    const Parser = require('expr-eval').Parser;

    function expr16(expr) {
        if (expr.expression) {
            return [expr, null]
        } else {
            return [expr & 0xFF, (expr & 0xFF00) >> 8]
        }
    }

    function expr8(expr) {
        if (expr.expression) {
            return [expr]
        } else {
            return [expr & 0xFF]
        }
    }

    function res(bytes) {
        return {
            text: text(),
            bytes: bytes
        };
    }
}

start = ws? stmts:statements? ws? { return stmts; }

statements = stmt:statement [ \t]* comment? separator stmts:statements {
        return [stmt].concat(stmts);
    }
    / stmt:statement [ \t]* comment? {
        return [stmt]
    }

separator = [ \t]* [\r\n] [ \t]*

statement = directive
    / code
    / comment

directive = org
    / macro
    / endm
    / block
    / endblock
    // etc

comment = ';' [^\n]*

org = '.'? 'org'i ws expr

macro = '.'? 'macro'i ws label

endm = '.'? 'endm'i

block = '.block'i

endblock = '.endblock'i

code = label:(label ':' ws?)? z80:z80 {
        if (label) {
            z80.label = label[0];
        }
        return z80;
    }

label = [a-zA-Z][a-zA-Z0-9]* {
    return text();
}

z80 = ld_sp_hl
    / ld_r_r
    / ld_rr_nn
    / ld_bcde_a
    / add_hl_rr
    / inc_rr
    / dec_rr
    / inc_bdhhl
    / inc_cela
    / ld_bdhhl_n
    / ld_cela_n
    / dec_bdhhl
    / dec_cela
    / push_rr
    / pop_rr
    / rlca
    / nop
    / jp

rlca = 'rlca'i {
    return res([0x07]);
}
nop = 'nop'i {
    return res([0x00]);
}
ld_sp_hl = 'ld'i ws 'sp'i ws? ',' ws? 'hl'i {
    return res([0xF9]);
}
ld_r_r = 'ld'i ws reg1:reg ws? ',' ws? reg2:reg {
    return res([0x40 | (reg1 << 3) | reg2]);
}
ld_rr_nn = 'ld'i ws reg:reg16 ws? ',' ws? expr:expr {
    return res([0x01 | (reg << 4)].concat(expr16(expr)));
}
ld_bcde_a = 'ld'i ws '(' reg:bcde ')' ws? ',' ws? 'a' {
    return res([0x02 | (reg << 4)]);
}
add_hl_rr = 'add'i ws 'hl'i ws? ',' ws? reg:reg16 {
    return res([0x09 | (reg << 4)]);
}
inc_rr = 'inc'i ws reg:reg16 {
    return res([0x03 | (reg << 4)]);
}
dec_rr = 'dec'i ws reg:reg16 {
    return res([0x0B | (reg << 4)]);
}
inc_bdhhl = 'inc'i ws reg:bdhhl {
    return res([0x04 | (reg << 4)]);
}
inc_cela = 'inc'i ws reg:cela {
    return res([0x0C | (reg << 4)]);
}
dec_bdhhl = 'dec'i ws reg:bdhhl {
    return res([0x05 | (reg << 4)]);
}
dec_cela = 'dec'i ws reg:cela {
    return res([0x0D | (reg << 4)]);
}
ld_bdhhl_n = 'ld'i ws reg:bdhhl ws? ',' ws? expr:expr {
    return res([0x06 | (reg << 4)].concat(expr8(expr)));
}
ld_cela_n = 'inc'i ws reg:cela ws? ',' ws? expr:expr {
    return res([0x0E | (reg << 4)].concat(expr8(expr)));
}
push_rr = 'push'i ws reg:reg16a {
    return res([0xC1 | (reg << 4)]);
}
pop_rr = 'pop'i ws reg:reg16a {
    return res([0xC5 | (reg << 4)]);
}
jp = 'jp'i ws expr:expr {
    return res([0xC2, expr]);
}

reg = 'b'i { return 0; }
    / 'c'i { return 1; }
    / 'd'i { return 2; }
    / 'e'i { return 3; }
    / 'h'i { return 4; }
    / 'l'i { return 5; }
    / '(hl)'i { return 6; }
    / 'a'i { return 7; }

bdhhl = 'b'i { return 0; }
    / 'd'i { return 1; }
    / 'h'i { return 2; }
    / '(hl)'i { return 3; }

cela = 'c'i { return 0; }
    / 'e'i { return 1; }
    / 'l'i { return 2; }
    / 'a'i { return 3; }

reg16 = 'bc'i { return 0; }
    / 'de'i { return 1; }
    / 'hl'i { return 2; }
    / 'sp'i { return 3; }

reg16a = 'bc'i { return 0; }
    / 'de'i { return 1; }
    / 'hl'i { return 2; }
    / 'af'i { return 3; }

bcde = 'bc'i { return 0; }
    / 'de'i { return 1; }

ws = [ \t\r\n]+

expr = t1:term ws? t2:([+-] ws? term)* {
        let result = t1;
        for (const term of t2) {
            result += ` ${term[0]} ${term[2]}`;
        }
        try {
            const value = Parser.evaluate(new String(result));
            return value;
        } catch (e) {
            return {
                expression: result
            }
        }
    }

term = t1:factor ws? t2:([*/] ws? factor)* {
        let result = t1;
        for (const term of t2) {
            result += ` ${term[0]} ${term[2]}`;
        }
        return result;
    }

factor = '(' expr ')'
    / number_literal
    / label

number_literal = binary_literal
    / hex_literal
    / decimal_literal
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
