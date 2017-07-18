{
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
}

start = expr:expr {
    return {
        text: text(),
        vars: expr 
    }
}

ws = [ \t]+

expr = t1:ternary {
    return t1;
}
ternary = t1:logicalor t2:(ws? '?' ws? t2:expr ws? ':' ws? t3:expr)?  { 
    return  t1.concat(exprVars(t2, [3, 7]));
 }
logicalor = t1:logicaland t2:(ws? '||' ws? logicaland)*  {
    return  t1.concat(exprVars(t2, [3]));
}
logicaland = t1:bitwiseor t2:(ws? '&&' ws? bitwiseor)*  {
    return  t1.concat(exprVars(t2, [3]));
 }
bitwiseor = t1:bitwisexor t2:(ws? ('|'/'or'i) ws? bitwisexor)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
bitwisexor = t1:bitwiseand t2:(ws? ('^'/'xor'i) ws? bitwiseand)* { 
    return  t1.concat(exprVars(t2, [3]));
 }
bitwiseand = t1:equal t2:(ws? ('&'/'and'i) ws? equal)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
equal = t1:greaterless t2:(ws? ('=='/'='/'!='/'<>'/'eq'/'ne') ws? greaterless)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
greaterless = t1:shift t2:(ws? ('<='/'>='/'<'/'>'/'lte'/'lt'/'gte'/'gt') ws? shift)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
shift = t1:plusminus t2:(ws? ('<<'/'>>'/'shl'/'shr') ws? plusminus)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
plusminus = t1:term t2:(ws? [+-] ws? term)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
term = t1:unary t2:(ws? [*/%] ws? unary)*  { 
    return  t1.concat(exprVars(t2, [3]));
 }
unary = operator:[!~+-]? expr:factor  { 
    return expr;
 }
factor = '(' expr:expr ')'  { 
    return expr;
 }
    / f:function { 
        return f;
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
function = 'min('i ws? expr1:expr ws? ',' ws? expr2:expr ws? ')'  { 
    return expr1.concat(expr2);
 }
    / 'max('i ws? expr1:expr ws? ',' ws? expr2:expr ws? ')' { 
    return expr1.concat(expr2);
}
number_literal = binary_literal { return []; }
    / hex_literal { return []; }
    / decimal_literal { return []; }
    / octal_literal { return []; }
decimal_literal = [0-9][0-9_]*  { return []; }
hex_literal = '$' [0-9a-f]i[0-9a-f_]i*  { return []; }
    / [0-9][0-9a-f_]i* 'h'  { return []; }
binary_literal = [01][01_]* 'b'  { return []; }
octal_literal = [0-7][0-7_]* 'o'  { return []; }
string = '"' str:(double_string_char*) '"' { return []; }
    / "'" str:(single_string_char*) "'" { return []; }
double_string_char = !('"' / "\\" / "\n") . { return []; }
    / "\\" seq:escape_sequence { return []; }
single_string_char = !("'" / "\\" / "\n") . { return []; }
    / "\\" seq:escape_sequence { return []; }
escape_sequence = char_escape_sequence { return []; }
    / "0" ![0-9] { return []; }
    / hex_escape_sequence { return []; }
char_escape_sequence = single_esc_char { return []; }
    / non_escape_char { return []; }
single_esc_char = "'" { return []; }
    / '"' { return []; }
    / "b" { return []; }
    / "f" { return []; }
    / "n" { return []; }
    / "r" { return []; }
    / "t" { return []; }
    / "v" { return []; }
non_escape_char = !(escape_char / "\n") . { return []; }
escape_char = single_esc_char { return []; }
    / [0-9] { return []; }
    / "x" { return []; }
    / "u" { return []; }
hex_escape_sequence = "x" digits:$([0-9a-f]i [0-9a-f]i)  { return []; }
label = text1:[a-zA-Z] text2:[a-zA-Z0-9_]* !{
        const text = text1 + text2.join('');
        return (text === 'bc' || text === 'de' || text === 'hl' || text === 'sp');
    } {
        return text1 + text2.join('')
    }
