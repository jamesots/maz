import * as parser from './parser';
import { Parser } from 'expr-eval';

export function compile(code) {
    const ast = parser.parse(code, {});
    const symbols = getSymbols(ast);

    assignPCandEQU(ast, symbols);
    evaluateSymbols(symbols);

    for (const symbol in symbols) {
        if (symbols[symbol].expression) {
            console.log(`${symbol} cannot be calculated`);
        }
    }

    updateBytes(ast, symbols);
    return [ast, symbols];
}

/**
 * Gets a map of symbols, and updates the parsed objects
 * so the block and endblock objects have prefixes
 */
export function getSymbols(ast) {
    const symbols = {};
    let nextBlock = 0;
    let blocks = [];
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.label) {
            if (blocks.length > 0) {
                symbols[labelName(blocks, el.label)] = null;
                el.label = labelName(blocks, el.label);
            } else {
                symbols[el.label] = null;
            }
        } else if (el.block) {
            blocks.push(nextBlock);
            el.prefix = labelPrefix(blocks);
            nextBlock++;
        } else if (el.endblock) {
            el.prefix = labelPrefix(blocks);
            blocks.pop();
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

/**
 * Assign correct value to labels, based on PC. Starts at
 * 0, increments by bytes in ast or set by org.
 * Assign correct value to equs, although it does not
 * evaluate expressions, it simply put the expression into
 * the symbol
 */
export function assignPCandEQU(ast, symbols) {
    let pc = 0;
    let blocks = [];
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.label) {
            symbols[el.label] = pc;
            continue;
        } else if (el.equ) {
            if (i > 0 && ast[i - 1].label) {
                let ii = i - 1;
                while (ast[ii] && ast[ii].label) {
                    symbols[ast[ii].label] = el.equ;
                    ii--;
                }
            } else {
                console.log("Error: equ has no label");
            }
        } else if (el.org) {
            pc = el.org;
        } else if (el.block) {
            blocks.push(el.prefix);
        } else if (el.endblock) {
            blocks.pop();
        } else {
            el.address = pc;
            
            // need special case for phase, ds, ...?
            pc += el.bytes.length;
        }
    }
}

export function evaluateSymbol(symbol, symbols, evaluated) {
    if (evaluated.indexOf(symbol) !== -1) {
        throw "Circular symbol dependency";
    }
    evaluated.push(symbol);
    const expr = Parser.parse(symbols[symbol].expression);
    const variables = expr.variables();
    const subVars = {}; // substitute variables
    const prefix = getWholePrefix(symbol);
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
    symbols[symbol] = expr.evaluate(subVars);
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
    for (const el of ast) {
        if (el.references) {
            for (let i = 0; i < el.bytes.length; i++) {
                const byte = el.bytes[i];
                if (byte && byte.expression) {
                    const value = Parser.evaluate(byte.expression, symbols);
                    el.bytes[i] = value & 0xFF;
                    if (el.bytes[i + 1] === null) {
                        el.bytes[i + 1] = (value & 0xFF00) >> 8;
                    }
                }
            }
        }
    }    
}

export function getBytes(ast) {
    let bytes = [];
    for (const el of ast) {
        if (el.bytes) {
            bytes = bytes.concat(el.bytes);
        }
    }
    return bytes;
}
