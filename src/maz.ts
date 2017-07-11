import * as parser from './parser';
import { Parser } from 'expr-eval';

console.log("MAZ v0.1.0");

function pass1(code) {
    const parsed = parser.parse(code, {});
    console.log(JSON.stringify(parsed));
    const symbols = getSymbols(parsed);
    console.log(JSON.stringify(symbols));

    let pc = 0;
    let nextBlock = 0;
    let blocks = [];
    for (let i = 0; i < parsed.length; i++) {
        const line = parsed[i];
        if (line.label) {
            symbols[line.label] = pc;
            continue;
        } else if (line.equ) {
            if (i > 0 && parsed[i - 1].label) {
                let ii = i - 1;
                while (parsed[ii] && parsed[ii].label) {
                    symbols[parsed[ii].label] = line.equ;
                    ii--;
                }
            } else {
                console.log("Error: equ has no label");
            }
        } else if (line.org) {
            pc = line.org;
        } else if (line.block) {
            blocks.push(nextBlock);
            nextBlock++;
        } else if (line.endblock) {
            blocks.pop();
        } else {
            line.address = pc;
            
            // need special case for org, phase, ds, ...?
            pc += line.bytes.length;
        }
    }

    console.log(JSON.stringify(symbols));

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

    console.log(JSON.stringify(parsed));
    console.log(JSON.stringify(symbols));

    for (const symbol in symbols) {
        if (symbols[symbol].expression) {
            console.log(`${symbol} cannot be calculated`);
        }
    }

    for (const line of parsed) {
        if (line.references) {
            for (let i = 0; i < line.bytes.length; i++) {
                const byte = line.bytes[i];
                if (byte && byte.expression) {
                    const value = Parser.evaluate(byte.expression, symbols);
                    line.bytes[i] = value & 0xFF;
                    if (line.bytes[i + 1] === null) {
                        line.bytes[i + 1] = (value & 0xFF00) >> 8;
                    }
                }
            }
        }
    }    
    console.log(JSON.stringify(parsed));
}

function getSymbols(parsed) {
    const symbols = {};
    let nextBlock = 0;
    let blocks = [];
    for (let i = 0; i < parsed.length; i++) {
        const line = parsed[i];
        if (line.label) {
            if (blocks.length > 0) {
                symbols['%' + blocks[blocks.length - 1] + '_' + line.label] = null;
                line.label = '%' + blocks[blocks.length - 1] + '_' + line.label;
            } else {
                symbols[line.label] = null;
            }
        } else if (line.block) {
            blocks.push(nextBlock);
            nextBlock++;
        } else if (line.endblock) {
            blocks.pop();
        }
    }
    return symbols;
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
end:
`;

pass1(source);