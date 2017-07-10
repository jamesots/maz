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

    function rel(expr) {
        return [{
            relative: expr
        }];
    }

    function res(bytes) {
        const result = {
            text: text(),
            bytes: bytes
        };
        const references = bytes.filter(byte => byte && byte.expression).map(byte => byte.expression);
        if (references.length > 0) {
            result.references = references;
        }
        return result;
    }
}

start = ws? stmts:statements? ws? { return stmts; }

statements = stmt:statement [ \t]* comment? separator stmts:statements {
        if (Array.isArray(stmt)) {
            return stmt.concat(stmts);
        }
        return [stmt].concat(stmts);
    }
    / stmt:statement [ \t]* comment? {
        if (Array.isArray(stmt)) {
            return stmt;
        }
        return [stmt]
    }

separator = [ \t]* [\r\n] [ \t]*

statement = label:labeldef ws? stmt:statement {
        if (Array.isArray(stmt)) {
            return [label].concat(stmt);
        }
        return [label, stmt]
    }
    / labeldef
    / directive
    / code
    / comment

directive = org
    / db
    / macro
    / endm
    / block
    / endblock
    // etc

comment = ';' [^\n]*

org = '.'? 'org'i ws expr

macro = '.'? 'macro'i ws label

endm = '.'? 'endm'i

db = '.'? 'db'i ws? dbytes:dbytes {
    return res(dbytes);
}

dbytes = db1:dbyte ws? ',' ws? db2:dbytes {
        if (Array.isArray(db1)) {
            return db1.concat(db2);
        }
        return [db1].concat(db2);
    }
    / dbyte

dbyte = str:string {
        let bytes = [];
        for (let i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i));
        }
        return bytes;
    }
    / expr:expr {
        return [expr]
    }

string = '"' str:(double_string_char*) '"' { return str.join(''); }
    / "'" str:(single_string_char*) "'" { return str.join(''); }

double_string_char = !('"' / "\\" / "\n") . { return text(); }
    / "\\" seq:escape_sequence { return seq; }

single_string_char = !("'" / "\\" / "\n") . { return text(); }
    / "\\" seq:escape_sequence { return seq; }

escape_sequence = char_escape_sequence
    / "0" ![0-9] { return "\0"; }
    / hex_escape_sequence

char_escape_sequence = single_esc_char
    / non_escape_char

single_esc_char = "'"
    / '"'
    / "b" { return "\b"; }
    / "f" { return "\f"; }
    / "n" { return "\n"; }
    / "r" { return "\r"; }
    / "t" { return "\t"; }
    / "v" { return "\v"; }

non_escape_char = !(escape_char / "\n") . { return text(); }

escape_char = single_esc_char
    / [0-9]
    / "x"
    / "u"

hex_escape_sequence = "x" digits:$([0-9a-f]i [0-9a-f]i) {
        return String.fromCharCode(parseInt(digits, 16));
    }

block = '.block'i

endblock = '.endblock'i

labeldef = label:label ':' {
    return {
        label: label
    }
}

label = !'bc'i !'de'i !'hl'i !'sp'i !'af'i ([a-zA-Z][a-zA-Z0-9]*) {
    return text();
}

code = ld_sp_hl
    / ld_r_r
    / ld_bcde_a
    / ld_a_bcde
    / ld_hla_addr
    / ld_bcdehlsp_nn
    / add_hl_bcdehlsp
    / inc_bcdehlsp
    / dec_bcdehlsp
    / inc_bdhhl
    / inc_cela
    / ld_bdhhl_n
    / ld_cela_n
    / dec_bdhhl
    / dec_cela
    / push_bcdehlaf
    / pop_bcdehlaf
    / rlca
    / ex_afaf
    / rrca
    / nop
    / jp
    / djnz
    / rla
    / rra
    / jr_nznc
    / jr_zc
    / jr
    / ld_addr_hla
    / cpl
    / daa
    / scf
    / ccf
    / halt

ex_afaf = 'ex'i ws 'af'i ws? ',' ws? 'af\''i {
    return res([0x08]);
}
halt = 'halt'i {
    return res([0x76]);
}
scf = 'scf'i {
    return res([0x37]);
}
ccf = 'ccf'i {
    return res([0x3f]);
}
daa = 'daa'i {
    return res([0x27]);
}
cpl = 'cpl'i {
    return res([0x2f]);
}
rlca = 'rlca'i {
    return res([0x07]);
}
rla = 'rla'i {
    return res([0x17]);
}
rrca = 'rrca'i {
    return res([0x0f]);
}
rra = 'rra'i {
    return res([0x1f]);
}
nop = 'nop'i {
    return res([0x00]);
}
ld_sp_hl = 'ld'i ws 'sp'i ws? ',' ws? 'hl'i {
    return res([0xF9]);
}
ld_r_r = 'ld'i ws reg1:reg ws? ',' ws? reg2:reg ! {
    return reg1 === 6 && reg2 === 6;
    } {
    return res([0x40 | (reg1 << 3) | reg2]);
}
ld_bcdehlsp_nn = 'ld'i ws reg:bcdehlsp ws? ',' ws? expr:expr {
    return res([0x01 | (reg << 4)].concat(expr16(expr)));
}
ld_bcde_a = 'ld'i ws '(' reg:bcde ')' ws? ',' ws? 'a' {
    return res([0x02 | (reg << 4)]);
}
ld_a_bcde = 'ld'i ws 'a' ws? ',' ws? '(' reg:bcde ')' {
    return res([0x0A | (reg << 4)]);
}
add_hl_bcdehlsp = 'add'i ws 'hl'i ws? ',' ws? reg:bcdehlsp {
    return res([0x09 | (reg << 4)]);
}
inc_bcdehlsp = 'inc'i ws reg:bcdehlsp {
    return res([0x03 | (reg << 4)]);
}
dec_bcdehlsp = 'dec'i ws reg:bcdehlsp {
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
ld_cela_n = 'ld'i ws reg:cela ws? ',' ws? expr:expr {
    return res([0x0E | (reg << 4)].concat(expr8(expr)));
}
ld_addr_hla = 'ld'i ws '(' expr:expr ')' ws? ',' ws? reg:hla {
    return res([0x22 | (reg << 4)].concat(expr16(expr)));
}
ld_hla_addr = 'ld'i ws reg:hla ws? ',' ws? '(' expr:expr ')' {
    return res([0x2a | (reg << 4)].concat(expr16(expr)));
}
push_bcdehlaf = 'push'i ws reg:bcdehlaf {
    return res([0xC1 | (reg << 4)]);
}
pop_bcdehlaf = 'pop'i ws reg:bcdehlaf {
    return res([0xC5 | (reg << 4)]);
}
jp = 'jp'i ws expr:expr {
    return res([0xC2, expr]);
}
djnz = 'djnz'i ws expr:expr {
    return res([0x10].concat(rel(expr)));
}
jr = 'jr'i ws expr:expr {
    return res([0x18].concat(rel(expr)));
}
jr_nznc = 'jr'i ws cond:nznc ws? ',' ws? expr:expr {
    return res([0x20 | (cond << 4)].concat(rel(expr)));
}
jr_zc = 'jr'i ws cond:zc ws? ',' ws? expr:expr {
    return res([0x28 | (cond << 4)].concat(rel(expr)));
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

bcdehlsp = 'bc'i { return 0; }
    / 'de'i { return 1; }
    / 'hl'i { return 2; }
    / 'sp'i { return 3; }

bcdehlaf = 'bc'i { return 0; }
    / 'de'i { return 1; }
    / 'hl'i { return 2; }
    / 'af'i { return 3; }

bcde = 'bc'i { return 0; }
    / 'de'i { return 1; }

nznc = 'nz'i { return 0; }
    / 'nc'i { return 1; }

zc = 'z'i { return 0; }
    / 'c'i { return 1; }

hla = 'hl'i { return 0; }
    / 'a'i { return 1; }

ws = [ \t\r\n]+

expr = t1:term t2:(ws? [+-] ws? term)* {
        let result = t1;
        for (const term of t2) {
            result += ` ${term[1]} ${term[3]}`;
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

term = t1:factor t2:(ws? [*/] ws? factor)* {
        let result = t1;
        for (const term of t2) {
            result += ` ${term[1]} ${term[3]}`;
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
hex_literal = '$' [0-9a-f]i[0-9a-f_]i* {
        return parseInt(text().replace(/[_\$]/g,''), 16);
    }
    / [0-9a-fA-F][0-9a-f_]i* 'h' {
        return parseInt(text().replace(/[_h]/g,''), 16)
    }
binary_literal = [01][01_]* 'b' {
        return parseInt(text().replace(/[_b]/g,''), 2)
    }
octal_literal = [0-7][0-7_]* 'o' {
        return parseInt(text().replace(/[_o]/g,''), 8)
    }
