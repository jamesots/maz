import * as parser from './parser';
import { Parser } from 'expr-eval';

console.log("MAZ v0.1.0");

function pass1(code) {
    const parsed = parser.parse(code, {});
    console.log(JSON.stringify(parsed));
    const symbols = getSymbols(parsed);
    console.log(JSON.stringify(symbols));

    let pc = 0;
    for (const line of parsed) {
        if (line.label) {
            symbols[line.label] = pc;
        } else {
            line.address = pc;
            
            // need special case for org, phase, ds, ...?
            pc += line.bytes.length;
        }
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
start:
    ld a,(end - start)
data: nop
    db "hello",10,"!",start
end:
`;

pass1(source);