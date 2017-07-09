import * as parser from './parser';

console.log("MAZ v0.1.0");

const result = parser.parse(`
    org $5_00
start:    ld a,b
    jp start
more:
    ld b,c
    ld a,a
    ld (hl),d
    ld e,(hl)
    ld sp, hl
    ld bc,(123)
    inc de
    inc sp
    add hl,de
    pop af
    push de
    ld sp,10110b
`, {});
console.log(JSON.stringify(result, undefined, 2));
