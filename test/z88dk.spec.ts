import * as compiler from '../lib/compiler';
import { opcodes } from './opcodes';
import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
const expect = chai.expect;

// Checks maz's instructions against z88dk: that z88dk's assembler (z80asm)
// assembles the instructions in opcodes.ts to the same bytes, and that
// maz can assemble every instruction z88dk's disassembler knows about.
// These are skipped if z88dk isn't installed. Set MAZ_Z80ASM to the
// z80asm command if it isn't z88dk-z80asm or z88dk.z88dk-z80asm (snap).

function findCommand(names: string[]) {
    for (const name of names) {
        try {
            execFileSync('which', [name], { stdio: 'ignore' });
            return name;
        } catch {}
    }
    return undefined;
}

const z80asm =
    process.env.MAZ_Z80ASM ||
    findCommand(['z88dk-z80asm', 'z88dk.z88dk-z80asm']);
const disassembler = z80asm && z80asm.replace(/z80asm$/, 'dis');
// not in /tmp, as the snap version of z88dk has its own /tmp
const dir = path.join('build', 'z88dk');

// instructions which only maz has
const mazOnly = new Set(['pfix', 'pfiy']);

// instructions which z88dk's disassembler has, but maz doesn't: traps
// for emulators, and names for undocumented duplicates of other
// instructions
const z88dkOnly = new Set(['trap', 'ld i,i', 'ld r,r', 'im 0/1']);

function hex(bytes: number[]) {
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Assembles lines with maz, and returns the bytes and errors for each line
 */
function assembleWithMaz(lines: string[]) {
    const log = console.log;
    console.log = () => {};
    let prog;
    try {
        prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', lines),
        });
    } finally {
        console.log = log;
    }
    const memory = new Map<number, number>();
    for (const segment of prog.getSegments()) {
        segment.bytes.forEach((b, i) => memory.set(segment.address + i, b));
    }
    const bytes: { [line: number]: string } = {};
    for (const line of prog.getLines()) {
        const lineBytes = [];
        for (let i = 0; i < line.length; i++) {
            lineBytes.push(memory.get(line.out + i));
        }
        bytes[line.line] = hex(lineBytes);
    }
    const errors: { [line: number]: string } = {};
    for (const error of prog.errors) {
        if (error.location && !errors[error.location.line]) {
            errors[error.location.line] = error.error;
        }
    }
    return { bytes, errors };
}

/**
 * Whether z88dk's bytes are another way of encoding what maz produces, e.g.
 * an unused prefix, or an undocumented duplicate opcode
 */
function isAlternative(text: string, z88dkBytes: string, mazBytes: string) {
    const prefix = z88dkBytes.slice(0, 2);
    const rest = z88dkBytes.slice(2);
    // a dd, fd or ed prefix which doesn't change the instruction
    if (['dd', 'fd', 'ed'].includes(prefix) && rest === mazBytes) {
        return true;
    }
    // undefined ed opcodes, which z88dk shows as nop
    if (text === 'nop') {
        return true;
    }
    // relative jumps after an unused prefix, whose offset is one less
    if (
        ['dd', 'fd'].includes(prefix) &&
        ['10', '18', '20', '28', '30', '38'].includes(rest.slice(0, 2))
    ) {
        return true;
    }
    // duplicates of neg, retn, im, and ld (nn),hl and ld hl,(nn)
    if (
        prefix === 'ed' &&
        /^(4c|54|5c|64|6c|74|7c|55|5d|65|6d|75|7d|66|76|7e|63|6b)/.test(rest)
    ) {
        return true;
    }
    // duplicates of bit n,(ix+d)
    if (
        /^(dd|fd)cb..[4-7][0-9a-f]$/.test(z88dkBytes) &&
        text.startsWith('bit ')
    ) {
        return true;
    }
    return false;
}

/**
 * Changes z88dk's syntax to maz's, e.g. ld b,rlc (ix+$12) to
 * rlc (ix+$12),b
 */
function toMazSyntax(text: string) {
    const match =
        /^ld ([abcdehl]),((?:rlc|rrc|rl|rr|sla|sra|sll|srl) |(?:set|res) [0-7],)(\(i[xy][^)]*\))$/.exec(
            text
        );
    if (match) {
        return `${match[2]}${match[3]},${match[1]}`;
    }
    return text;
}

describe('z88dk', function () {
    this.timeout(60000);

    before(function () {
        if (!z80asm) {
            this.skip();
        }
        fs.mkdirSync(dir, { recursive: true });
    });

    it('should assemble instructions to the same bytes as z80asm', function () {
        const instructions = opcodes
            .filter(
                ([text, bytes]) =>
                    !mazOnly.has(text) &&
                    bytes.every((byte) => typeof byte === 'number')
            )
            .map(([text]) => text);
        const file = path.join(dir, 'instructions.asm');
        fs.writeFileSync(
            file,
            instructions.map((text) => `    ${text}\n`).join('')
        );
        execFileSync(z80asm, ['-l', '-b', file], { stdio: 'pipe' });

        // z80asm's listing has the line number, address, bytes and source
        const z88dkBytes: { [line: number]: string } = {};
        const listing = fs
            .readFileSync(path.join(dir, 'instructions.lis'))
            .toString();
        for (const line of listing.split('\n')) {
            const match = /^\s*(\d+)\s+[0-9a-f]{4}\s+([0-9a-f]+)\s/.exec(line);
            if (match) {
                z88dkBytes[Number(match[1])] = match[2];
            }
        }

        const maz = assembleWithMaz(instructions.map((text) => `    ${text}`));
        const differences = [];
        instructions.forEach((text, i) => {
            const line = i + 1;
            if (maz.bytes[line] !== z88dkBytes[line]) {
                differences.push(
                    `${text}: z80asm ${z88dkBytes[line]}, maz ${
                        maz.errors[line] || maz.bytes[line]
                    }`
                );
            }
        });
        expect(differences).to.eql([]);
    });

    it('should assemble every instruction which z88dk can disassemble', function () {
        // every opcode, each in its own 8 byte block: the prefix, the
        // opcode, then operand bytes 12 and 34, which are single byte
        // instructions so they can't run into the next block, then nops
        const binary = [];
        for (const prefix of [
            [],
            [0xcb],
            [0xed],
            [0xdd],
            [0xfd],
            [0xdd, 0xcb],
            [0xfd, 0xcb],
        ]) {
            for (let opcode = 0; opcode < 256; opcode++) {
                const block =
                    prefix.length === 2
                        ? [...prefix, 0x12, opcode]
                        : [...prefix, opcode, 0x12, 0x34];
                while (block.length < 8) {
                    block.push(0);
                }
                binary.push(...block);
            }
        }
        const file = path.join(dir, 'opcodes.bin');
        fs.writeFileSync(file, Buffer.from(binary));
        const disassembly = execFileSync(disassembler, [file]).toString();

        // the instruction at the start of each block
        const instructions: { text: string; address: number; bytes: string }[] =
            [];
        const seen = new Set<string>();
        for (const line of disassembly.split('\n')) {
            const match =
                /^\s+(\S+)\s*(.*?)\s*;\[([0-9a-f]{4})\]\s+([0-9a-f ]+?)\s*$/.exec(
                    line
                );
            if (!match) {
                continue;
            }
            const address = parseInt(match[3], 16);
            const text = `${match[1]} ${match[2]}`.trim();
            const bytes = match[4].replace(/ /g, '');
            if (
                address % 8 !== 0 ||
                z88dkOnly.has(text) ||
                seen.has(text + bytes)
            ) {
                continue;
            }
            seen.add(text + bytes);
            instructions.push({ text, address, bytes });
        }
        expect(instructions.length).to.be.above(1000);

        // assemble each instruction at the same address, as relative jumps
        // are disassembled with the address they jump to
        const source = [];
        const lines = [];
        for (const instruction of instructions) {
            source.push(`    org $${instruction.address.toString(16)}`);
            source.push(`    ${toMazSyntax(instruction.text)}`);
            lines.push(source.length);
        }
        const maz = assembleWithMaz(source);
        const problems = [];
        instructions.forEach((instruction, i) => {
            const line = lines[i];
            const mazBytes = maz.bytes[line];
            if (maz.errors[line] || mazBytes === undefined) {
                problems.push(
                    `${instruction.text} (${instruction.bytes}): ${
                        maz.errors[line] || 'no bytes'
                    }`
                );
            } else if (
                mazBytes !== instruction.bytes &&
                !isAlternative(instruction.text, instruction.bytes, mazBytes)
            ) {
                problems.push(
                    `${instruction.text}: z88dk ${instruction.bytes}, maz ${mazBytes}`
                );
            }
        });
        expect(problems).to.eql([]);
    });
});
