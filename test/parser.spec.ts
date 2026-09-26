import * as parser from '../lib/parser';
import Tracer from 'pegjs-backtrace';
import * as sourceMapSupport from 'source-map-support';
import * as mocha from 'mocha';
import * as chai from 'chai';
import { opcodes } from './opcodes';
const expect = chai.expect;
sourceMapSupport.install();

describe('parser', function () {
    // the tests look at whichever fields the elements have
    function parse(text: string): any {
        const tracer = new Tracer(text);
        try {
            return parser.parse(text, {
                trace: true,
                tracer: tracer,
                source: 0,
                line: 1,
            });
        } catch (e) {
            console.log(tracer.getBacktraceString());
            throw e;
        }
    }

    function testOpcode(opcode: string, bytes: number[]) {
        const result = parse(opcode);
        expect(result[0].bytes).to.equal(bytes);
    }

    it('should parse empty file', function () {
        const result = parse(``);
        expect(result).to.be.null;
    });
    it('should parse whitespace only', function () {
        const result = parse(`      
        `);
        expect(result).to.be.null;
    });
    it('should parse nop', function () {
        const result = parse('nop');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0]);
    });
    it('should parse nop with whitespace', function () {
        const result = parse('  nop   ');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0]);
    });
    it('should parse nop with label', function () {
        const result = parse('thing:  nop   ');
        expect(result.length).to.equal(2);
        expect(result[0].label).to.eql('thing');
        expect(result[1].bytes).to.eql([0]);
    });
    it('should parse nop with two labels', function () {
        const result = parse(`
        blah:
        thing:  nop   `);
        expect(result.length).to.equal(3);
        expect(result[0].label).to.eql('blah');
        expect(result[1].label).to.eql('thing');
        expect(result[2].bytes).to.eql([0]);
    });
    it('should parse nop with comment, followed by nop', function () {
        const result = parse(`thing:  nop  ; lovely stuff
        nop`);
        expect(result.length).to.equal(3);
        expect(result[0].label).to.eql('thing');

        expect(result[1].bytes).to.eql([0]);

        expect(result[2].bytes).to.eql([0]);
        expect(result[2].label).to.be.undefined;
    });
    it('should parse nop with comment, followed by eof', function () {
        const result = parse(`thing:  nop  ; lovely stuff`);
        expect(result.length).to.equal(2);
        expect(result[0].label).to.eql('thing');
        expect(result[1].bytes).to.eql([0]);
    });

    for (const opcode of opcodes) {
        it('should parse ' + opcode[0], function () {
            const result = parse(opcode[0]);
            expect(result[0].bytes).to.eql(opcode[1]);
            expect(result[0].undoc).to.eql(opcode[2]);
        });
        // instructions aren't case sensitive, but symbols are
        const caps = opcode[0]
            .toUpperCase()
            .replace('CHR', 'chr')
            .replace('START', 'start')
            .replace('BCA', 'bca');
        it('should parse ' + caps, function () {
            const result = parse(caps);
            expect(result[0].bytes).to.eql(opcode[1]);
            expect(result[0].undoc).to.eql(opcode[2]);
        });
    }

    // now parses as ld(hl),(a symbol called hl)
    // it('should not parse ld (hl),(hl)', function() {
    //     expect(function() {
    //         const result = parser.parse('ld (hl),(hl)', {trace: false, tracer: null});
    //     }).to.throw();
    // });
    it('should parse ld a,"one"', function () {
        const result = parse('ld a,"one"');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0x3e, 0x6f]);
    });
    it('should parse ld hl,"one"', function () {
        const result = parse('ld hl,"one"');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0x21, 0x6f, 0x6e]);
    });
    it('should parse db string in double quotes', function () {
        const result = parse('db "hello"');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([104, 101, 108, 108, 111]);
    });
    it('should parse db string in single quotes', function () {
        const result = parse("db 'hello'");
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([104, 101, 108, 108, 111]);
    });
    it('should parse db number', function () {
        const result = parse('db 12');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([12]);
    });
    it('should parse db big number', function () {
        const result = parse('db $1234');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0x34]);
    });
    it('should parse db multiple numbers', function () {
        const result = parse('db 12,13');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([12, 13]);
    });
    it('should parse db big multiple numbers', function () {
        const result = parse('db $1234,$5432');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0x34, 0x32]);
    });
    it('should parse db numbers and strings', function () {
        const result = parse('db "he",108,108,"o"');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([104, 101, 108, 108, 111]);
    });
    it('should parse db numbers and strings followed by something', function () {
        const result = parse(`db "he",108
nop`);
        expect(result.length).to.equal(2);
        expect(result[0].bytes).to.eql([104, 101, 108]);
        expect(result[1].bytes).to.eql([0]);
    });
    it('should parse db expression', function () {
        const result = parse('db 5 + 6');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([11]);
    });
    it('should parse db label', function () {
        const result = parse('db thing');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([
            {
                expression: 'thing',
                vars: ['thing'],
                location: { line: 1, column: 4, source: 0 },
            },
        ]);
    });
    it('should parse db complex escaping', function () {
        const result = parse('db "\\"Hey \\0\\r\\n\\x13" ');
        expect(String.fromCharCode.apply(this, result[0].bytes)).to.equal(
            '"Hey \0\r\n\x13'
        );
    });
    it('should parse equ', function () {
        const result = parse('thing: equ 6');
        expect(result.length).to.equal(2);
        expect(result[0].label).to.eql('thing');
        expect(result[1].equ).to.eql(6);
        // console.log(JSON.stringify(result));
    });
    it('should parse macrocall', function () {
        const result = parse('thing');
        expect(result[0]).to.eql({
            macrocall: 'thing',
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse macrocall with args', function () {
        const result = parse('thing 1, 2,3');
        expect(result[0]).to.eql({
            macrocall: 'thing',
            args: [1, 2, 3],
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse macrocall with args', function () {
        const result = parse('thing 1, a, "hello"');
        expect(result[0]).to.eql({
            macrocall: 'thing',
            args: [
                1,
                {
                    expression: 'a',
                    vars: ['a'],
                    location: { line: 1, column: 10, source: 0 },
                },
                'hello',
            ],
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse macrodef', function () {
        const result = parse('macro thing');
        expect(result[0]).to.eql({
            macrodef: 'thing',
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse macrodef with params', function () {
        const result = parse('macro thing a, b, c');
        expect(result[0]).to.eql({
            macrodef: 'thing',
            params: ['a', 'b', 'c'],
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse defs', function () {
        const result = parse('defs 123');
        expect(result[0]).to.eql({
            defs: 123,
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse ds', function () {
        const result = parse('ds 123');
        expect(result[0]).to.eql({
            defs: 123,
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });
    it('should parse ds with expression', function () {
        const result = parse('ds a + 2');
        expect(result[0]).to.eql({
            defs: {
                expression: 'a + 2',
                vars: ['a'],
                location: { line: 1, column: 4, source: 0 },
            },
            location: {
                line: 1,
                column: 1,
                source: 0,
            },
        });
    });

    it('should not parse db string * num', function () {
        expect(function () {
            const result = parse('db "hello" * 3');
        }).to.throw();
    });

    it('should parse db $', function () {
        const result = parse('db $');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([
            {
                expression: '$',
                vars: ['$'],
                location: { line: 1, column: 4, source: 0 },
            },
        ]);
    });

    it('should parse include', function () {
        const result = parse('.include "some/file.z80"');
        expect(result.length).to.equal(1);
        expect(result[0]).to.eql({
            include: 'some/file.z80',
            location: { line: 1, column: 1, source: 0 },
        });
    });

    it('should parse dw string', function () {
        const result = parse('dw "hello"');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([104, 101, 108, 108, 111, 0]);
    });

    it('should parse dw number', function () {
        const result = parse('dw $1234');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([0x34, 0x12]);
    });

    it('should parse dw things', function () {
        const result = parse('dw $1234,$99f0,"hel",$11');
        expect(result.length).to.equal(1);
        expect(result[0].bytes).to.eql([
            0x34, 0x12, 0xf0, 0x99, 104, 101, 108, 0, 0x11, 0x00,
        ]);
    });
});
