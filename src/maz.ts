import * as parser from './parser';
import { Parser } from 'expr-eval';

console.log("MAZ v0.1.0");

function pass1(code) {
    const parsed = parser.parse(code, {});
    console.log(JSON.stringify(parsed));
    const symbols = getSymbols(parsed);
    console.log(JSON.stringify(symbols));

    let pc = 0;
    let lastLabel = null;
    for (const line of parsed) {
        if (line.label) {
            lastLabel = line.label;
            symbols[line.label] = pc;
            continue;
        }
        if (line.equ) {
            if (lastLabel === null) {
                console.log("Error: equ has no label");
            } else {
                symbols[lastLabel] = line.equ;
            }
            // if multiple labels, earlier labels will get pc
            // - might be nicer if multiple labels get same equ value
        } else {
            line.address = pc;
            
            // need special case for org, phase, ds, ...?
            pc += line.bytes.length;
        }
        lastLabel = null;
    }
    console.log(JSON.stringify(parsed));
    console.log(JSON.stringify(symbols));

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
    for (const line of parsed.filter(line => line.label)) {
        symbols[line.label] = null;
    }
    return symbols;
}

const source = `
bdos: equ 5
start:
    ld a,(end - start)
data: nop
    defb "hello",10,"!",start,bdos
end:
`;

pass1(source);