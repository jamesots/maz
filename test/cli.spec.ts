import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { main } from '../src/cli';

describe('cli', function () {
    let dir: string;

    beforeAll(function () {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maz-'));
    });

    // runs maz, and returns the exit code and what it printed
    function run(args: string[]) {
        const output: string[] = [];
        const log = console.log;
        console.log = (...items: any[]) => output.push(items.join(' '));
        try {
            return { code: main(args), output: output.join('\n') };
        } finally {
            console.log = log;
        }
    }

    function writeSource(name: string, lines: string[]) {
        const file = path.join(dir, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, lines.join('\n') + '\n');
        return file;
    }

    it('should show how to use it, without a source and output file', function () {
        for (const args of [[], ['-s', 'x.z80'], ['--help']]) {
            const { code, output } = run(args);
            expect(code).to.equal(-1);
            expect(output).to.include('Macro Assembler for Z80');
            expect(output).to.include('--src');
        }
    });

    it('should assemble a file, and write a listing', function () {
        const src = writeSource('good.z80', ['start: ld a,1', '    halt']);
        const out = path.join(dir, 'good.bin');
        const list = path.join(dir, 'good.lst');
        const { code, output } = run(['-s', src, '-o', out, '-l', list]);
        expect(code).to.equal(0);
        expect([...fs.readFileSync(out)]).to.eql([0x3e, 1, 0x76]);
        expect(output).to.include(`Written 3 ($3) bytes ${out}`);
        expect(fs.readFileSync(list).toString()).to.include(
            '    1 0000 3e01               start: ld a,1'
        );
    });

    it('should report errors, and not write the output', function () {
        const src = writeSource('bad.z80', ['    ld a,nothere', '    jp nor']);
        const out = path.join(dir, 'bad.bin');
        const { code, output } = run([src, '-o', out]);
        expect(code).to.equal(64);
        expect(output).to.include("Symbol 'nothere' not found");
        expect(output).to.include('2 errors found');
        expect(fs.existsSync(out)).to.equal(false);
    });

    it('should report errors on one line each with --brief', function () {
        const src = writeSource('brief.z80', ['    nop', '    ld a,nothere']);
        const { code, output } = run(['-b', '-s', src, '-o', 'x']);
        expect(code).to.equal(64);
        expect(output).to.include(`${src}:2,10: Symbol 'nothere' not found`);
        expect(output).to.include('1 error found');
    });

    it('should warn about undocumented instructions with --undoc', function () {
        const src = writeSource('undoc.z80', ['    nop', '    sll b']);
        const list = path.join(dir, 'undoc.lst');
        const out = path.join(dir, 'undoc.bin');
        const { code, output } = run(['-u', '-s', src, '-o', out, '-l', list]);
        expect(code).to.equal(0);
        expect(output).to.include('Undocumented instructions used on line 2');
        const listing = fs.readFileSync(list).toString();
        expect(listing).to.include('U   2 0001 cb30');
        expect(listing).to.include('U = Undocumented instruction');
    });

    it('should look for included files in the search paths', function () {
        writeSource('lib/included.z80', ['    db 7']);
        const src = writeSource('search.z80', ['.include "included.z80"']);
        const out = path.join(dir, 'search.bin');
        const { code } = run([
            '-s',
            src,
            '-o',
            out,
            '-p',
            path.join(dir, 'lib'),
        ]);
        expect(code).to.equal(0);
        expect([...fs.readFileSync(out)]).to.eql([7]);
    });
});
