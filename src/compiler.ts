import * as parser from './parser';
import { Parser } from 'expr-eval';
import * as Tracer from 'pegjs-backtrace';

export function compile(code, options) {
    const parserOptions = {} as any;
    const tracer = new Tracer(code, {
        showTrace: true,
        showFullPath: true
    });
    if (options.trace) {
        parserOptions.tracer = tracer;
    }
    try {
        const ast = parser.parse(code, parserOptions);
        console.log(JSON.stringify(ast, undefined, 2));
        
        const macros = getMacros(ast);
        expandMacros(ast, macros);
        const symbols = getSymbols(ast);

        console.log(JSON.stringify(ast, undefined, 2));

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
        if (options.trace) {
            // console.log(tracer.getBacktraceString());
        } else {
            throw e;
        }
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
                throw "Cannot nest macros";
            }
            macroName = el.macrodef;
            macro = {
                ast: [],
                params: el.params || []
            };
        } else if (el.endmacro) {
            if (!macro) {
                throw "Not in a macro";
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
                symbols[labelName(blocks, el.label)] = null;
                el.label = labelName(blocks, el.label);
            } else {
                symbols[el.label] = null;
            }
        } else if (el.block) {
            blocks.push(nextBlock);
            el.prefix = labelPrefix(blocks);
            nextBlock++;
        } else if (el.endblock || el.endmacrocall) {
            el.prefix = labelPrefix(blocks);
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

export function expandMacros(ast, macros) {
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
        if (el.macrocall) {
            const macro = macros[el.macrocall];
            if (!macro) {
                throw "Macro not found: " + el.macrocall;
            }
            el.params = JSON.parse(JSON.stringify(macro.params));
            el.expanded = true;
            ast.splice(i + 1, 0, ...macro.ast);
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
    let inMacro = false;
    for (let i = 0; i < ast.length; i++) {
        const el = ast[i];
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
        } else if (el.bytes) {
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
    console.log('eval symbols ' + JSON.stringify(symbols, undefined, 2));
    const evaluated = [];
    for (const symbol in symbols) {
        console.log('evaluate ' + symbol);
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
        if (el.block || el.macrocall) {
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
                    console.log('>> ' + byte.expression);
                    const expr = Parser.parse(byte.expression);
                    const variables = expr.variables();

                    const subVars = {}; // substitute variables
                    const prefix = prefixes[prefixes.length - 1] || '';
                    for (const variable of variables) {
                        const subVar = findVariable(symbols, prefix, variable);

                        if (symbols[subVar] === undefined) {
                            throw 'Symbol cannot be found: ' + variable;
                        }
                        if (symbols[subVar].expression) {
                            throw 'Symbol not evaluated: ' + variable
                            // evaluateSymbol(subVar, symbols, evaluated);
                        }
                        subVars[variable] = symbols[subVar];
                        console.log('>>>> ' + symbols[subVar]);
                    }

                    const value = expr.evaluate(subVars) as any;
                    console.log('>>>>>> ' + value);
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

export function getBytes(ast) {
    let bytes = [];
    let inMacro = false;
    for (const el of ast) {
        if (el.macrodef) {
            inMacro = true;
        } else if (el.endmacro) {
            inMacro = false;
        }
        if (el.bytes && !inMacro) {
            bytes = bytes.concat(el.bytes);
        }
    }
    return bytes;
}
