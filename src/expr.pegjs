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

expr = t1:term t2:(ws? [+-] ws? term)* {
        let result = lookupVar(t1);
        for (const group of t2) {
            const term = lookupVar(group[3]);
            if (typeof term === 'number') {
                if (typeof result === 'number') {
                    result += term;
                } else {
                    if (result.length === 1) {
                        result = result.charCodeAt(0) + term;
                    } else {
                        throw `Cannot add number (${result}) and string (${term})`;
                    }
                }
            } else {
                if (typeof result === 'string') {
                    result += term;
                } else {
                    if (term.length === 1) {
                        result += term.charCodeAt(0);
                    } else {
                        throw `Cannot add string (${result}) and number (${term})`;
                    }
                }
            }
        }
        return result;
    }

term = t1:factor t2:(ws? [*/] ws? factor)* {
        let result = t1;
        for (const group of t2) {
            const term = lookupVar(group[3]);
            if (typeof term === 'number') {
                if (typeof result === 'number') {
                    result *= term;
                } else {
                    if (result.length === 1) {
                        result = result.charCodeAt(0) * term;
                    } else {
                        result = result.repeat(term);
                    }
                }
            } else {
                if (typeof result === 'string') {
                    if (result.length === 1 && term.length === 1) {
                        result = term.charCodeAt(0) * result.charCodeAt(0);
                    } else {
                        throw `Cannot multiple two strings (${result}, ${term})`;
                    }
                } else {
                    if (term.length === 1) {
                        result = term.charCodeAt(0) * result;
                    } else {
                        result = term.repeat(result);
                    }
                }
            }
        }
        return result;
    }

factor = '(' expr:expr ')' {
        return expr;
    }
    / number_literal
    / label:label {
        return {
            variable: label
        }
    }
    / string

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

