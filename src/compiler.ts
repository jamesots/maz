import * as fs from 'fs';
import * as path from 'path';
import * as parser from './parser';
// import * as Tracer from 'pegjs-backtrace';
import * as Expr from './expr';

export function compile(filename, options) {
    const parserOptions = {source: 0} as any;
    // const tracer = new Tracer(code, {
    //     showTrace: true,
    //     showFullPath: true
    // });
    // if (options.trace) {
    //     parserOptions.tracer = tracer;
    // }
    try {
        const sources = [];
        const dir = path.dirname(filename);
        const code = fs.readFileSync(filename).toString();
        sources.push({
            name: filename,
            source: code.split('\n')
        })

        const ast = parser.parse(code, parserOptions);
        // console.log(JSON.stringify(ast, undefined, 2));
        processIncludes(ast, dir, sources);


        const macros = getMacros(ast, sources);
        expandMacros(ast, macros, sources);
        const symbols = getSymbols(ast, sources);
        // console.log(JSON.stringify(symbols, undefined, 2));

        assignPCandEQU(ast, symbols, sources);
        // console.log(JSON.stringify(ast, undefined, 2));
        // console.log(JSON.stringify(symbols, undefined, 2));

        evaluateSymbols(symbols, sources);

        for (const symbol in symbols) {
            if (symbols[symbol].expression) {
                throw `Symbol '${symbol}' cannot be calculated`;
            }
        }

        updateBytes(ast, symbols, sources);
        return [ast, symbols, sources];
    } catch (e) {
        // if (options.trace) {
        //     // console.log(tracer.getBacktraceString());
        // } else {
            throw e;
        // }
    }
}

export function iterateAst(func, ast, symbols, sources, ignoreIf = false) {
    let inMacro = false;
    const prefixes = [];
    const ifStack = [true];
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

        if (el.if !== undefined) {
            if (el.if.expression) {
                el.if = evaluateExpression(prefixes[prefixes.length - 1], el.if, symbols, sources);
            }
            ifStack.push(el.if !== 0);
            console.log(` push ${el.if} ${JSON.stringify(ifStack, undefined, 2)}`);
        }
        if (el.else) {
            ifStack.push(!ifStack.pop());
            console.log(` pop push ${JSON.stringify(ifStack, undefined, 2)}`);
        }
        if (el.endif) {
            ifStack.pop();
            console.log(` pop ${JSON.stringify(ifStack, undefined, 2)}`);
        }

        if (ignoreIf || ifStack[ifStack.length - 1]) {
            func(el, i, prefixes[prefixes.length - 1] || '', inMacro, ifStack[ifStack.length - 1]);
        }
    }    
}

export function processIncludes(ast, dir, sources) {
    const dirs = [];
    const sourceIndices = [];
    let sourceIndex = 0;

    iterateAst(function(el, i, prefix, inMacro) {
        // if (el.if) {
        //     if (size.expression) {
        //         size = evaluateExpression(prefix, size, symbols, sources);
        //     }
        // }
        if (el.include && !el.included) {
            const filename = path.join(dir, el.include);
            dir = path.dirname(filename);
            dirs.push(dir);
            if (!fs.existsSync(filename)) {
                error("File does not exist", el.location, sources);
            }
            const source = fs.readFileSync(filename).toString();
            sources.push({
                name: filename,
                source: source.split('\n')
            });
            sourceIndices.push(sourceIndex);
            sourceIndex = sources.length - 1;
            const includeAst = parser.parse(source, {source: sourceIndex});
            if (includeAst !== null) {
                ast.splice(i + 1, 0, ...includeAst);
                ast.splice(i + 1 + includeAst.length, 0, {
                    endinclude: sourceIndex,
                    location: {
                        line: includeAst.length,
                        column: 0,
                        source: sourceIndex
                    }
                });
            } else {
                ast.splice(i + 1, 0, {
                    endinclude: sourceIndex,
                    location: {
                        line: 0,
                        column: 0,
                        source: sourceIndex
                    }
                });
            }
            el.included = true;
        } else if (el.endinclude !== undefined) {
            dir = dirs.pop();
            sourceIndex = sourceIndices.pop();
        }
    }, ast, {}, sources);
}

export function getMacros(ast, sources) {
    const macros = {};
    let macro = undefined;
    let macroName = undefined;
    let macroLocation = undefined;
    iterateAst(function(el, i, prefix, inMacro) {
        if (el.macrodef) {
            if (macro) {
                error("Cannot nest macros", el.location, sources);
            }
            macroLocation = el.location;
            macroName = el.macrodef;
            macro = {
                ast: [],
                params: el.params || []
            };
            if (macros[macroName]) {
                error(`Already defined macro '${macroName}'`, el.location, sources);
            }
        } else if (el.endmacro) {
            if (!macro) {
                error("Not in a macro", el.location, sources);
            }
            macros[macroName] = macro;
            macro = undefined;
            macroName = undefined;
        }
        if (macro && !el.macrodef && !el.endmacro) {
            macro.ast.push(el);
        }
    }, ast, {}, sources);
    if (macro) {
        error(`Macro '${macroName}' doesn't finish`, macroLocation, sources);
    }
    return macros;
}

/**
 * Gets a map of symbols, and updates the parsed objects
 * so the block and endblock objects have prefixes
 */
export function getSymbols(ast, sources) {
    const symbols = {};
    let nextBlock = 0;
    let blocks = [];
    iterateAst(function(el, i, prefix, inMacro) {
        if (el.label && !inMacro) {
            if (blocks.length > 0 && !el.public) {
                if (typeof symbols[labelName(blocks, el.label)] !== 'undefined') {
                    error(`Label '${el.label}' already defined at in this block`, el.location, sources);
                }
                symbols[labelName(blocks, el.label)] = null;
                el.label = labelName(blocks, el.label);
            } else {
                if (typeof symbols[el.label] !== 'undefined') {
                    error(`Label '${el.label}' already defined`, el.location, sources);
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
        } else if (el.equ) {
            if (i > 0 && ast[i - 1].label) {
                let ii = i - 1;
                while (ast[ii] && ast[ii].label) {
                    symbols[ast[ii].label] = el.equ;
                    ii--;
                }
            } else {
                error("EQU has no label", el.location, sources);
            }
        }
    }, ast, symbols, sources);
    if (blocks.length !== 0) {
        throw "Mismatch between .block and .endblock statements";
    }
    return symbols;
}

function labelPrefix(blocks: number[]) {
    let result = '';
    for (let i = 0; i < blocks.length; i++) {
        result = `%${blocks[i]}_${result}`;
    }
    return result;
}

function labelName(blocks: number[], label) {
    return labelPrefix(blocks) + label;
}

function location(el) {
    return `(${el.location.line}:${el.location.column})`;
}

function error(message, location, sources): never {
    throw {
        message: message,
        location: location,
        source: sources[location.source].source[location.line - 1],
        filename: sources[location.source].name
    };
}

export function expandMacros(ast, macros, sources) {
    iterateAst(function(el, i, prefix, inMacro) {
        if (el.macrocall) {
            const macro = macros[el.macrocall];
            if (!macro) {
                error(`Unknown instruction/macro '${el.macrocall}'`, el.location, sources);
            }
            el.params = JSON.parse(JSON.stringify(macro.params));
            el.expanded = true;
            ast.splice(i + 1, 0, ...(JSON.parse(JSON.stringify(macro.ast))));
            ast.splice(i + 1 + macro.ast.length, 0, { endmacrocall: true });
            i += macro.ast.length + 1;
        }
    }, ast, {}, sources);
}

/**
 * Assign correct value to labels, based on PC. Starts at
 * 0, increments by bytes in ast or set by org.
 * Assign correct value to equs, although it does not
 * evaluate expressions, it simply put the expression into
 * the symbol
 */
export function assignPCandEQU(ast, symbols, sources) {
    let pc = 0;
    let out = 0;
    iterateAst(function(el, i, prefix, inMacro) {
        if (inMacro) {
            return;
        }
        if (el.label) {
            if (symbols[el.label] === null) {
                symbols[el.label] = pc;
            }
            return;
        } else if (el.equ) {
            if (el.equ.expression) {
                el.equ.address = pc;
            }
        } else if (el.defs !== undefined) {
            let size = el.defs;
            if (size.expression) {
                size = evaluateExpression(prefix, size, symbols, sources);
            }
            el.address = pc;
            el.out = out;
            pc += size;
            out += size;
        } else if (el.org !== undefined) {
            if (el.org.expression) {
                el.org = evaluateExpression(prefix, el.org, symbols, sources);
            }
            pc = el.org;
            out = el.org;
        } else if (el.phase !== undefined) {
            if (el.phase.expression) {
                el.phase = evaluateExpression(prefix, el.phase, symbols, sources);
            }
            pc = el.phase;
        } else if (el.endphase) {
            pc = out;
        } else if (el.align !== undefined) {
            if (el.align.expression) {
                el.align = evaluateExpression(prefix, el.align, symbols, sources);
            }
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
    }, ast, symbols, sources);
}

export function evaluateExpression(prefix = '', expr, symbols, sources, evaluated = []) {
    const variables = expr.vars;
    const subVars = {}; // substitute variables
    if (typeof expr.address !== undefined) {
        symbols['$'] = expr.address;
    }
    for (const variable of variables) {
        const subVar = findVariable(symbols, prefix, variable);

        if (symbols[subVar] === undefined) {
            error(`Symbol '${variable}' not found`, expr.location, sources);
        }
        if (symbols[subVar].expression) {
            evaluateSymbol(subVar, symbols, sources, evaluated);
        }
        subVars[variable] = symbols[subVar];
    }
    return Expr.parse(expr.expression, {variables: subVars});
}

export function evaluateSymbol(symbol, symbols, sources, evaluated) {
    if (evaluated.indexOf(symbol) !== -1) {
        error(`Circular symbol dependency while evaluating '${symbol}'`, symbols[symbol].location, sources);
    }
    evaluated.push(symbol);
    const prefix = getWholePrefix(symbol);
    symbols[symbol] = evaluateExpression(prefix, symbols[symbol], symbols, sources, evaluated)
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

export function evaluateSymbols(symbols, sources) {
    // console.log(`eval symbols ${JSON.stringify(symbols, undefined, 2)}`);
    const evaluated = [];
    for (const symbol in symbols) {
        // console.log('evaluate ' + symbol);
        if (symbols[symbol].expression) {
            if (evaluated.indexOf(symbol) !== -1) {
                continue;
            }
            evaluateSymbol(symbol, symbols, sources, evaluated);
        }
    }
}

export function updateBytes(ast, symbols, sources) {
    iterateAst(function(el, i, prefix, inMacro) {
        if (el.references && !inMacro) {
            symbols['$'] = el.address;
            for (let i = 0; i < el.bytes.length; i++) {
                const byte = el.bytes[i];
                if (byte && byte.expression) {
                    const variables = byte.vars;

                    const subVars = {}; // substitute variables
                    for (const variable of variables) {
                        const subVar = findVariable(symbols, prefix, variable);

                        if (symbols[subVar] === undefined) {
                            error(`Symbol '${variable}' cannot be found`, el.location, sources);
                        }
                        if (symbols[subVar].expression) {
                            error(`Symbol ${variable} not evaluated`, el.location, sources);
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
    }, ast, symbols, sources);
}

const BYTELEN = 8;

/**
 * Each line should be
 * LLLL ADDR BYTES SRC  - max 8 bytes? - multiple lines if more
 */
export function getList(sources, ast, symbols) {
    let list = [];
    let line = 0;
    let source = 0;

    let out = undefined;
    let address = undefined;
    let bytes = [];

    let inMacro = false;
    let startingMacro = false;
    let endingMacro = false;
    let currentIfTrue = true;
    let endingInclude : {
        line: number,
        source: number
    } | false = false;

    iterateAst(function(el, i, prefix, inMacro, ifTrue) {
        if (el.location) {
            if ((el.location.line !== line && line !== 0) || (el.location.source !== source)) {
                dumpLine(list, sources[source].source, line, out, address, bytes, inMacro, currentIfTrue);
                if (endingInclude !== false) {
                    list.push(`${pad(endingInclude.line + 1, 4)}                      * end include ${sources[endingInclude.source].name}`);
                    endingInclude = false;
                }

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
            source = el.location.source;
            if (el.out !== undefined) {
                out = el.out;
                address = el.address;
            }
            if (el.bytes && ifTrue) {
                bytes = el.bytes;
            }
            currentIfTrue = ifTrue;
        }
        if (el.macrocall) {
            startingMacro = true;
        }
        if (el.endmacrocall) {
            endingMacro = true;
        }
        if (el.endinclude !== undefined) {
            endingInclude = el.location;
        }
    }, ast, symbols, sources, true);
    if (sources[source].source[line - 1]) {
        dumpLine(list, sources[source].source, line, out, address, bytes, inMacro, currentIfTrue);
    }

    list.push('');

    for (const symbol in symbols) {
        if (!symbol.startsWith('%')) {
            list.push(`${padr(symbol, 20)} ${pad(symbols[symbol].toString(16), 4, '0')}`);
        }
    }

    return list;    
}

function dumpLine(list, lines, line, out, address, bytes, inMacro, ifTrue) {
    let byteString = '';
    if (bytes) {
        for (const byte of bytes) {
            byteString += pad((byte & 0xFF).toString(16), 2, '0');
        }
    }
    let outString = '    ';
    if (out !== undefined) {
        outString = pad(out.toString(16), 4, '0');
    }
    let addressString = '    ';
    if (address !== undefined) {
        addressString = pad(address.toString(16), 4, '0');
    }
    if (!ifTrue) {
        addressString = 'x   ';
        outString = 'x   ';
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

export function getBytes(ast, sources) {
    let bytes = [];
    let startOut = null;
    let out = null;

    iterateAst(function(el, i, prefix, inMacro) {
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
                error("Cannot ORG to earlier address than first ORG", el.location, sources);
            } else if (el.out < end) {
                for (let i = 0; i < el.bytes.length; i++) {
                    bytes[(el.out - startOut) + i] = el.bytes[i];
                }
                out = el.bytes.length + el.out;
            }
        }
    }, ast, {}, sources);
    return bytes;
}
