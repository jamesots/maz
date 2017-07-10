import * as parser from './parser';
import { Parser } from 'expr-eval';

console.log("MAZ v0.1.0");

function pass1(code) {
    const parsed = parser.parse(code, {});
    console.log(JSON.stringify(parsed));
    const symbols = getSymbols(parsed);
    console.log(JSON.stringify(symbols));

    let pc = 0;
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
        } else {
            line.address = pc;
            
            // need special case for org, phase, ds, ...?
            pc += line.bytes.length;
        }
    }

    for (const symbol in symbols) {
        if (symbols[symbol].expression) {
            symbols[symbol] = Parser.evaluate(symbols[symbol].expression, symbols);
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
    for (const line of parsed.filter(line => line.label)) {
        symbols[line.label] = null;
    }
    return symbols;
}

const source = `
thing:
bdos: equ 5
blob: equ glop
glop: equ bdos
start:
    ld a,(end - start)
data: nop
    defb "hello",10,"!",start,bdos
end:
`;

pass1(source);