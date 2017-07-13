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
    / equ
    / macro
    / endm
    / block
    / endblock
    // etc

comment = ';' [^\n]*

org = '.'? 'org'i ws expr:expr {
    return {
        org: expr
    }
}

macro = '.'? 'macro'i ws label

endm = '.'? 'endm'i

equ = '.'? 'equ'i ws expr:expr {
    return {
        equ: expr
    }
}

db = '.'? ('db'i / 'defb'i) ws? dbytes:dbytes {
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

block = '.block'i {
    return {
        block: true
    };
}

endblock = '.endblock'i {
    return {
        endblock: true
    };
}

labeldef = label:label ':' {
    return {
        label: label
    }
}

label = !'bc'i !'de'i !'hl'i !'sp'i !'af'i ([a-zA-Z][a-zA-Z0-9]*) {
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
    / ld_sp_hl
    / ld_i_a
    / ld_a_i
    / ld_r_a
    / ld_a_r
    / ld_r_r
    / ld_bcde_a
    / ld_a_bcde
    / ld_hla_addr
    / ld_bcdesp_nn
    / ld_bcdehlsp_nn
    / add_hl_bcdehlsp
    / inc_bcdehlsp
    / dec_bcdehlsp
    / inc_bdhhl
    / inc_cela
    / ld_bdhhl_n
    / ld_cela_n
    / ld_nn_bcdesp
    / dec_bdhhl
    / dec_cela
    / push_bcdehlaf
    / pop_bcdehlaf
    / rlca
    / rlc_reg
    / rlc_ix_reg
    / rlc_ix
    / ex_afaf
    / rld
    / rrd
    / rrca
    / rrc_reg
    / rrc_ix_reg
    / rrc_ix
    / nop
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
    / rl_ix_reg
    / rl_ix
    / rr_reg
    / rr_ix_reg
    / rr_ix
    / sla_reg
    / sla_ix_reg
    / sla_ix
    / sra_reg
    / sra_ix_reg
    / sra_ix
    / sll_reg
    / sll_ix_reg
    / sll_ix
    / srl_reg
    / srl_ix_reg
    / srl_ix
    / jr_nznc
    / jr_zc
    / jr
    / ld_addr_hla
    / cpl
    / daa
    / scf
    / ccf
    / halt
    / add_a_reg
    / add_a_n
    / adc_a_reg
    / adc_a_n
    / adc_hl_bcdehlsp
    / sub_a_reg
    / sub_a_n
    / sub_reg
    / sub_n
    / sbc_a_reg
    / sbc_a_n
    / sbc_hl_bcdehlsp
    / and_a_reg
    / and_a_n
    / and_reg
    / and_n
    / xor_a_reg
    / xor_a_n
    / xor_reg
    / xor_n
    / or_a_reg
    / or_a_n
    / or_reg
    / or_n
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
    / bit_n_ix
    / res_n_reg
    / res_n_ix
    / set_n_reg
    / set_n_ix

rlc_reg = 'rlc'i ws reg:reg {
    return res([0xcb, 0x00 + reg]);
}
rlc_ix_reg = 'rlc'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x00 + reg].concat(expr8(expr)));
}
rlc_ix = 'rlc'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x06].concat(expr8(expr)));
}
rrc_reg = 'rrc'i ws reg:reg {
    return res([0xcb, 0x08 + reg]);
}
rrc_ix_reg = 'rrc'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x08 + reg].concat(expr8(expr)));
}
rrc_ix = 'rrc'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x0e].concat(expr8(expr)));
}
rl_reg = 'rl'i ws reg:reg {
    return res([0xcb, 0x10 + reg]);
}
rl_ix_reg = 'rl'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x10 + reg].concat(expr8(expr)));
}
rl_ix = 'rl'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x16].concat(expr8(expr)));
}
rr_reg = 'rr'i ws reg:reg {
    return res([0xcb, 0x18 + reg]);
}
rr_ix_reg = 'rr'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x18 + reg].concat(expr8(expr)));
}
rr_ix = 'rr'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x1e].concat(expr8(expr)));
}
sla_reg = 'sla'i ws reg:reg {
    return res([0xcb, 0x20 + reg]);
}
sla_ix_reg = 'sla'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x20 + reg].concat(expr8(expr)));
}
sla_ix = 'sla'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x26].concat(expr8(expr)));
}
sra_reg = 'sra'i ws reg:reg {
    return res([0xcb, 0x28 + reg]);
}
sra_ix_reg = 'sra'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x28 + reg].concat(expr8(expr)));
}
sra_ix = 'sra'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x2e].concat(expr8(expr)));
}
sll_reg = 'sll'i ws reg:reg {
    return res([0xcb, 0x30 + reg]);
}
sll_ix_reg = 'sll'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x30 + reg].concat(expr8(expr)));
}
sll_ix = 'sll'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x36].concat(expr8(expr)));
}
srl_reg = 'srl'i ws reg:reg {
    return res([0xcb, 0x38 + reg]);
}
srl_ix_reg = 'srl'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' ws? ',' ws? reg:bcdehla {
    return res([0xdd, 0xcb, 0x38 + reg].concat(expr8(expr)));
}
srl_ix = 'srl'i ws '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
    return res([0xdd, 0xcb, 0x3e].concat(expr8(expr)));
}
bit_n_reg = 'bit'i ws n:n0246 ws? ',' ws? reg:reg {
        return res([0xcb, 0x40 + reg + (n << 4)]);
    }
    / 'bit'i ws n:n1357 ws? ',' ws? reg:reg {
        return res([0xcb, 0x48 + reg + (n << 4)]);
    }
bit_n_ix = 'bit'i ws n:n0246 ws? ',' ws? '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
        return res([0xdd, 0xcb, 0x46 + (n << 4)].concat(expr8(expr)));
    }
    / 'bit'i ws n:n1357 ws? ',' ws? '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
        return res([0xdd, 0xcb, 0x4e + (n << 4)].concat(expr8(expr)));
    }
res_n_reg = 'res'i ws n:n0246 ws? ',' ws? reg:reg {
        return res([0xcb, 0x80 + reg + (n << 4)]);
    }
    / 'res'i ws n:n1357 ws? ',' ws? reg:reg {
        return res([0xcb, 0x88 + reg + (n << 4)]);
    }
res_n_ix = 'res'i ws n:n0246 ws? ',' ws? '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
        return res([0xdd, 0xcb, 0x86 + (n << 4)].concat(expr8(expr)));
    }
    / 'res'i ws n:n1357 ws? ',' ws? '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
        return res([0xdd, 0xcb, 0x8e + (n << 4)].concat(expr8(expr)));
    }
set_n_reg = 'set'i ws n:n0246 ws? ',' ws? reg:reg {
        return res([0xcb, 0xc0 + reg + (n << 4)]);
    }
    / 'set'i ws n:n1357 ws? ',' ws? reg:reg {
        return res([0xcb, 0xc8 + reg + (n << 4)]);
    }
set_n_ix = 'set'i ws n:n0246 ws? ',' ws? '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
        return res([0xdd, 0xcb, 0xc6 + (n << 4)].concat(expr8(expr)));
    }
    / 'set'i ws n:n1357 ws? ',' ws? '(' ws? 'ix'i ws? '+' ws? expr:expr ws? ')' {
        return res([0xdd, 0xcb, 0xce + (n << 4)].concat(expr8(expr)));
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
ld_sp_hl = 'ld'i ws 'sp'i ws? ',' ws? 'hl'i {
    return res([0xf9]);
}
ld_i_a = 'ld'i ws 'i'i ws? ',' ws? 'a'i {
    return res([0xed, 0x47]);
}
ld_a_i = 'ld'i ws 'a'i ws? ',' ws? 'i'i {
    return res([0xed, 0x57]);
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
adc_a_n = 'adc'i ws 'a'i ws? ',' ws? expr:expr {
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
sbc_hl_bcdehlsp = 'sbc'i ws 'hl'i ws? ',' ws? reg:bcdehlsp {
    return res([0xed, 0x42 | (reg << 4)])
}
add_a_reg = 'add'i ws 'a'i ws? ',' ws? reg:reg {
    return res([0x80 | reg]);
}
adc_a_reg = 'adc'i ws 'a'i ws? ',' ws? reg:reg {
    return res([0x88 | reg]);
}
sub_a_reg = 'sub'i ws 'a'i ws? ',' ws? reg:reg {
        return res([0x90 | reg]);
    }
sub_reg = 'sub'i ws reg:reg {
        return res([0x90 | reg]);
    }
sbc_a_reg = 'sbc'i ws 'a'i ws? ',' ws? reg:reg {
    return res([0x98 | reg]);
}
and_a_reg = 'and'i ws 'a'i ws? ',' ws? reg:reg {
        return res([0xa0 | reg]);
    }
and_reg = 'and'i ws reg:reg {
        return res([0xa0 | reg]);
    }
xor_a_reg = 'xor'i ws 'a'i ws? ',' ws? reg:reg {
        return res([0xa8 | reg]);
    }
xor_reg = 'xor'i ws reg:reg {
        return res([0xa8 | reg]);
    }
or_a_reg = 'or'i ws 'a'i ws? ',' ws? reg:reg {
        return res([0xb0 | reg]);
    }
or_reg = 'or'i ws reg:reg {
        return res([0xb0 | reg]);
    }
cp_a_reg = 'cp'i ws 'a'i ws? ',' ws? reg:reg {
        return res([0xb8 | reg]);
    }
cp_reg = 'cp'i ws reg:reg {
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
ld_r_r = 'ld'i ws reg1:reg ws? ',' ws? reg2:reg ! {
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

cela = 'c'i { return 0; }
    / 'e'i { return 1; }
    / 'l'i { return 2; }
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
