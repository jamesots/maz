{

}

start = expr

labeldef = label:label ':' 

label = text1:[a-zA-Z] text2:[a-zA-Z0-9_]* !{
        const text = text1 + text2.join('');
        return (text === 'bc' || text === 'de' || text === 'hl' || text === 'sp');
    }

ws = [ \t]+
wsnl = [ \t\r\n]+

expr = ternary { return text(); }

ternary = t1:logicalor t2:(ws? '?' ws? t2:expr ws? ':' ws? t3:expr)?  { return text(); }

logicalor = t1:logicaland t2:(ws? '||' ws? logicaland)*  { return text(); }

logicaland = t1:bitwiseor t2:(ws? '&&' ws? bitwiseor)*  { return text(); }

bitwiseor = t1:bitwisexor t2:(ws? ('|'/'or'i) ws? bitwisexor)*  { return text(); }

bitwisexor = t1:bitwiseand t2:(ws? ('^'/'xor'i) ws? bitwiseand)* { return text(); }

bitwiseand = t1:equal t2:(ws? ('&'/'and'i) ws? equal)*  { return text(); }

equal = t1:greaterless t2:(ws? ('=='/'='/'!='/'<>') ws? greaterless)*  { return text(); }

greaterless = t1:shift t2:(ws? ('<='/'>='/'<'/'>') ws? shift)*  { return text(); }

shift = t1:plusminus t2:(ws? ('<<'/'>>') ws? plusminus)*  { return text(); }

plusminus = t1:term t2:(ws? [+-] ws? term)*  { return text(); }

term = t1:unary t2:(ws? [*/%] ws? unary)*  { return text(); }

factor = '(' expr:expr ')'  { return text(); }
    / function { return text(); }
    / number_literal { return text(); }
    / label { return text(); }
    / string { return text(); }

function = 'min('i ws? expr1:expr ws? ',' ws? expr2:expr ws? ')'  { return text(); }
    / 'max('i ws? expr1:expr ws? ',' ws? expr2:expr ws? ')' { return text(); }

unary = operator:[!~+-]? expr:factor  { return text(); }

number_literal = binary_literal { return text(); }
    / hex_literal { return text(); }
    / decimal_literal { return text(); }
    / octal_literal { return text(); }

decimal_literal = [0-9][0-9_]*  { return text(); }
hex_literal = '$' [0-9a-f]i[0-9a-f_]i*  { return text(); }
    / [0-9][0-9a-f_]i* 'h'  { return text(); }
binary_literal = [01][01_]* 'b'  { return text(); }
octal_literal = [0-7][0-7_]* 'o'  { return text(); }

string = '"' str:(double_string_char*) '"' { return text(); }
    / "'" str:(single_string_char*) "'" { return text(); }

double_string_char = !('"' / "\\" / "\n") . { return text(); }
    / "\\" seq:escape_sequence { return text(); }

single_string_char = !("'" / "\\" / "\n") . { return text(); }
    / "\\" seq:escape_sequence { return text(); }

escape_sequence = char_escape_sequence { return text(); }
    / "0" ![0-9] { return text(); }
    / hex_escape_sequence { return text(); }

char_escape_sequence = single_esc_char { return text(); }
    / non_escape_char { return text(); }

single_esc_char = "'" { return text(); }
    / '"' { return text(); }
    / "b" { return text(); }
    / "f" { return text(); }
    / "n" { return text(); }
    / "r" { return text(); }
    / "t" { return text(); }
    / "v" { return text(); }

non_escape_char = !(escape_char / "\n") . { return text(); }

escape_char = single_esc_char { return text(); }
    / [0-9] { return text(); }
    / "x" { return text(); }
    / "u" { return text(); }

hex_escape_sequence = "x" digits:$([0-9a-f]i [0-9a-f]i)  { return text(); }

