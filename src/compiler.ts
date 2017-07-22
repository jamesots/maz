import * as parser from './parser';
// import * as Tracer from 'pegjs-backtrace';
import * as Expr from './expr';

export function compile(code, options) {
    const parserOptions = {} as any;
    // const tracer = new Tracer(code, {
    //     showTrace: true,
    //     showFullPath: true
    // });
    // if (options.trace) {
    //     parserOptions.tracer = tracer;
    // }
    try {
        const ast = parser.parse(code, parserOptions);
        // console.log(JSON.stringify(ast, undefined, 2));
        
        const macros = getMacros(ast);
        expandMacros(ast, macros);
        const symbols = getSymbols(ast);

        // console.log(JSON.stringify(ast, undefined, 2));

        assignPCandEQU(ast, symbols);
        evaluateSymbols(symbols);

        for (const symbol in symbols) {
            if (symbols[symbol].expression) {
                console.log(`${symbol} cannot be calculated`);
            }
        }

        updateBytes(ast, symbols);
        return [ast, symbols];
    } catch (e) {
        // if (options.trace) {
        //     // console.log(tracer.getBacktraceString());
        // } else {
            throw e;
        // }
    }
}

export function getMacros(ast) {
    const macros = {};
    let macro = undefined;
    let macroName = undefined;
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.macrodef) {
            if (macro) {
                throw "Cannot nest macros " + location(el);
            }
            macroName = el.macrodef;
            macro = {
                ast: [],
                params: el.params || []
            };
            if (macros[macroName]) {
                throw `Already defined macro ${macroName} at ${location(el)}`;
            }
        } else if (el.endmacro) {
            if (!macro) {
                throw "Not in a macro " + location(el);
            }
            macros[macroName] = macro;
            macro = undefined;
            macroName = undefined;
        }
        if (macro && !el.macrodef && !el.endmacro) {
            macro.ast.push(el);
        }
    }
    if (macro) {
        throw "Macro doesn't finish";
    }
    return macros;
}

/**
 * Gets a map of symbols, and updates the parsed objects
 * so the block and endblock objects have prefixes
 */
export function getSymbols(ast) {
    const symbols = {};
    let nextBlock = 0;
    let blocks = [];
    let inMacro = false;
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.label && !inMacro) {
            if (blocks.length > 0) {
                if (typeof symbols[labelName(blocks, el.label)] !== 'undefined') {
                    throw `Label '${el.label}' already defined at in this block at ${location(el)}`;
                }
                symbols[labelName(blocks, el.label)] = null;
                el.label = labelName(blocks, el.label);
            } else {
                if (typeof symbols[el.label] !== 'undefined') {
                    throw `Label '${el.label}' already defined at ${location(el)}`;
                }
                symbols[el.label] = null;
            }
        } else if (el.block) {
            blocks.push(nextBlock);
            el.prefix = labelPrefix(blocks);
            nextBlock++;
        } else if (el.endblock || el.endmacrocall) {
            blocks.pop();
        } else if (el.macrocall) {
            blocks.push(nextBlock);
            el.prefix = labelPrefix(blocks);
            nextBlock++;
            for (let j = 0; j < el.params.length; j++) {
                const param = el.params[j];
                if (blocks.length > 0) {
                    symbols[labelName(blocks, param)] = el.args[j];
                    el.params[j] = labelName(blocks, param);
                } else {
                    symbols[param] = null;
                }
            }
        } else if (el.macrodef) {
            inMacro = true;
        } else if (el.endmacro) {
            inMacro = false;
        } else if (el.equ) {
            if (i > 0 && ast[i - 1].label) {
                let ii = i - 1;
                while (ast[ii] && ast[ii].label) {
                    symbols[ast[ii].label] = el.equ;
                    ii--;
                }
            } else {
                console.log("Error: equ has no label " + location(el));
            }
        }
    }
    if (blocks.length !== 0) {
        throw "Mismatch between .block and .endblock statements";
    }
    return symbols;
}

function labelPrefix(blocks: string[]) {
    let result = '';
    for (let i = 0; i < blocks.length; i++) {
        result = `%${blocks[i]}_${result}`;
    }
    return result;
}

function labelName(blocks: string[], label) {
    return labelPrefix(blocks) + label;
}

function location(el) {
    return `(${el.location.line}:${el.location.column})`;
}

export function expandMacros(ast, macros) {
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.macrocall) {
            const macro = macros[el.macrocall];
            if (!macro) {
                throw "Unknown instruction/macro: " + el.macrocall + " " + location(el);
            }
            el.params = JSON.parse(JSON.stringify(macro.params));
            el.expanded = true;
            ast.splice(i + 1, 0, ...(JSON.parse(JSON.stringify(macro.ast))));
            ast.splice(i + 1 + macro.ast.length, 0, { endmacrocall: true });
            i += macro.ast.length + 1;
        }
    }
}

/**
 * Assign correct value to labels, based on PC. Starts at
 * 0, increments by bytes in ast or set by org.
 * Assign correct value to equs, although it does not
 * evaluate expressions, it simply put the expression into
 * the symbol
 */
export function assignPCandEQU(ast, symbols) {
    let pc = 0;
    let out = 0;
    let inMacro = false;
    let prefixes = [];
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.prefix) {
            prefixes.push(el.prefix);
        }
        if (el.endmacro || el.endblock) {
            prefixes.pop();
        }

        if (el.macrodef) {
            inMacro = true;
        } else if (el.endmacro) {
            inMacro = false;
        }
        if (inMacro) {
            continue;
        }
        if (el.label) {
            symbols[el.label] = pc;
            continue;
        } else if (el.defs !== undefined) {
            let size = el.defs;
            if (size.expression) {
                size = evaluateExpression(prefixes[prefixes.length - 1], size, symbols);
            }
            el.address = pc;
            el.out = out;
            pc += size;
            out += size;
        } else if (el.org !== undefined) {
            if (el.org.expression) {
                el.org = evaluateExpression(prefixes[prefixes.length - 1], el.org, symbols);
            }
            pc = el.org;
            out = el.org;
        } else if (el.phase !== undefined) {
            pc = el.phase;
        } else if (el.endphase) {
            pc = out;
        } else if (el.align !== undefined) {
            let add = el.align - (pc % el.align);
            if (add !== el.align) {
                pc += add;
                out += add;
            }
        } else if (el.bytes) {
            el.address = pc;
            el.out = out;
            
            pc += el.bytes.length;
            out += el.bytes.length;
        }
    }
}

export function evaluateExpression(prefix = '', expr, symbols, evaluated = []) {
    const variables = expr.vars;
    const subVars = {}; // substitute variables
    for (const variable of variables) {
        const subVar = findVariable(symbols, prefix, variable);

        if (symbols[subVar] === undefined) {
            throw 'Symbol not found: ' + variable;
        }
        if (symbols[subVar].expression) {
            evaluateSymbol(subVar, symbols, evaluated);
        }
        subVars[variable] = symbols[subVar];
    }
    return Expr.parse(expr.expression, {variables: subVars});
}

export function evaluateSymbol(symbol, symbols, evaluated) {
    if (evaluated.indexOf(symbol) !== -1) {
        throw "Circular symbol dependency";
    }
    evaluated.push(symbol);
    const prefix = getWholePrefix(symbol);
    symbols[symbol] = evaluateExpression(prefix, symbols[symbol], symbols, evaluated)
}

export function findVariable(symbols, prefix, variable) {
    while (true) {
        const subVar = symbols[prefix + variable];
        if (subVar !== undefined) {
            return prefix + variable;
        }
        if (prefix === '') {
            break;
        }
        prefix = getReducedPrefix(prefix);
    }
}

export function getReducedPrefix(prefix) {
    const match = /%[0-9]+_(.*)/.exec(prefix);
    if (match) {
        return match[1];
    }
    return '';
}

export function getWholePrefix(symbol) {
    const match = /((%[0-9]+_)+)(.*)/.exec(symbol);
    if (match) {
        return match[1];
    }
    return '';
}

export function evaluateSymbols(symbols) {
    // console.log('eval symbols ' + JSON.stringify(symbols, undefined, 2));
    const evaluated = [];
    for (const symbol in symbols) {
        // console.log('evaluate ' + symbol);
        if (symbols[symbol].expression) {
            if (evaluated.indexOf(symbol) !== -1) {
                continue;
            }
            evaluateSymbol(symbol, symbols, evaluated);
        }
    }
}

export function updateBytes(ast, symbols) {
    const prefixes = [];
    let inMacro = false;
    for (const el of ast) {
        if (el.prefix) {
            prefixes.push(el.prefix);
        }
        if (el.endblock || el.endmacrocall) {
            prefixes.pop();
        }
        if (el.macrodef) {
            inMacro = true;
        } else if (el.endmacro) {
            inMacro = false;
        }
        if (el.references && !inMacro) {
            for (let i = 0; i < el.bytes.length; i++) {
                const byte = el.bytes[i];
                if (byte && byte.expression) {
                    const variables = byte.vars;

                    const subVars = {}; // substitute variables
                    const prefix = prefixes[prefixes.length - 1] || '';
                    for (const variable of variables) {
                        const subVar = findVariable(symbols, prefix, variable);

                        if (symbols[subVar] === undefined) {
                            throw 'Symbol cannot be found: ' + variable + " " + location(el);
                        }
                        if (symbols[subVar].expression) {
                            throw 'Symbol not evaluated: ' + variable + " " + location(el);
                            // evaluateSymbol(subVar, symbols, evaluated);
                        }
                        subVars[variable] = symbols[subVar];
                    }

                    const value = Expr.parse(byte.expression, {variables: subVars})
                    if (typeof value === 'string') {
                        let bytes = [];
                        for (let i = 0; i < value.length; i++) {
                            bytes.push(value.charCodeAt(i));
                        }
                        el.bytes.splice(i, 1, ...bytes);
                    } else {
                        el.bytes[i] = value & 0xFF;
                        if (el.bytes[i + 1] === null) {
                            el.bytes[i + 1] = (value & 0xFF00) >> 8;
                        }
                    }
                }
            }
        }
    }    
}

const BYTELEN = 8;

/**
 * Each line should be
 * LLLL ADDR BYTES SRC  - max 8 bytes? - multiple lines if more
 */
export function getList(code, ast, symbols) {
    let lines = code.split('\n');
    let list = [];
    let line = 0;

    let out = undefined;
    let address = undefined;
    let bytes = [];

    let inMacro = false;
    let startingMacro = false;
    let endingMacro = false;

    for (const el of ast) {
        if (el.location) {
            if (el.location.line != line && line !== 0) {
                dumpLine(list, lines, line, out, address, bytes, inMacro);

                if (endingMacro) {
                    inMacro = false;
                    endingMacro = false;
                }
                if (startingMacro) {
                    list.push('           ' + ' '.repeat(BYTELEN * 2) + '* UNROLL MACRO')
                    inMacro = true;
                    startingMacro = false;
                }

                out = undefined;
                address = undefined;
                bytes = [];
            }
            line = el.location.line;
            if (el.out) {
                out = el.out;
                address = el.address;
            }
            if (el.bytes) {
                bytes = el.bytes;
            }
        }
        if (el.macrocall) {
            startingMacro = true;
        }
        if (el.endmacrocall) {
            endingMacro = true;
        }
    }
    if (lines[line - 1]) {
        dumpLine(list, lines, line, out, address, bytes, inMacro);
    }

    list.push('');

    for (const symbol in symbols) {
        if (!symbol.startsWith('%')) {
            list.push(`${padr(symbol, 20)} ${pad(symbols[symbol].toString(16), 4, '0')}`);
        }
    }

    return list;    
}

function dumpLine(list, lines, line, out, address, bytes, inMacro) {
    let byteString = '';
    if (bytes) {
        for (const byte of bytes) {
            byteString += pad((byte & 0xFF).toString(16), 2, '0');
        }
    }
    let outString = '    ';
    if (out) {
        outString = pad(out.toString(16), 4, '0');
    }
    let addressString = '    ';
    if (address) {
        addressString = pad(address.toString(16), 4, '0');
    }
    list.push(`${pad(line, 4)} ${address !== out?addressString + '@':''}${outString} ${padr(byteString, BYTELEN * 2).substring(0, BYTELEN * 2)} ${inMacro ? '*' : ' '}${lines[line - 1]}`);
    for (let i = BYTELEN * 2; i < byteString.length; i += BYTELEN * 2) {
        list.push(`          ${padr(byteString.substring(i, i + BYTELEN * 2), BYTELEN * 2).substring(0,BYTELEN * 2)}`)
    }
}

function pad(num, size, chr = ' ') {
    let result = '' + num;
    return chr.repeat(Math.max(0, size - result.length)) + result;
}

function padr(num, size, chr = ' ') {
    let result = '' + num;
    return result + chr.repeat(Math.max(0, size - result.length));
}

export function getBytes(ast) {
    let bytes = [];
    let startOut = null;
    let out = null;
    let inMacro = false;
    for (const el of ast) {
        if (el.macrodef) {
            inMacro = true;
        } else if (el.endmacro) {
            inMacro = false;
        }
        if (el.bytes && !inMacro) {
            const end = bytes.length + startOut;
            if (out === null || el.out === end) {
                if (startOut === null) {
                    startOut = el.out;
                }
                out = el.bytes.length + el.out;
                bytes = bytes.concat(el.bytes);
            } else if (el.out > end) {
                for (let i = out; i < el.out; i++) {
                    bytes.push(0);
                }
                bytes = bytes.concat(el.bytes);
                out = el.bytes.length + el.out;
            } else if (el.out < startOut) {
                throw "Cannot ORG to earlier address than first ORG";
            } else if (el.out < end) {
                for (let i = 0; i < el.bytes.length; i++) {
                    bytes[(el.out - startOut) + i] = el.bytes[i];
                }
                out = el.bytes.length + el.out;
            }
        }
    }
    return bytes;
}
