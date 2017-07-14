import * as compiler from './compiler';

console.log("MAZ v0.1.0");

const source = `
thing:
bdos: equ 5
blob: equ glop
glop: equ bdos
a: equ 100
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

let [ast, symbols] = compiler.compile(source);
console.log(JSON.stringify(ast, undefined, 2));
console.log(JSON.stringify(symbols, undefined, 2));
console.log(JSON.stringify(compiler.getBytes(ast), undefined, 2));