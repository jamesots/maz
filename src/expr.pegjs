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
        if (operator === '<<') {
            return t1 << t2;
        }
        return t1 >> t2;
    }

    function isString(term) {
        return typeof term === 'string' && term.length !== 1;
    }

    function toNumber(term) {
        if (typeof term === 'string' && term.length === 1) {
            return term.charCodeAt(0);
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

labeldef = label:label ':' {
    return {
        label: label
    }
}

label = text1:[a-zA-Z] text2:[a-zA-Z0-9_]* !{
        const text = text1 + text2.join('');
        return (text === 'bc' || text === 'de' || text === 'hl' || text === 'sp');
    } {
        return text();
    }


ws = [ \t]+
wsnl = [ \t\r\n]+

expr = shift

shift = t1:plusminus t2:(ws? ('<<'/'>>') ws? plusminus)* {
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

factor = '(' expr:expr ')' {
        return expr;
    }
    / function
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
        return Math.min(toNumber(lookupVar(expr1)), toNumber(lookupVar(expr2)));
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
        return Math.max(toNumber(lookupVar(expr1)), toNumber(lookupVar(expr2)));
    }

unary = operator:[\!~]? expr:factor {
    expr = lookupVar(expr);
    if (operator && isString(expr)) {
        throw `Cannot ${operator} a string (${expr})`;
    }
    if (operator === '!') {
        return toNumber(expr) === 0 ? 1 : 0;
    } else if (operator === '~') {
        return (~toNumber(expr)) & 0xFF;
    }
    return expr;
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
binary_literal = [01][01_]* 'b' {
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

