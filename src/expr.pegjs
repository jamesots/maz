{
    let variables = options.variables;

    function lookupVar(term) {
        if (term.variable) {
            // console.log(`looking up ${term.variable}`);
            const value = variables[term.variable];
            if (typeof value !== undefined) {
                return value
            } else {
                throw `Variable not found: ${term.variable}`;
            }
        }
        return term;
    }

    function plusMinus(t1, t2, operator) {
        if (operator === '+') {
            return t1 + t2;
        }
        return t1 - t2;
    }

    function shift(t1, t2, operator) {
        if (operator === '<<' || operator === 'shl') {
            return t1 << t2;
        }
        return t1 >> t2;
    }

    function isString(term) {
        return typeof term === 'string' && term.length !== 1
            && term.length !== 2;
    }

    function toNumber(term) {
        if (typeof term === 'string' && term.length === 1) {
            return term.charCodeAt(0);
        } else if (typeof term === 'string' && term.length === 2) {
            return term.charCodeAt(0) * 256 + term.charCodeAt(1);
        }
        if (typeof term === 'number') {
            return term;
        }
        throw `Cannot cast "${term}" to a number`;
    }

    function timesDivideMod(t1, t2, operator) {
        if (operator === '*') {
            if (isString(t1)) {
                return t1.repeat(toNumber(t2));
            }
            if (isString(t2)) {
                return t2.repeat(toNumber(t1));
            }
            return toNumber(t1) * toNumber(t2);
        } else if (operator === '/') {
            return toNumber(t1) / toNumber(t2);
        }
        return toNumber(t1) % toNumber(t2);
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

}

start = expr

ws = [ \t]+

expr = ternary

ternary = t1:logicalor t2:(ws? '?' ws? t2:expr ws? ':' ws? t3:expr)? {
    t1 = lookupVar(t1);
    if (t2) {
        let trueval = lookupVar(t2[3]);
        let falseval = lookupVar(t2[7]);
        if (t1 != 0) {
            return trueval;
        } else {
            return falseval;
        }
    }
    return t1;
}

logicalor = t1:logicaland t2:(ws? '||' ws? logicaland)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            result = ((result != 0) || (term != 0)) ? 1 : 0;
        }
        return result;
    }

logicaland = t1:bitwiseor t2:(ws? '&&' ws? bitwiseor)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            result = ((result != 0) && (term != 0)) ? 1 : 0;
        }
        return result;
    }

bitwiseor = t1:bitwisexor t2:(ws? ('|'/'or'i) ws? bitwisexor)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            result = result | term;
        }
        return result;
    }

bitwisexor = t1:bitwiseand t2:(ws? ('^'/'xor'i) ws? bitwiseand)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            result = result ^ term;
        }
        return result;
    }

bitwiseand = t1:equal t2:(ws? ('&'/'and'i) ws? equal)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            result = result & term;
        }
        return result;
    }

equal = t1:greaterless t2:(ws? ('=='/'='/'!='/'<>'/'eq'/'ne') ws? greaterless)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            switch (operator) {
                case '==' : 
                case '=' :
                case 'eq' : 
                    result = result == term ? 1 : 0;
                    break;
                case '!=' : 
                case '<>' :
                case 'ne' : 
                    result = result != term ? 1 : 0;
                    break;
            }
        }
        return result;
    }

greaterless = t1:shift t2:(ws? ('<='/'>='/'<'/'>'/'lte'/'lt'/'gte'/'gt') ws? shift)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);

            switch (operator) {
                case '<' : 
                case 'lt' :
                    result = result < term ? 1 : 0;
                    break;
                case '>' : 
                case 'gt' :
                    result = result > term ? 1 : 0;
                    break;
                case '<=' :
                case 'lte' : 
                    result = result <= term ? 1 : 0;
                    break;
                case '>=' : 
                case 'gte' :
                    result = result >= term ? 1 : 0;
                    break;
            }
        }
        return result;
    }

shift = t1:plusminus t2:(ws? ('<<'/'>>'/'shl'/'shr') ws? plusminus)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);
            if (isString(term) || isString(result)) {
                throw `Cannot shift strings (${result}, ${term})`;
            }
            
            result = shift(toNumber(result), toNumber(term), operator);
        }
        return result;
    }

plusminus = t1:term t2:(ws? [+-] ws? term)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);
            if (isString(term) && isString(result) && operator == '+') {
                result = result + term;
            } else {
                result = plusMinus(toNumber(result), toNumber(term), operator);
            }
        }
        return result;
    }

term = t1:unary t2:(ws? [*/%] ws? unary)* {
        let result = t1;
        for (const group of t2) {
            const operator = group[1];
            const term = lookupVar(group[3]);
            if (isString(term) && isString(result) && operator === '*') {
                throw `Cannot multiply two strings (${result}, ${term})`;
            }
            if ((isString(term) || isString(result)) && operator !== '*') {
                throw `Cannot ${operator} strings (${result}, ${term})`;
            }
            result = timesDivideMod(result, term, operator);
        }
        return result;
    }

unary = operator:[!~+-]? expr:factor {
    expr = lookupVar(expr);
    if (operator && isString(expr)) {
        throw `Cannot ${operator} a string (${expr})`;
    }
    if (operator === '!') {
        return toNumber(expr) === 0 ? 1 : 0;
    } else if (operator === '~') {
        return ~toNumber(expr);
    } else if (operator === '+') {
        return toNumber(expr);
    } else if (operator === '-') {
        return -toNumber(expr);
    }
    return expr;
}

factor = '(' expr:expr ')' {
        return expr;
    }
    / function
    / '$' !([0-9a-z]i) {
        return {
            variable: '$'
        }
    }
    / number_literal
    / label:label {
        return {
            variable: label
        }
    }
    / string

function = 'min('i ws? expr1:expr ws? ',' ws? expr2:expr ws? ')' {
        expr1 = lookupVar(expr1);
        expr2 = lookupVar(expr2);
        if ((isString(expr1) && !isString(expr2)) || (!isString(expr1) && isString(expr2))) {
            throw `Cannot find min of number and string (${expr1}, ${expr2})`;
        }
        if (isString(expr1)) {
            return expr1 <= expr2 ? expr1 : expr2;
        }
        return Math.min(toNumber(expr1), toNumber(expr2));
    }
    / 'max('i ws? expr1:expr ws? ',' ws? expr2:expr ws? ')' {
        expr1 = lookupVar(expr1);
        expr2 = lookupVar(expr2);
        if ((isString(expr1) && !isString(expr2)) || (!isString(expr1) && isString(expr2))) {
            throw `Cannot find max of number and string (${expr1}, ${expr2})`;
        }
        if (isString(expr1)) {
            return expr1 >= expr2 ? expr1 : expr2;
        }
        return Math.max(toNumber(expr1), toNumber(expr2));
    }

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
    / [0-9][0-9a-f_]i* 'h' {
        return parseInt(text().replace(/[_h]/g,''), 16)
    }
binary_literal = '%' num:([01][01_]*) {
        return parseInt(text().replace(/[_%]/g,''), 2)
    }
    / [01][01_]* 'b' {
        return parseInt(text().replace(/[_b]/g,''), 2)
    }
octal_literal = [0-7][0-7_]* 'o' {
        return parseInt(text().replace(/[_o]/g,''), 8)
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

label = text1:[a-zA-Z] text2:[a-zA-Z0-9_]* !{
        const text = text1 + text2.join('');
        return (text === 'bc' || text === 'de' || text === 'hl' || text === 'sp');
    } {
        return text();
    }
