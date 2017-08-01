{
    const Expr = require('./expr');

    function toUtf8(s) {
        return unescape(encodeURIComponent(s));
    }

    function exprVars(els, indices) {
        let varlist = [];
        if (els) {
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                for (let j = 0; j < indices.length; j++) {
                    const index = indices[j];
                    varlist = varlist.concat(el[index]);
                }
            }
        }
        return varlist;
    }

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

    function loc() {
        return {
            line: location().start.line,
            column: location().start.column,
            source: options.source
        };
    }

    function res(bytes) {
        const result = {
            bytes: bytes,
            location: loc()
        };
        const references = bytes.filter(byte => byte && byte.expression).map(byte => byte.expression);
        if (references.length > 0) {
            result.references = references;
        }
        return result;
    }
}

start = wsnl? stmts:statements? wsnl? { return stmts; }

statements = stmt:statement [ \t]* comment? stmts:(separator+ statements?)? {
        if (!Array.isArray(stmt)) {
            stmt = [stmt];
        }
        if (stmts && stmts[1]) {
            stmt = stmt.concat(stmts[1]);
        }
        return stmt;
    }

separator = [ \t]* [\r\n] [ \t]*

statement = labelled_statement
    / include
    / labeldef
    / unlabelled_statement

labelled_statement = label:labeldef ws? stmt:unlabelled_statement {
        if (Array.isArray(stmt)) {
            return [label].concat(stmt);
        }
        return [label, stmt]
    }

unlabelled_statement = directive
    / code
    / macrocall
    / comment

directive = org
    / phase
    / endphase
    / align
    / db
    / ds
    / equ
    / macro
    / endm
    / block
    / endblock
    / if
    / endif
    / else
    // / ifdef
    // / ifndef

comment = ';' comment:([^\n]*) {
    return {
        comment: comment.join(''),
        location: loc()
    };
}

if = '.if' ws expr:expr {
    return {
        if: expr,
        location: loc()
    }
}

endif = '.endif' {
    return {
        endif: true,
        location: loc()
    }
}

else = '.else' {
    return {
        else: true,
        location: loc()
    }
}

include = '.include' ws path:string {
    return {
        include: path,
        location: loc()
    };
}

org = '.'? 'org'i ws expr:expr {
    return {
        org: expr,
        location: loc()
    }
}

align = '.align'i ws expr:expr {
    return {
        align: expr,
        location: loc()
    }
}

phase = '.phase'i ws expr:expr {
    return {
        phase: expr,
        location: loc()
    }
}

endphase = ('.endphase'i/'.dephase'i) {
    return {
        endphase: true,
        location: loc()
    }
}

macro = '.'? 'macro'i ws label:label params:(ws? labellist)? {
    const result = {
        macrodef: label,
        location: loc()
    }
    if (params) {
        result.params = params[1];
    }
    return result;
}

labellist = label:label list:(ws? ',' ws? labellist)? {
    if (!Array.isArray(label)) {
        label = [label];
    }
    if (list) {
        return label.concat(list[3]);
    }
    return label;
}

endm = '.'? 'endm'i {
    return {
        endmacro: true,
        location: loc()
    }
}

macrocall = label:label args:(ws args)? {
    const result = {
        macrocall: label,
        location: loc()
    }
    if (args) {
        result.args = args[1];
    }
    return result;
}

exprlist = expr:expr list:(ws? ',' ws? exprlist)? {
    if (!Array.isArray(expr)) {
        expr = [expr];
    }
    if (list) {
        return expr.concat(list[3]);
    }
    return expr;
}

args = arg1:expr arg2:(ws? ',' ws? args)? {
    if (!Array.isArray(arg1)) {
        arg1 = [arg1];
    }
    if (arg2) {
        arg1 = arg1.concat(arg2[3]);
    }
    return arg1;
}

equ = '.'? 'equ'i ws expr:expr {
    return {
        equ: expr,
        location: loc()
    }
}

ds = '.'? ('ds'i / 'defs'i) ws? expr:expr {
    return {
        location: loc(),
        defs: expr  // note: expression must be evaluable before assigning addresses
    };
}

db = '.'? ('db'i / 'defb'i) ws? dbytes:dbytes {
    return res(dbytes);
}

dbytes = db1:dbyte db2:(ws? ',' ws? dbytes)? {
    if (!Array.isArray(db1)) {
        db1 = [db1];
    }
    if (db2) {
        db1 = db1.concat(db2[3]);
    }
    return db1;
}

dbyte = ex:expr {
    if (typeof ex === 'string') {
        const bytes = [];
        const utf8 = toUtf8(ex);
        for (let i = 0; i < utf8.length; i++) {
            bytes.push(utf8.charCodeAt(i));
        }
        return bytes;
    } else if (!Array.isArray(ex)) {
        return [ex];
    } 
    return ex;
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
    / unicode_escape_sequence

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

unicode_escape_sequence = "u" digits:$([0-9a-f]i [0-9a-f]i [0-9a-f]i [0-9a-f]i) {
    return String.fromCodePoint(parseInt(digits, 16));
}

block = '.block'i {
    return {
        block: true,
        location: loc()
    };
}

endblock = '.endblock'i {
    return {
        endblock: true,
        location: loc()
    };
}

labeldef = at:'@'? label:label ':' {
    return {
        label: label,
        location: loc(),
        public: at !== null
    }
}

label = text1:[a-zA-Z_] text2:[a-zA-Z0-9_]* !{
        const text = text1 + text2.join('');
        return (text === 'bc' || text === 'de' || text === 'hl' || text === 'sp');
    } {
        return text();
    }

code = ldir
    / ldi
    / cpir
    / cpi
    / inir
    / ini
    / otir
    / outi
    / lddr
    / ldd
    / cpdr
    / cpd
    / indr
    / ind
    / otdr
    / outd
    / ld_cea_ixyhl
    / ld_sp_ixy
    / ld_sp_hl
    / ld_i_a
    / ld_a_i
    / ld_r_a
    / ld_a_r
    / ld_r_r
    / ld_bd_ixyhl
    / ld_bdh_ixy
    / ld_cela_ixy
    / ld_bcde_a
    / ld_a_bcde
    / ld_hla_addr
    / ld_bcdesp_nn
    / ld_bcdehlsp_nn
    / ld_ixyaddr_bcdehla
    / ld_ixyaddr_n
    / ld_ix_ix
    / ld_iy_iy
    / ld_ixyhl_bcdehla
    / ld_ixyh_n
    / ld_ixyl_n
    / ld_ixy_addr
    / ld_ixy_nn
    / add_hl_bcdehlsp
    / add_ixy_bcdesp
    / inc_bcdehlsp
    / dec_bcdehlsp
    / inc_bdhhl
    / inc_cela
    / inc_ixyh
    / inc_ixyl
    / inc_ixy
    / inc_ixyaddr
    / ld_bdhhl_n
    / ld_cela_n
    / ld_nn_bcdesp
    / ld_nn_ixy
    / dec_bdhhl
    / dec_cela
    / dec_ixyh
    / dec_ixyl
    / dec_ixy
    / dec_ixyaddr
    / pop_ixy
    / push_ixy
    / push_bcdehlaf
    / pop_bcdehlaf
    / rlca
    / rlc_reg
    / rlc_ixy_reg
    / rlc_ixy
    / ex_sp_ixy
    / ex_afaf
    / rld
    / rrd
    / rrca
    / rrc_reg
    / rrc_ixy_reg
    / rrc_ixy
    / nop
    / jp_ixy
    / jp_hl
    / jp_zcpem_nn
    / jp_nzncpop_nn
    / jp
    / call_zcpem_nn
    / call_nzncpop_nn
    / call_nn
    / djnz
    / rla
    / rra
    / rl_reg
    / rl_ixy_reg
    / rl_ixy
    / rr_reg
    / rr_ixy_reg
    / rr_ixy
    / sla_reg
    / sla_ixy_reg
    / sla_ixy
    / sra_reg
    / sra_ixy_reg
    / sra_ixy
    / sll_reg
    / sll_ixy_reg
    / sll_ixy
    / srl_reg
    / srl_ixy_reg
    / srl_ixy
    / jr_nznc
    / jr_zc
    / jr
    / ld_addr_hla
    / cpl
    / daa
    / scf
    / ccf
    / halt
    / add_a_ixyhl
    / add_a_ixy
    / add_ixyhl
    / add_ixy
    / add_a_reg
    / add_a_n
    / add_reg
    / add_n
    / adc_a_ixyhl
    / adc_a_ixy
    / adc_ixyhl
    / adc_ixy
    / adc_a_reg
    / adc_a_n
    / adc_reg
    / adc_n
    / adc_hl_bcdehlsp
    / sub_a_ixyhl
    / sub_a_ixy
    / sub_ixyhl
    / sub_ixy
    / sub_a_reg
    / sub_a_n
    / sub_reg
    / sub_n
    / sbc_a_ixyhl
    / sbc_a_ixy
    / sbc_ixyhl
    / sbc_ixy
    / sbc_a_reg
    / sbc_a_n
    / sbc_reg
    / sbc_n
    / sbc_hl_bcdehlsp
    / and_a_ixyhl
    / and_a_ixy
    / and_ixyhl
    / and_ixy
    / and_a_reg
    / and_a_n
    / and_reg
    / and_n
    / xor_a_ixyhl
    / xor_a_ixy
    / xor_ixyhl
    / xor_ixy
    / xor_a_reg
    / xor_a_n
    / xor_reg
    / xor_n
    / or_a_ixyhl
    / or_a_ixy
    / or_ixyhl
    / or_ixy
    / or_a_reg
    / or_a_n
    / or_reg
    / or_n
    / cp_a_ixyhl
    / cp_a_ixy
    / cp_ixyhl
    / cp_ixy
    / cp_a_reg
    / cp_a_n
    / cp_reg
    / cp_n
    / rst_rst0
    / rst_rst8
    / retn
    / reti
    / ret_zcpem
    / ret_nzncpop
    / ret
    / out_c_cela
    / out_n_a
    / out_c_bdh
    / in_cela_c
    / in_a_n
    / in_bdh_c
    / exx
    / pfix
    / pfiy
    / ex_sp_hl
    / ex_de_hl
    / di
    / ei
    / neg
    / im_0
    / im_1
    / im_2
    / bit_n_reg
    / bit_n_ixy
    / res_n_reg
    / res_n_ixy
    / set_n_reg
    / set_n_ixy

push_ixy = 'push'i ws xy:ixiy {
    return res([xy, 0xe5]);
}
pop_ixy = 'pop'i ws xy:ixiy {
    return res([xy, 0xe1]);
}
ex_sp_ixy = 'ex'i ws '(' ws? 'sp'i ws? ')' ws? ',' xy:ixiy {
    return res([xy, 0xe3]);
}
ld_ix_ix = 'ld'i ws 'ix'i ws? ',' ws? 'ix'i {
    return res([0xdd, 0x29]);
}
ld_iy_iy = 'ld'i ws 'iy'i ws? ',' ws? 'iy'i {
    return res([0xfd, 0x29]);
}
ld_ixy_addr = 'ld'i ws xy:ixiy ws? ',' ws? '(' ws? expr:expr ws? ')' {
    return res([xy, 0x2a].concat(expr16(expr)));
}
ld_ixyaddr_n = 'ld'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? n:expr {
    return res([xy, 0x36].concat(expr8(expr)).concat(expr8(n)));
}
ld_ixy_nn = 'ld'i ws xy:ixiy ws? ',' ws? expr:expr {
    return res([xy, 0x21].concat(expr16(expr)));
}
add_a_ixyhl = 'add'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0x84 + xy[1]]);
}
add_a_ixy = 'add'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x86].concat(expr8(expr)));
}
add_ixyhl = 'add'i ws ws? xy:ixyhl {
    return res([xy[0], 0x84 + xy[1]]);
}
add_ixy = 'add'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x86].concat(expr8(expr)));
}
adc_a_ixyhl = 'adc'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0x8c + xy[1]]);
}
adc_a_ixy = 'adc'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x8e].concat(expr8(expr)));
}
adc_ixyhl = 'adc'i ws xy:ixyhl {
    return res([xy[0], 0x8c + xy[1]]);
}
adc_ixy = 'adc'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x8e].concat(expr8(expr)));
}
sub_a_ixyhl = 'sub'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0x94 + xy[1]]);
}
sub_a_ixy = 'sub'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x96].concat(expr8(expr)));
}
sub_ixyhl = 'sub'i ws  ws? xy:ixyhl {
    return res([xy[0], 0x94 + xy[1]]);
}
sub_ixy = 'sub'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x96].concat(expr8(expr)));
}
sbc_a_ixyhl = 'sbc'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0x9c + xy[1]]);
}
sbc_a_ixy = 'sbc'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x9e].concat(expr8(expr)));
}
sbc_ixyhl = 'sbc'i ws ws? xy:ixyhl {
    return res([xy[0], 0x9c + xy[1]]);
}
sbc_ixy = 'sbc'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x9e].concat(expr8(expr)));
}
and_a_ixyhl = 'and'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0xa4 + xy[1]]);
}
and_a_ixy = 'and'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xa6].concat(expr8(expr)));
}
and_ixyhl = 'and'i ws ws? xy:ixyhl {
    return res([xy[0], 0xa4 + xy[1]]);
}
and_ixy = 'and'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xa6].concat(expr8(expr)));
}
xor_a_ixyhl = 'xor'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0xac + xy[1]]);
}
xor_a_ixy = 'xor'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xae].concat(expr8(expr)));
}
xor_ixyhl = 'xor'i ws xy:ixyhl {
    return res([xy[0], 0xac + xy[1]]);
}
xor_ixy = 'xor'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xae].concat(expr8(expr)));
}
or_a_ixyhl = 'or'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0xb4 + xy[1]]);
}
or_a_ixy = 'or'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xb6].concat(expr8(expr)));
}
or_ixyhl = 'or'i ws ws? xy:ixyhl {
    return res([xy[0], 0xb4 + xy[1]]);
}
or_ixy = 'or'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xb6].concat(expr8(expr)));
}
cp_a_ixyhl = 'cp'i ws 'a' ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0xbc + xy[1]]);
}
cp_a_ixy = 'cp'i ws 'a' ws? ',' ws? '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xbe].concat(expr8(expr)));
}
cp_ixyhl = 'cp'i ws xy:ixyhl {
    return res([xy[0], 0xbc + xy[1]]);
}
cp_ixy = 'cp'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xbe].concat(expr8(expr)));
}
ld_bd_ixyhl = 'ld'i ws reg:bd ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0x44 + xy[1] + (reg << 4)]);
}
ld_cea_ixyhl = 'ld'i ws reg:cea ws? ',' ws? xy:ixyhl {
    return res([xy[0], 0x4c + xy[1] + (reg << 4)]);
}
ld_ixyhl_bcdehla = 'ld'i ws xy:ixyhl ws? ',' ws? reg:bcdehla {
    return res([xy[0], 0x60 + reg + (xy[1] << 3)]);
}
ld_ixyaddr_bcdehla = 'ld'i ws '(' xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0x70 + reg].concat(expr8(expr)));
}
ld_bdh_ixy = 'ld'i ws reg:bdh ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x46 + (reg << 4)].concat(expr8(expr)));
}
ld_cela_ixy = 'ld'i ws reg:cela ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x4e + (reg << 4)].concat(expr8(expr)));
}
ld_ixyh_n = 'ld'i ws xy:ixhiyh ws? ',' ws? expr:expr {
    return res([xy, 0x26].concat(expr8(expr)));
}
ld_ixyl_n = 'ld'i ws xy:ixliyl ws? ',' ws? expr:expr {
    return res([xy, 0x2e].concat(expr8(expr)));
}
ld_nn_ixy = 'ld'i ws '(' ws? expr:expr ws? ')' ws? ',' ws? xy:ixiy {
    return res([xy, 0x22].concat(expr16(expr)));
}
inc_ixyaddr = 'inc'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x34].concat(expr8(expr)));
}
inc_ixy = 'inc'i ws xy:ixiy {
    return res([xy, 0x23]);
}
inc_ixyh = 'inc'i ws xy:ixhiyh {
    return res([xy, 0x24]);
}
inc_ixyl = 'inc'i ws xy:ixliyl {
    return res([xy, 0x2c]);
}
dec_ixyaddr = 'dec'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0x35].concat(expr8(expr)));
}
dec_ixy = 'dec'i ws xy:ixiy {
    return res([xy, 0x2b]);
}
dec_ixyh = 'dec'i ws xy:ixhiyh {
    return res([xy, 0x25]);
}
dec_ixyl = 'dec'i ws xy:ixliyl {
    return res([xy, 0x2d]);
}
rlc_reg = 'rlc'i ws reg:reg {
    return res([0xcb, 0x00 + reg]);
}
rlc_ixy_reg = 'rlc'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x00 + reg].concat(expr8(expr)));
}
rlc_ixy = 'rlc'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x06].concat(expr8(expr)));
}
rrc_reg = 'rrc'i ws reg:reg {
    return res([0xcb, 0x08 + reg]);
}
rrc_ixy_reg = 'rrc'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x08 + reg].concat(expr8(expr)));
}
rrc_ixy = 'rrc'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x0e].concat(expr8(expr)));
}
rl_reg = 'rl'i ws reg:reg {
    return res([0xcb, 0x10 + reg]);
}
rl_ixy_reg = 'rl'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x10 + reg].concat(expr8(expr)));
}
rl_ixy = 'rl'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x16].concat(expr8(expr)));
}
rr_reg = 'rr'i ws reg:reg {
    return res([0xcb, 0x18 + reg]);
}
rr_ixy_reg = 'rr'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x18 + reg].concat(expr8(expr)));
}
rr_ixy = 'rr'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x1e].concat(expr8(expr)));
}
sla_reg = 'sla'i ws reg:reg {
    return res([0xcb, 0x20 + reg]);
}
sla_ixy_reg = 'sla'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x20 + reg].concat(expr8(expr)));
}
sla_ixy = 'sla'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x26].concat(expr8(expr)));
}
sra_reg = 'sra'i ws reg:reg {
    return res([0xcb, 0x28 + reg]);
}
sra_ixy_reg = 'sra'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x28 + reg].concat(expr8(expr)));
}
sra_ixy = 'sra'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x2e].concat(expr8(expr)));
}
sll_reg = 'sll'i ws reg:reg {
    return res([0xcb, 0x30 + reg]);
}
sll_ixy_reg = 'sll'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x30 + reg].concat(expr8(expr)));
}
sll_ixy = 'sll'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x36].concat(expr8(expr)));
}
srl_reg = 'srl'i ws reg:reg {
    return res([0xcb, 0x38 + reg]);
}
srl_ixy_reg = 'srl'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([xy, 0xcb, 0x38 + reg].concat(expr8(expr)));
}
srl_ixy = 'srl'i ws '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
    return res([xy, 0xcb, 0x3e].concat(expr8(expr)));
}
bit_n_reg = 'bit'i ws n:n0246 ws? ',' ws? reg:reg {
        return res([0xcb, 0x40 + reg + (n << 4)]);
    }
    / 'bit'i ws n:n1357 ws? ',' ws? reg:reg {
        return res([0xcb, 0x48 + reg + (n << 4)]);
    }
bit_n_ixy = 'bit'i ws n:n0246 ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
        return res([xy, 0xcb, 0x46 + (n << 4)].concat(expr8(expr)));
    }
    / 'bit'i ws n:n1357 ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
        return res([xy, 0xcb, 0x4e + (n << 4)].concat(expr8(expr)));
    }
res_n_reg = 'res'i ws n:n0246 ws? ',' ws? reg:reg {
        return res([0xcb, 0x80 + reg + (n << 4)]);
    }
    / 'res'i ws n:n1357 ws? ',' ws? reg:reg {
        return res([0xcb, 0x88 + reg + (n << 4)]);
    }
res_n_ixy = 'res'i ws n:n0246 ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
        return res([xy, 0xcb, 0x86 + (n << 4)].concat(expr8(expr)));
    }
    / 'res'i ws n:n1357 ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
        return res([xy, 0xcb, 0x8e + (n << 4)].concat(expr8(expr)));
    }
set_n_reg = 'set'i ws n:n0246 ws? ',' ws? reg:reg {
        return res([0xcb, 0xc0 + reg + (n << 4)]);
    }
    / 'set'i ws n:n1357 ws? ',' ws? reg:reg {
        return res([0xcb, 0xc8 + reg + (n << 4)]);
    }
set_n_ixy = 'set'i ws n:n0246 ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
        return res([xy, 0xcb, 0xc6 + (n << 4)].concat(expr8(expr)));
    }
    / 'set'i ws n:n1357 ws? ',' ws? '(' ws? xy:ixiy ws? '+' ws? expr:expr ws? ')' {
        return res([xy, 0xcb, 0xce + (n << 4)].concat(expr8(expr)));
    }
ex_afaf = 'ex'i ws 'af'i ws? ',' ws? 'af\''i {
    return res([0x08]);
}
ex_sp_hl = 'ex'i ws '(' ws? 'sp'i ws? ')' ws? ',' ws? 'hl'i {
    return res([0xe3]);
}
ex_de_hl = 'ex'i ws 'de'i ws? ',' ws? 'hl'i {
    return res([0xeb]);
}
im_0 = 'im'i ws '0' {
    return res([0xed, 0x46]);
}
im_1 = 'im'i ws '1' {
    return res([0xed, 0x56]);
}
im_2 = 'im'i ws '2' {
    return res([0xed, 0x5e]);
}
ldir = 'ldir'i {
    return res([0xed, 0xb0]);
}
ldi = 'ldi'i {
    return res([0xed, 0xa0]);
}
cpir = 'cpir'i {
    return res([0xed, 0xb1]);
}
cpi = 'cpi'i {
    return res([0xed, 0xa1]);
}
inir = 'inir'i {
    return res([0xed, 0xb2]);
}
ini = 'ini'i {
    return res([0xed, 0xa2]);
}
otir = 'otir'i {
    return res([0xed, 0xb3]);
}
outi = 'outi'i {
    return res([0xed, 0xa3]);
}
lddr = 'lddr'i {
    return res([0xed, 0xb8]);
}
ldd = 'ldd'i {
    return res([0xed, 0xa8]);
}
cpdr = 'cpdr'i {
    return res([0xed, 0xb9]);
}
cpd = 'cpd'i {
    return res([0xed, 0xa9]);
}
indr = 'indr'i {
    return res([0xed, 0xba]);
}
ind = 'ind'i {
    return res([0xed, 0xaa]);
}
otdr = 'otdr'i {
    return res([0xed, 0xbb]);
}
outd = 'outd'i {
    return res([0xed, 0xab]);
}
halt = 'halt'i {
    return res([0x76]);
}
pfix = 'pfix'i {
    return res([0xdd]);
}
pfiy = 'pfiy'i {
    return res([0xfd]);
}
di = 'di'i {
    return res([0xf3]);
}
ei = 'ei'i {
    return res([0xfb]);
}
neg = 'neg'i {
    return res([0xed, 0x44]);
}
retn = 'retn'i {
    return res([0xed, 0x45]);
}
reti = 'reti'i {
    return res([0xed, 0x4d]);
}
exx = 'exx'i {
    return res([0xd9]);
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
rld = 'rld'i {
    return res([0xed, 0x6f]);
}
rrd = 'rrd'i {
    return res([0xed, 0x67]);
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
ld_sp_ixy = 'ld'i ws 'sp'i ws? ',' ws? xy:ixiy {
    return res([xy, 0xf9]);
}
ld_sp_hl = 'ld'i ws 'sp'i ws? ',' ws? 'hl'i {
    return res([0xf9]);
}
ld_i_a = 'ld'i ws 'i'i ws? ',' ws? 'a'i {
    return res([0xed, 0x47]);
}
ld_a_i = 'ld'i ws 'a'i ws? ',' ws? 'i'i {
    return res([0xed, 0x57]);
}
jp_ixy = 'jp'i ws '(' ws? xy:ixiy ws? ')' {
    return res([xy, 0xe9]);
}
jp_hl = 'jp'i ws '(' ws? 'hl'i ws? ')' {
    return res([0xe9]);
}
out_n_a = 'out'i ws '(' ws? expr:expr ws? ')' ws? ',' ws? 'a' {
    return res([0xd3].concat(expr8(expr)));
}
out_c_bdh = 'out'i ws '(' ws? 'c' ws? ')' ws? ',' ws? reg:bdh {
    return res([0xed, 0x41 | (reg << 4)]);
}
out_c_cela = 'out'i ws '(' ws? 'c' ws? ')' ws? ',' ws? reg:cela {
    return res([0xed, 0x49 | (reg << 4)]);
}
in_a_n = 'in'i ws 'a' ws? ',' ws? '(' ws? expr:expr ws? ')' {
    return res([0xdb].concat(expr8(expr)));
}
in_bdh_c = 'in'i ws reg:bdh ws? ',' ws? '(' ws? 'c' ws? ')' {
    return res([0xed, 0x40 | (reg << 4)]);
}
in_cela_c = 'in'i ws reg:cela ws? ',' ws? '(' ws? 'c'i ws? ')' {
    return res([0xed, 0x48 | (reg << 4)]);
}
add_a_n = 'add'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xc6].concat(expr8(expr)));
}
add_n = 'add'i ws expr:expr {
    return res([0xc6].concat(expr8(expr)));
}
adc_a_n = 'adc'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xce].concat(expr8(expr)));
}
adc_n = 'adc'i ws ws? expr:expr {
    return res([0xce].concat(expr8(expr)));
}
adc_hl_bcdehlsp = 'adc'i ws 'hl'i ws? ',' ws? reg:bcdehlsp {
    return res([0xed, 0x4a | (reg << 4)]);
}
sub_a_n = 'sub'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xd6].concat(expr8(expr)));
}
sub_n = 'sub'i ws expr:expr {
    return res([0xd6].concat(expr8(expr)));
}
and_a_n = 'and'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xe6].concat(expr8(expr)));
}
and_n = 'and'i ws expr:expr {
    return res([0xe6].concat(expr8(expr)));
}
cp_a_n = 'cp'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xfe].concat(expr8(expr)));
}
cp_n = 'cp'i ws expr:expr {
    return res([0xfe].concat(expr8(expr)));
}
or_a_n = 'or'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xf6].concat(expr8(expr)));
}
or_n = 'or'i ws expr:expr {
    return res([0xf6].concat(expr8(expr)));
}
xor_a_n = 'xor'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xee].concat(expr8(expr)));
}
xor_n = 'xor'i ws expr:expr {
    return res([0xee].concat(expr8(expr)));
}
sbc_a_n = 'sbc'i ws 'a'i ws? ',' ws? expr:expr {
    return res([0xde].concat(expr8(expr)));
}
sbc_n = 'sbc'i ws ws? expr:expr {
    return res([0xde].concat(expr8(expr)));
}
sbc_hl_bcdehlsp = 'sbc'i ws 'hl'i ws? ',' ws? reg:bcdehlsp {
    return res([0xed, 0x42 | (reg << 4)])
}
add_a_reg = 'add'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
    return res([0x80 | reg]);
}
add_reg = 'add'i ws reg:reg ![a-z0-9_]i {
    return res([0x80 | reg]);
}
adc_a_reg = 'adc'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
    return res([0x88 | reg]);
}
adc_reg = 'adc'i ws reg:reg ![a-z0-9_]i {
    return res([0x88 | reg]);
}
sub_a_reg = 'sub'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
        return res([0x90 | reg]);
    }
sub_reg = 'sub'i ws reg:reg ![a-z0-9_]i {
        return res([0x90 | reg]);
    }
sbc_a_reg = 'sbc'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
    return res([0x98 | reg]);
}
sbc_reg = 'sbc'i ws reg:reg ![a-z0-9_]i {
    return res([0x98 | reg]);
}
and_a_reg = 'and'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
        return res([0xa0 | reg]);
    }
and_reg = 'and'i ws reg:reg ![a-z0-9_]i {
        return res([0xa0 | reg]);
    }
xor_a_reg = 'xor'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
        return res([0xa8 | reg]);
    }
xor_reg = 'xor'i ws reg:reg ![a-z0-9_]i {
        return res([0xa8 | reg]);
    }
or_a_reg = 'or'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
        return res([0xb0 | reg]);
    }
or_reg = 'or'i ws reg:reg ![a-z0-9_]i {
        return res([0xb0 | reg]);
    }
cp_a_reg = 'cp'i ws 'a'i ws? ',' ws? reg:reg ![a-z0-9_]i {
        return res([0xb8 | reg]);
    }
cp_reg = 'cp'i ws reg:reg  ![a-z0-9_]i ![a-z0-9_]i {
        return res([0xb8 | reg]);
    }
ret_nzncpop = 'ret'i ws cond:nzncpop {
    return res([0xc0 | (cond << 4)]);
}
jp_nzncpop_nn = 'jp'i ws cond:nzncpop ws? ',' ws? expr:expr {
    return res([0xc2 | (cond << 4)].concat(expr16(expr)));
}
call_nzncpop_nn = 'call'i ws cond:nzncpop ws? ',' ws? expr:expr {
    return res([0xc4 | (cond << 4)].concat(expr16(expr)));
}
jp_zcpem_nn = 'jp'i ws cond:zcpem ws? ',' ws? expr:expr {
    return res([0xca | (cond << 4)].concat(expr16(expr)));
}
call_zcpem_nn = 'call'i ws cond:zcpem ws? ',' ws? expr:expr {
    return res([0xcc | (cond << 4)].concat(expr16(expr)));
}
call_nn = 'call'i ws expr:expr {
    return res([0xcd].concat(expr16(expr)));
}
ret_zcpem = 'ret'i ws cond:zcpem {
    return res([0xc8 | (cond << 4)]);
}
ret = 'ret'i {
    return res([0xc9]);
}
ld_r_a = 'ld'i ws 'r'i ws? ',' ws? 'a' {
    return res([0xed, 0x4f]);
}
ld_a_r = 'ld'i ws 'a'i ws? ',' ws? 'r' {
    return res([0xed, 0x5f]);
}
ld_r_r = 'ld'i ws reg1:reg ws? ',' ws? reg2:reg ![a-z0-9_]i ! {
    return reg1 === 6 && reg2 === 6;
    } {
    return res([0x40 | (reg1 << 3) | reg2]);
}
ld_bcdehlsp_nn = 'ld'i ws reg:bcdehlsp ws? ',' ws? expr:expr {
    return res([0x01 | (reg << 4)].concat(expr16(expr)));
}
ld_nn_bcdesp = 'ld'i ws '(' expr:expr ')' ws? ',' ws? reg:bcdesp {
    return res([0xed, 0x43 | (reg << 4)].concat(expr16(expr)));
}
ld_bcdesp_nn = 'ld'i ws reg:bcdesp ws? ',' ws? '(' expr:expr ')' {
    return res([0xed, 0x4b | (reg << 4)].concat(expr16(expr)));
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
add_ixy_bcdesp = 'add'i ws xy:ixiy ws? ',' ws? reg:bcdesp {
    return res([xy, 0x09 | (reg << 4)]);
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
    return res([0xC5 | (reg << 4)]);
}
pop_bcdehlaf = 'pop'i ws reg:bcdehlaf {
    return res([0xC1 | (reg << 4)]);
}
jp = 'jp'i ws expr:expr {
    return res([0xC3].concat(expr16(expr)));
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
rst_rst0 = 'rst'i ws rst:rst0 {
    return res([0xc7 | rst << 4]);
}
rst_rst8 = 'rst'i ws rst:rst8 {
    return res([0xcf | rst << 4]);
}

reg = 'b'i { return 0; }
    / 'c'i { return 1; }
    / 'd'i { return 2; }
    / 'e'i { return 3; }
    / 'h'i { return 4; }
    / 'l'i { return 5; }
    / '(hl)'i { return 6; }
    / 'a'i { return 7; }

bcdehla = 'b'i { return 0; }
    / 'c'i { return 1; }
    / 'd'i { return 2; }
    / 'e'i { return 3; }
    / 'h'i { return 4; }
    / 'l'i { return 5; }
    / 'a'i { return 7; }

bdhhl = 'b'i { return 0; }
    / 'd'i { return 1; }
    / 'h'i { return 2; }
    / '(hl)'i { return 3; }

bdh = 'b'i { return 0; }
    / 'd'i { return 1; }
    / 'h'i { return 2; }

bd = 'b'i { return 0; }
    / 'd'i { return 1; }

cela = 'c'i { return 0; }
    / 'e'i { return 1; }
    / 'l'i { return 2; }
    / 'a'i { return 3; }

cea = 'c'i { return 0; }
    / 'e'i { return 1; }
    / 'a'i { return 3; }

bcdehlsp = 'bc'i { return 0; }
    / 'de'i { return 1; }
    / 'hl'i { return 2; }
    / 'sp'i { return 3; }

bcdesp = 'bc'i { return 0; }
    / 'de'i { return 1; }
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

nzncpop = 'nz'i { return 0; }
    / 'nc'i { return 1; }
    / 'po'i { return 2; }
    / 'p'i { return 3; }

zcpem = 'z'i { return 0; }
    / 'c'i { return 1; }
    / 'pe'i { return 2; }
    / 'm'i { return 3; }

hla = 'hl'i { return 0; }
    / 'a'i { return 1; }

rst0 = '00h'i { return 0; }
    / '$00' { return 0; }
    / '10h'i { return 1; }
    / '$10' { return 1; }
    / '20h'i { return 2; }
    / '$20' { return 2; }
    / '30h'i { return 3; }
    / '$30' { return 3; }

rst8 = '08h'i { return 0; }
    / '$08' { return 0; }
    / '18h'i { return 1; }
    / '$18' { return 1; }
    / '28h'i { return 2; }
    / '$28' { return 2; }
    / '38h'i { return 3; }
    / '$38' { return 3; }

n0246 = '0' { return 0; }
    / '2' { return 1; }
    / '4' { return 2; }
    / '6' { return 3; }

n1357 = '1' { return 0; }
    / '3' { return 1; }
    / '5' { return 2; }
    / '7' { return 3; }

ixiy = 'ix'i { return 0xdd; }
    / 'iy'i { return 0xfd; }

ixhiyh = 'ixh'i { return 0xdd; }
    / 'iyh'i { return 0xfd; }

ixliyl = 'ixl'i { return 0xdd; }
    / 'iyl'i { return 0xfd; }

ixyhl = 'ixh'i { return [0xdd, 0]; }
    / 'ixl'i { return [0xdd, 1]; }
    / 'iyh'i { return [0xfd, 0]; }
    / 'iyl'i { return [0xfd, 1]; }

ws = [ \t]+
wsnl = [ \t\r\n]+

expr = t1:expr1 {
    if (t1.length === 0) {
        return Expr.parse(text(), {});
    }
    return {
        expression: text(),
        vars: t1,
        location: loc()
    }
}
expr1 = t1:ternary {
    return t1;
}
ternary = t1:logicalor t2:(ws? '?' ws? t2:expr1 ws? ':' ws? t3:expr1)?  { 
    return  t1.concat(exprVars(t2, [3, 7]));
}
logicalor = t1:logicaland t2:(ws? '||' ws? logicaland)*  {
    return  t1.concat(exprVars(t2, [3]));
}
logicaland = t1:bitwiseor t2:(ws? '&&' ws? bitwiseor)*  {
    return  t1.concat(exprVars(t2, [3]));
}
bitwiseor = t1:bitwisexor t2:(ws? ('|'/('or'i &(ws/'('))) ws? bitwisexor)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
bitwisexor = t1:bitwiseand t2:(ws? ('^'/('xor'i &(ws/'('))) ws? bitwiseand)* { 
    return  t1.concat(exprVars(t2, [3]));
}
bitwiseand = t1:equal t2:(ws? ('&'/('and'i &(ws/'('))) ws? equal)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
equal = t1:greaterless t2:(ws? ('=='/'='/'!='/'<>'/('eq'i &(ws/'('))/('ne'i &(ws/'('))) ws? greaterless)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
greaterless = t1:shift t2:(ws? ('<='/'>='/'<'/'>'/('le'i &(ws/'('))/('lt'i &(ws/'('))/('ge'i &(ws/'('))/('gt'i &(ws/'('))) ws? shift)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
shift = t1:plusminus t2:(ws? ('<<'/'>>'/('shl'i &(ws/'('))/('shr'i &(ws/'('))) ws? plusminus)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
plusminus = t1:term t2:(ws? [+-] ws? term)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
term = t1:unary t2:(ws? [*/%] ws? unary)*  { 
    return  t1.concat(exprVars(t2, [3]));
}
unary = operator:([!~+-]/('not'i &(ws/'(')))? ws? expr:factor  { 
    return expr;
}
factor = '(' expr:expr1 ')'  { 
        return expr;
    }
    / f:function { 
        return f;
    }
    / '$' !([0-9a-z]i) {
        return ['$']
    }
    / number_literal { 
        return [];
    }
    / label:label { 
        return [label];
    }
    / string { 
        return [];
    }
function = 'min('i ws? expr1:expr1 ws? ',' ws? expr2:expr1 ws? ')'  { 
        return expr1.concat(expr2);
    }
    / 'max('i ws? expr1:expr1 ws? ',' ws? expr2:expr1 ws? ')' { 
        return expr1.concat(expr2);
    }
number_literal = binary_literal { return []; }
    / hex_literal { return []; }
    / decimal_literal { return []; }
    / octal_literal { return []; }
decimal_literal = [0-9][0-9_]*  { return []; }
hex_literal = '$' [0-9a-f]i[0-9a-f_]i*  { return []; }
    / [0-9][0-9a-f_]i* 'h'  { return []; }
binary_literal = '%' [01][01_]*  { return []; }
    / [01][01_]* 'b'  { return []; }
octal_literal = [0-7][0-7_]* 'o'  { return []; }
