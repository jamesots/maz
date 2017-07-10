import * as parser from './parser';

console.log("MAZ v0.1.0");

function pass1(code) {
    const parsed = parser.parse(code);
    let pc = 0;
    for (const line of parsed) {
        line.pc = pc;
        // need special case for org, phase, ds, ...?
        pc += line.bytes.length;
    }
}

function getSymbols(parsed) {
    for (const line of parsed) {
        
    }
}