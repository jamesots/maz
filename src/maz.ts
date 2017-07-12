import * as parser from './parser';
import { Parser } from 'expr-eval';

console.log("MAZ v0.1.0");

function pass1(code) {
    const ast = parser.parse(code, {});
    console.log(JSON.stringify(ast));
    const symbols = getSymbols(ast);
    console.log(JSON.stringify(symbols));

    assignPCandEQU(ast, symbols);

    console.log(JSON.stringify(symbols));

    evaluateSymbols(symbols);

    console.log(JSON.stringify(ast));
    console.log(JSON.stringify(symbols, undefined, 2));

    for (const symbol in symbols) {
        if (symbols[symbol].expression) {
            console.log(`${symbol} cannot be calculated`);
        }
    }

    updateBytes(ast, symbols);

    console.log(JSON.stringify(ast));
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

export function evaluateSymbols(symbols) {
    for (const symbol in symbols) {
        if (symbols[symbol].expression) {
            console.log(`symbol ${symbol}: ${symbols[symbol].expression}`);
            const expr = Parser.parse(symbols[symbol].expression);
            const variables = expr.variables();
            const subVars = {};
            for (const variable of variables) {
                console.log(`var ${variable}`);
                const match = /%([0-9]+)_(.*)/.exec(symbol);
                if (match) {
                    let depth = parseInt(match[1], 10);
                    while (depth >= 0) {
                        console.log(`depth ${depth}`);
                        const depthVar = `%${depth}_${variable}`;
                        if (symbols[depthVar] !== undefined) {
                            subVars[variable] = symbols[depthVar];
                            break;
                        }
                        depth--
                    }
                    if (depth < 0) {
                        subVars[variable] = symbols[variable];
                    }
                } else {
                    subVars[variable] = symbols[variable];
                }
            }
            console.log(`subVars: ${JSON.stringify(subVars)}`);
            symbols[symbol] = Parser.evaluate(symbols[symbol].expression, subVars);
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

const source = `
thing:
bdos: equ 5
blob: equ glop
glop: equ bdos
.block
    a: equ 2
.block
    bdos: equ 6
    blah: equ bdos
    b: equ a
.endblock
    bdos: equ 7
.endblock
start:
    ld a,(end - start)
data: nop
    defb "hello",10,"!",start,bdos
org 40
.block
    bdos: equ 8
    b: equ a
.endblock
end:
`;

// pass1(source);