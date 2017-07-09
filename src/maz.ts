import * as parser from './parser';

console.log("MAZ v0.1.0");

const result = parser.parse(`
    org $5_00
start:    ld a,b
    jp start
more:
    ld b,c
`, {});
console.log(JSON.stringify(result));
