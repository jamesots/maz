import * as compiler from '../src/compiler';
import { describe, it, expect, beforeEach } from 'vitest';

describe('compiler', function () {
    // the unit tests look at the private parts of Programme
    let prog: any;

    beforeEach(function () {
        prog = new compiler.Programme({});
    });

    // how each symbol is defined: 'label', { equ: value } or { arg: value },
    // or a list of those if it's defined more than once
    function definitions(prog: any) {
        const result: { [name: string]: any } = {};
        for (const [name, list] of prog.definitions) {
            const described = list.map((definition: any) =>
                definition.kind === 'label'
                    ? 'label'
                    : { [definition.kind]: definition.value }
            );
            result[name] = described.length === 1 ? described[0] : described;
        }
        return result;
    }
    function assemble(prog: any) {
        prog.getSymbols();
        prog.assemble();
    }
    function values(prog: any) {
        const result: { [name: string]: any } = {};
        for (const [name, value] of prog.values) {
            result[name] = value;
        }
        return result;
    }
    function placement(prog: any, index: number) {
        return prog.finalPass.placements[index];
    }
    function copy(ast: any[]) {
        return JSON.parse(JSON.stringify(ast));
    }

    it('should get symbols', function () {
        prog.ast = [{ label: 'one' }, { label: 'two' }];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: 'label',
            two: 'label',
        });
    });
    it('should get symbols in a block', function () {
        prog.ast = [
            { label: 'one' },
            { block: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { label: 'two' },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: 'label',
            '%0_one': 'label',
            two: 'label',
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
    });
    it('should get public symbols in a block', function () {
        prog.ast = [
            { label: 'one' },
            { block: true },
            { label: 'three', public: true },
            { endblock: true, endprefix: true },
            { label: 'two' },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: 'label',
            three: 'label',
            two: 'label',
        });
    });
    it('should not allow symbol to repeat at top level', function () {
        prog.ast = [{ label: 'one' }, { label: 'one' }];
        prog.getSymbols();
        expect(prog.errors.length).to.equal(1);
    });
    it('should not allow symbol to repeat in a block', function () {
        prog.ast = [
            { block: true },
            { label: 'one' },
            { label: 'one' },
            { endblock: true, endprefix: true },
        ];
        prog.getSymbols();
        expect(prog.errors.length).to.equal(1);
    });
    it('should get symbols in two blocks', function () {
        prog.ast = [
            { label: 'one' },
            { block: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { block: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { label: 'two' },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: 'label',
            '%0_one': 'label',
            '%1_one': 'label',
            two: 'label',
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
        expect(prog.ast[4].prefix).to.equal('%1_');
    });
    it('should get symbols in nested blocks', function () {
        prog.ast = [
            { label: 'one' },
            { block: true },
            { label: 'one' },
            { block: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { endblock: true, endprefix: true },
            { label: 'two' },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: 'label',
            '%0_one': 'label',
            '%1_%0_one': 'label',
            two: 'label',
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
        expect(prog.ast[3].prefix).to.equal('%1_%0_');
    });
    it('should get symbols in multiple nested blocks', function () {
        prog.ast = [
            { label: 'one' },
            { block: true },
            { label: 'one' },
            { block: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { endblock: true, endprefix: true },
            { block: true },
            { block: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { label: 'one' },
            { endblock: true, endprefix: true },
            { label: 'two' },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: 'label',
            '%0_one': 'label',
            '%1_%0_one': 'label',
            '%3_%2_one': 'label',
            '%2_one': 'label',
            two: 'label',
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
        expect(prog.ast[3].prefix).to.equal('%1_%0_');
        expect(prog.ast[7].prefix).to.equal('%2_');
        expect(prog.ast[8].prefix).to.equal('%3_%2_');
    });
    it('should get symbols of EQUs', function () {
        prog.ast = [{ label: 'one' }, { equ: 5 }];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: { equ: 5 },
        });
    });
    it('should give EQUs their value, not an address', function () {
        prog.ast = [{ bytes: [0] }, { label: 'one' }, { equ: 5 }];
        assemble(prog);
        expect(values(prog)).to.eql({
            one: 5,
        });
    });
    it('should evaluate $ in EQUs as the address of the EQU', function () {
        prog.ast = [
            { bytes: [0, 0] },
            { label: 'one' },
            {
                equ: {
                    expression: '$',
                    vars: ['$'],
                },
            },
        ];
        const ast = copy(prog.ast);
        assemble(prog);
        expect(values(prog)).to.eql({ one: 2 });
        // assembling doesn't change the ast
        expect(prog.ast).to.eql(ast);
    });
    it('should assign PC', function () {
        prog.ast = [
            { label: 'one' },
            { bytes: [0, 0, 0] },
            { label: 'two' },
            { bytes: [0, 0, 0] },
            { label: 'three' },
            { bytes: [0, 0, 0] },
            { org: 123 },
            { bytes: [0, 0, 0] },
            { label: 'four' },
            { bytes: [0, 0, 0] },
            { phase: 200 },
            { bytes: [0, 0, 0] },
            { label: 'five' },
            { bytes: [0, 0, 0] },
            { phase: 300 },
            { bytes: [0, 0, 0] },
            { label: 'six' },
            { bytes: [0, 0, 0] },
            { endphase: true },
            { bytes: [0, 0, 0] },
            { label: 'seven' },
            { bytes: [0, 0, 0] },
            { endphase: true },
            { bytes: [0, 0, 0] },
            { label: 'eight' },
        ];
        const ast = copy(prog.ast);
        assemble(prog);
        expect(values(prog)).to.eql({
            one: 0,
            two: 3,
            three: 6,
            four: 126,
            five: 203,
            six: 303,
            seven: 144,
            eight: 150,
        });
        const placements: { address: number; out: number }[] = [];
        prog.ast.forEach((el: any, i: number) => {
            if (el.bytes) {
                const { address, out } = placement(prog, i);
                placements.push({ address, out });
            }
        });
        expect(placements).to.eql([
            { address: 0, out: 0 },
            { address: 3, out: 3 },
            { address: 6, out: 6 },
            { address: 123, out: 123 },
            { address: 126, out: 126 },
            { address: 200, out: 129 },
            { address: 203, out: 132 },
            { address: 300, out: 135 },
            { address: 303, out: 138 },
            { address: 141, out: 141 },
            { address: 144, out: 144 },
            { address: 147, out: 147 },
        ]);
        expect(prog.ast).to.eql(ast);
    });
    it('should evaluate ORG expressions where possible', function () {
        prog.ast = [
            { label: 'one' },
            { bytes: [0] },
            {
                org: {
                    expression: 'one + 5',
                    vars: ['one'],
                },
            },
            { bytes: [0] },
        ];
        const ast = copy(prog.ast);
        assemble(prog);
        expect(prog.errors).to.eql([]);
        expect(placement(prog, 3).out).to.equal(5);
        expect(prog.ast).to.eql(ast);
    });
    it('should not evaluate ORG expressions where not possible', function () {
        prog.ast = [
            { label: 'one' },
            {
                org: {
                    expression: 'two',
                    vars: ['two'],
                },
            },
            { label: 'two' },
        ];
        assemble(prog);
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate ORG expressions using EQUs defined later', function () {
        prog.ast = [
            {
                org: {
                    expression: 'one',
                    vars: ['one'],
                },
            },
            { bytes: [0] },
            { label: 'one' },
            { equ: 5 },
        ];
        assemble(prog);
        expect(prog.errors).to.eql([]);
        expect(placement(prog, 1).out).to.equal(5);
    });
    it('should evaluate PHASE expressions where possible', function () {
        prog.ast = [
            { label: 'one' },
            { bytes: [0] },
            {
                phase: {
                    expression: 'one + 5',
                    vars: ['one'],
                },
            },
            { bytes: [0] },
        ];
        assemble(prog);
        expect(prog.errors).to.eql([]);
        expect(placement(prog, 3)).to.eql({ address: 5, out: 1, bytes: [0] });
    });
    it('should not evaluate PHASE expressions where not possible', function () {
        prog.ast = [
            { label: 'one' },
            {
                phase: {
                    expression: 'two',
                    vars: ['two'],
                },
            },
            { label: 'two' },
        ];
        assemble(prog);
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate PHASE expressions using EQUs defined later', function () {
        prog.ast = [
            {
                phase: {
                    expression: 'one',
                    vars: ['one'],
                },
            },
            { bytes: [0] },
            { label: 'one' },
            { equ: 5 },
        ];
        assemble(prog);
        expect(prog.errors).to.eql([]);
        expect(placement(prog, 1)).to.eql({ address: 5, out: 0, bytes: [0] });
    });
    it('should evaluate ALIGN expressions where possible', function () {
        prog.ast = [
            { bytes: [0] },
            { label: 'one' },
            {
                align: {
                    expression: 'one * 4',
                    vars: ['one'],
                },
            },
            { bytes: [0] },
        ];
        assemble(prog);
        expect(prog.errors).to.eql([]);
        expect(placement(prog, 3).out).to.equal(4);
    });
    it('should not evaluate ALIGN expressions where not possible', function () {
        prog.ast = [
            { label: 'one' },
            {
                align: {
                    expression: 'two',
                    vars: ['two'],
                },
            },
            { label: 'two' },
        ];
        assemble(prog);
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate ALIGN expressions using EQUs defined later', function () {
        prog.ast = [
            { bytes: [0] },
            {
                align: {
                    expression: 'one',
                    vars: ['one'],
                },
            },
            { bytes: [0] },
            { label: 'one' },
            { equ: 5 },
        ];
        assemble(prog);
        expect(prog.errors).to.eql([]);
        expect(placement(prog, 2).out).to.equal(5);
    });
    it('should get EQU', function () {
        prog.ast = [
            { label: 'one' },
            { label: 'two' },
            { equ: 5 },
            { label: 'three' },
            {
                equ: {
                    expr: 'one',
                },
            },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            one: { equ: 5 },
            two: { equ: 5 },
            three: { equ: { expr: 'one' } },
        });
    });
    it('should evaluate symbols', function () {
        prog.ast = [
            { label: 'one' },
            { equ: 1 },
            { label: 'two' },
            { equ: { expression: 'three', vars: ['three'] } },
            { label: 'three' },
            { equ: { expression: 'one', vars: ['one'] } },
        ];
        assemble(prog);
        expect(values(prog)).to.eql({
            one: 1,
            two: 1,
            three: 1,
        });
    });
    it('should evaluate symbols and detect circular references', function () {
        prog.ast = [
            { label: 'one' },
            { equ: 1 },
            { label: 'two' },
            { equ: { expression: 'three', vars: ['three'] } },
            { label: 'three' },
            { equ: { expression: 'two', vars: ['two'] } },
        ];
        assemble(prog);
        expect(prog.errors.map((e: any) => e.error)).to.eql([
            'Circular definition: two -> three -> two',
        ]);
        expect(values(prog)).to.eql({
            one: 1,
            two: undefined,
            three: undefined,
        });
    });
    it('should evaluate symbols with scope', function () {
        prog.ast = [];
        const equ = (value: any) => [{ kind: 'equ', index: 0, value }];
        prog.definitions = new Map([
            ['%1_two', equ({ expression: 'three', vars: ['three'] })],
            ['three', equ(3)],
            ['%1_three', equ(4)],
            ['%2_%1_three', equ(5)],
            [
                '%2_%1_bob',
                equ({ expression: 'three + two', vars: ['three', 'two'] }),
            ],
        ]);
        prog.assemble();
        expect(values(prog)).to.eql({
            '%1_two': 4,
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': 9,
        });
    });
    it('should get whole prefix', function () {
        expect(compiler.getWholePrefix('%2_%3_%4_bob')).to.equal('%2_%3_%4_');
    });
    it('should get reduced prefix', function () {
        expect(compiler.getReducedPrefix('%2_%3_%4_')).to.equal('%3_%4_');
    });
    it('should find variable', function () {
        const definitions = new Map();
        for (const name of [
            '%2_%1_%0_a',
            '%2_%1_%0_b',
            '%1_%0_c',
            '%0_d',
            'e',
            'd',
            'c',
            '%0_c',
            'b',
            '%0_b',
            '%1_%0_b',
        ]) {
            definitions.set(name, { kind: 'equ', index: 0, value: 0 });
        }
        const evaluator = new compiler.Evaluator(
            definitions,
            new compiler.Pass(),
            undefined,
            () => {}
        );
        const resolve = (prefix: string, name: string) =>
            evaluator.resolve(prefix, name);
        expect(resolve('%2_%1_%0_', 'a')).to.equal('%2_%1_%0_a');
        expect(resolve('%2_%1_%0_', 'b')).to.equal('%2_%1_%0_b');
        expect(resolve('%2_%1_%0_', 'c')).to.equal('%1_%0_c');
        expect(resolve('%2_%1_%0_', 'd')).to.equal('%0_d');
        expect(resolve('%2_%1_%0_', 'e')).to.equal('e');

        expect(resolve('%1_%0_', 'b')).to.equal('%1_%0_b');
        expect(resolve('%1_%0_', 'c')).to.equal('%1_%0_c');
        expect(resolve('%1_%0_', 'd')).to.equal('%0_d');
        expect(resolve('%1_%0_', 'e')).to.equal('e');

        expect(resolve('%0_', 'c')).to.equal('%0_c');
        expect(resolve('%0_', 'd')).to.equal('%0_d');
        expect(resolve('%0_', 'e')).to.equal('e');

        expect(resolve('', 'd')).to.equal('d');
        expect(resolve('', 'e')).to.equal('e');
        expect(resolve('', 'f')).to.equal(undefined);
    });
    it('should assemble bytes', function () {
        const three = { expression: 'three', vars: ['three'] };
        const abc = { expression: '"abc"', vars: [] };
        prog.ast = [
            { label: 'three' },
            { equ: 0x1234 },
            { references: true, bytes: [0, three] },
            { references: true, bytes: [0, three, null] },
            { references: true, bytes: [0, { expression: '$', vars: ['$'] }] },
            { references: true, defb: true, bytes: [0, three, 0] },
            { references: true, defw: true, bytes: [0, three, 0] },
            { references: true, defb: true, bytes: [0, abc, 0] },
            { references: true, defw: true, bytes: [0, abc, 0] },
            { references: true, bytes: [0, abc, 0] },
            { references: true, bytes: [0, abc, null, 0] },
        ];
        const ast = copy(prog.ast);
        assemble(prog);
        expect(
            prog.ast
                .slice(2)
                .map((el: any, i: number) => placement(prog, i + 2).bytes)
        ).to.eql([
            [0, 0x34],
            [0, 0x34, 0x12],
            [0, 5],
            [0, 0x34, 0],
            [0, 0x34, 0x12, 0],
            [0, 97, 98, 99, 0],
            [0, 97, 98, 99, 0, 0],
            [0, 97, 0],
            [0, 97, 98, 0],
        ]);
        expect(prog.ast).to.eql(ast);
    });
    it('should assemble bytes with scope', function () {
        prog.ast = [
            { label: 'one' },
            { equ: 1 },
            { block: true },
            { label: 'one' },
            { equ: 2 },
            {
                bytes: [{ expression: 'one', vars: ['one'] }],
                references: true,
            },
            { endblock: true, endprefix: true },
            {
                bytes: [{ expression: 'one', vars: ['one'] }],
                references: true,
            },
        ];
        assemble(prog);
        expect(placement(prog, 5).bytes).to.eql([2]);
        expect(placement(prog, 7).bytes).to.eql([1]);
    });
    it('should find macros', function () {
        prog.ast = [{ macrodef: 'thing' }, { endmacro: true }];
        const macros = prog.getMacros();
        expect(macros).to.eql({
            thing: {
                params: [],
                ast: [],
            },
        });
    });
    it('should not allow macro name to repeat', function () {
        prog.ast = [
            { macrodef: 'thing' },
            { endmacro: true },
            { macrodef: 'thing' },
            { endmacro: true },
        ];
        const macros = prog.getMacros();
        expect(prog.errors.length).to.equal(1);
    });
    it('should find macros with content', function () {
        prog.ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true },
        ];
        const macros = prog.getMacros();
        expect(macros).to.eql({
            thing: {
                params: [],
                ast: [{ bytes: [1, 2, 3] }],
            },
        });
    });
    it('should find macros with args', function () {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3] },
            { endmacro: true },
        ];
        const macros = prog.getMacros();
        expect(macros).to.eql({
            thing: {
                params: ['a', 'b'],
                ast: [{ bytes: [1, 2, 3] }],
            },
        });
    });
    it('should not like nested macros', function () {
        prog.ast = [
            { macrodef: 'thing1' },
            { macrodef: 'thing2' },
            { endmacro: true },
            { endmacro: true },
        ];
        prog.getMacros();
        expect(prog.errors.length).to.equal(2);
    });
    it("should not like macros which don't end", function () {
        prog.ast = [{ macrodef: 'thing2' }];
        prog.getMacros();
        expect(prog.errors.length).to.equal(1);
    });
    it("should not like macros which don't start", function () {
        prog.ast = [{ endmacro: true }];
        prog.getMacros();
        expect(prog.errors.length).to.equal(1);
    });
    it('should expand macros', function () {
        prog.ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing' },
            { bytes: [4] },
        ];
        const macros = prog.getMacros();
        prog.expandMacros();
        expect(prog.ast).to.eql([
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', params: [], expanded: true },
            { bytes: [1, 2, 3] },
            { endmacrocall: true },
            { bytes: [4] },
        ]);
    });
    it('should expand macros with params', function () {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', args: [1, 'hello'] },
            { bytes: [4] },
        ];
        const macros = prog.getMacros();
        prog.expandMacros();
        expect(prog.ast).to.eql([
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacro: true },
            { bytes: [0] },
            {
                macrocall: 'thing',
                params: ['a', 'b'],
                args: [1, 'hello'],
                expanded: true,
            },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacrocall: true },
            { bytes: [4] },
        ]);
    });
    it('should make copy of macro when expanding', function () {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', args: [1, 'hello'] },
            { macrocall: 'thing', args: [2, 'bob'] },
            { bytes: [4] },
        ];
        const macros = prog.getMacros();
        prog.expandMacros();
        expect(prog.ast).to.eql([
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacro: true },
            { bytes: [0] },
            {
                macrocall: 'thing',
                params: ['a', 'b'],
                args: [1, 'hello'],
                expanded: true,
            },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacrocall: true },
            {
                macrocall: 'thing',
                params: ['a', 'b'],
                args: [2, 'bob'],
                expanded: true,
            },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacrocall: true },
            { bytes: [4] },
        ]);
        prog.ast[8].bytes = [3];
        expect(prog.ast).to.eql([
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacro: true },
            { bytes: [0] },
            {
                macrocall: 'thing',
                params: ['a', 'b'],
                args: [1, 'hello'],
                expanded: true,
            },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacrocall: true },
            {
                macrocall: 'thing',
                params: ['a', 'b'],
                args: [2, 'bob'],
                expanded: true,
            },
            { bytes: [3] },
            { endmacrocall: true },
            { bytes: [4] },
        ]);
    });
    it('should get symbols from expanded macros', function () {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacro: true },
            { bytes: [0] },
            {
                macrocall: 'thing',
                params: ['a', 'b'],
                args: [1, 'hello'],
                expanded: true,
            },
            { bytes: [1, 2, 3, { expression: 'a + b', vars: ['a', 'b'] }] },
            { endmacrocall: true },
            { bytes: [4] },
        ];
        prog.getSymbols();
        expect(definitions(prog)).to.eql({
            '%0_a': { arg: 1 },
            '%0_b': { arg: 'hello' },
        });
    });
    it('should get bytes with org', function () {
        prog.ast = [
            { bytes: [1, 2, 3] },
            { org: 10 },
            { bytes: [4, 5, 6] },
            { org: 2 },
            { bytes: [7, 8, 9] },
        ];
        assemble(prog);
        expect(prog.getBytes()).to.eql([1, 2, 7, 8, 9, 0, 0, 0, 0, 0, 4, 5, 6]);
        expect(prog.getSegments()).to.eql([
            { address: 0, bytes: [1, 2, 7, 8, 9] },
            { address: 10, bytes: [4, 5, 6] },
        ]);
    });
    it('should get bytes with org, non-zero start', function () {
        prog.ast = [
            { org: 5 },
            { bytes: [1, 2, 3] },
            { org: 15 },
            { bytes: [4, 5, 6] },
            { org: 7 },
            { bytes: [7, 8, 9] },
        ];
        assemble(prog);
        expect(prog.getBytes()).to.eql([1, 2, 7, 8, 9, 0, 0, 0, 0, 0, 4, 5, 6]);
        expect(prog.getSegments()).to.eql([
            { address: 5, bytes: [1, 2, 7, 8, 9] },
            { address: 15, bytes: [4, 5, 6] },
        ]);
    });
    it('should not allow ORG less than first ORG', function () {
        prog.ast = [
            { org: 5 },
            { bytes: [1, 2, 3] },
            { org: 0 },
            { bytes: [4, 5, 6] },
            { org: 7 },
            { bytes: [7, 8, 9] },
        ];
        assemble(prog);
        expect(prog.errors.map((e: any) => e.error)).to.eql([
            'Cannot ORG to earlier address than first ORG',
        ]);
        expect(prog.getBytes()).to.eql([1, 2, 7, 8, 9]);
    });
    it('should calculate relative jumps', function () {
        prog.ast = [
            {
                references: true,
                bytes: [
                    1,
                    {
                        relative: {
                            expression: '0',
                            vars: [],
                        },
                    },
                ],
            },
        ];
        assemble(prog);
        expect(placement(prog, 0).bytes).to.eql([1, 0xfe]);
    });
    it('should handle macros in blocks', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '.block',
                '.macro bob',
                '.endm',
                'ld a,3',
                '.endblock',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([62, 3]);
    });
    it('should handle defw properly - should evaluate expression', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                'start: defw $+2',
                'defw $1234',
                'defw $2345,$3456',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([0x02, 0x00, 0x34, 0x12, 0x45, 0x23, 0x56, 0x34]);
    });
    it('should handle defb properly - strings should be the right length', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                'defb "hello"',
                'defb "hello"',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([
            0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x68, 0x65, 0x6c, 0x6c, 0x6f,
        ]);
    });
    it('should handle defb properly - multiple expressions on the same line should work', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                'defb cat("hello", $+1), $+10, $+11, $+12',
                'defb 5',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([0x68, 0x65, 0x6c, 0x6c, 0x6f, 49, 10, 11, 12, 5]);
    });
    it('should handle defb properly - simple forward references should not be errors', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defb more',
                'more:',
                '   defb 5',
                '   defb more',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([1, 5, 1]);
    });
    it('should handle defw properly - mutliple expressions should work', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                'a1: equ $0102',
                'a2: equ $0304',
                'a3: equ $0506',
                'a4: equ $0708',
                'defw a1,a2,a3,a4',
                'defw a1,a2,a3,a4',
                'defw a1,a2,a3,a4',
                'defw cat("a", "b", "c"), a1',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([
            0x02, 0x01, 0x04, 0x03, 0x06, 0x05, 0x08, 0x07, 0x02, 0x01, 0x04,
            0x03, 0x06, 0x05, 0x08, 0x07, 0x02, 0x01, 0x04, 0x03, 0x06, 0x05,
            0x08, 0x07, 0x61, 0x62, 0x63, 0x00, 0x02, 0x01,
        ]);
    });
    it('should handle defw properly - forward references should not be errors', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw more, more, 8',
                'more:',
                '   defb 5',
                '   defw more, 6',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([6, 0, 6, 0, 8, 0, 5, 6, 0, 6, 0]);
    });
    it('defw should pad strings', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw "123"',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([49, 50, 51, 0]);
    });
    it('defw cat should pad strings after catting', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw cat("1", "23")',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([49, 50, 51, 0]);
    });
    it('defw cat should interpret values as strings', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                'start: ',
                '   defw cat(start, "23")',
                'thing: equ 123',
                '   defw cat(thing, "0")',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([48, 50, 51, 0, 49, 50, 51, 48]);
    });
    it('should handle defw properly - larger forward references should not be errors', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw cat(more, "44"), 8',
                'more:', // it is incorrectly working this out to be 4, and then
                // overwriting the bytes from the previous line
                '   defb 5',
                '   defw more, 6',
            ]),
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([54, 52, 52, 0, 8, 0, 5, 6, 0, 6, 0]);
    });
    it('should handle defw properly - forward references through equs should not be errors', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw cat(x, "44"), 8',
                'x: equ more + 1',
                'more:',
                '   defb 5',
            ]),
        });
        expect(prog.errors).to.eql([]);
        const bytes = prog.getBytes();
        expect(bytes).to.eql([55, 52, 52, 0, 8, 0, 5]);
    });
    it('should re-evaluate align after earlier labels move', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw cat(more, "44")',
                'more:',
                '   .align more + 1',
                '   defb 1',
            ]),
        });
        expect(prog.errors).to.eql([]);
        const bytes = prog.getBytes();
        expect(bytes).to.eql([52, 52, 52, 0, 0, 1]);
    });
    it('should only report layout errors once', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw cat(more, "44")',
                'more:',
                '   defs nothere',
            ]),
        });
        expect(prog.errors.length).to.equal(1);
    });
    it('should handle defb properly - some forward references should be errors', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', [
                '   defw rpt("hi", more)',
                'more:',
                '   defb 5',
            ]),
        });
        expect(prog.errors.length).to.be.above(0);
    });
    it('should handle includes properly', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolvers({
                test: ['.include "src/one"', '.include "src/two"'],
                'src/one': [';.include "src/two"'],
                'src/two': [';blah'],
            }),
        });
    });
    it('should find incbin files relative to the file they are in', function () {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolvers({
                test: ['.include "src/one"'],
                'src/one': ['.include "deeper/two"', '.incbin "data"'],
                'src/deeper/two': ['   nop'],
                'src/data': ['hi'],
            }),
        });
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([0, 0x68, 0x69]);
    });
    function compileLines(lines: string[]) {
        return compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test', lines),
        });
    }
    function errorMessages(prog: compiler.Programme) {
        return prog.errors.map((e) => e.error);
    }
    it('should not assemble an .if nested in a false .if', function () {
        const prog = compileLines([
            '.if 0',
            '.if 1',
            '   nop',
            '.else',
            '   halt',
            '.endif',
            '.else',
            '   di',
            '.endif',
        ]);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([0xf3]);
    });
    it('should not evaluate an .if nested in a false .if', function () {
        const prog = compileLines([
            '.if 0',
            '.if nothere',
            '   nop',
            '.endif',
            '.endif',
            '   di',
        ]);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([0xf3]);
    });
    it('should report .if without .endif', function () {
        const prog = compileLines(['.if 1', '   nop']);
        expect(errorMessages(prog)).to.eql(['.if without .endif']);
    });
    it('should report .endif without .if', function () {
        const prog = compileLines(['   nop', '.endif']);
        expect(errorMessages(prog)).to.eql(['.endif without .if']);
    });
    it('should report .else without .if', function () {
        const prog = compileLines(['   nop', '.else']);
        expect(errorMessages(prog)).to.eql(['.else without .if']);
    });
    it('should report more than one .else', function () {
        const prog = compileLines(['.if 1', '.else', '.else', '.endif']);
        expect(errorMessages(prog)).to.eql(['More than one .else for .if']);
    });
    it('should allow 8 bit values from -128 to 255', function () {
        const prog = compileLines(['   ld a,-128', '   ld a,255']);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([0x3e, 0x80, 0x3e, 0xff]);
    });
    it('should report out of range 8 bit values', function () {
        const prog = compileLines([
            '   ld a,256',
            '   ld a,-129',
            '   ld a,x',
            'x: equ 300',
        ]);
        expect(errorMessages(prog)).to.eql([
            'Value 256 is out of range for an 8 bit value (-128 to 255)',
            'Value -129 is out of range for an 8 bit value (-128 to 255)',
            'Value 300 is out of range for an 8 bit value (-128 to 255)',
        ]);
    });
    it('should report out of range 16 bit values', function () {
        const prog = compileLines([
            '   ld hl,65535',
            '   ld hl,-32768',
            '   ld hl,65536',
            '   ld hl,x',
            'x: equ -32769',
        ]);
        expect(errorMessages(prog)).to.eql([
            'Value 65536 is out of range for a 16 bit value (-32768 to 65535)',
            'Value -32769 is out of range for a 16 bit value (-32768 to 65535)',
        ]);
    });
    it('should report out of range index offsets', function () {
        const prog = compileLines([
            '   ld a,(ix+127)',
            '   ld a,(ix+-128)',
            '   ld a,(ix+128)',
            '   bit 3,(iy+d)',
            'd: equ 200',
        ]);
        expect(errorMessages(prog)).to.eql([
            'Value 128 is out of range for an index offset (-128 to 127)',
            'Value 200 is out of range for an index offset (-128 to 127)',
        ]);
    });
    it('should report division by zero in instructions', function () {
        const prog = compileLines(['   ld a,1/0']);
        expect(errorMessages(prog)).to.eql([
            'Invalid value Infinity for an 8 bit value',
        ]);
    });
    it('should allow index offsets with + or -', function () {
        const prog = compileLines([
            '   ld a,(ix+5)',
            '   ld a,(ix-5)',
            '   ld a,(iy - 5)',
            '   ld a,(ix+-5)',
            '   ld a,(ix-2+1)',
            '   ld a,(ix-d+1)',
            'd: equ 5',
        ]);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([
            0xdd, 0x7e, 0x05, 0xdd, 0x7e, 0xfb, 0xfd, 0x7e, 0xfb, 0xdd, 0x7e,
            0xfb, 0xdd, 0x7e, 0xff, 0xdd, 0x7e, 0xfc,
        ]);
    });
    it('should allow index registers without an offset', function () {
        const prog = compileLines([
            '   ld a,(ix)',
            '   ld ( iy ),b',
            '   inc (ix)',
            '   bit 7,(iy)',
            '   jp (ix)',
        ]);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([
            0xdd, 0x7e, 0x00, 0xfd, 0x70, 0x00, 0xdd, 0x34, 0x00, 0xfd, 0xcb,
            0x00, 0x7e, 0xdd, 0xe9,
        ]);
    });
    it('should report out of range negative index offsets', function () {
        const prog = compileLines([
            '   ld a,(ix-128)',
            '   ld a,(ix-129)',
            '   ld a,(iy-d)',
            'd: equ 129',
        ]);
        expect(errorMessages(prog)).to.eql([
            'Value -129 is out of range for an index offset (-128 to 127)',
            'Value -129 is out of range for an index offset (-128 to 127)',
        ]);
    });
    it('should report registers used where they are not allowed', function () {
        const prog = compileLines([
            '   ld hl,(ix)',
            '   ld bc,(IY+2)',
            '   ld a,nothere',
        ]);
        expect(errorMessages(prog)).to.eql([
            "Register 'ix' can't be used here",
            "Register 'IY' can't be used here",
            "Symbol 'nothere' not found",
        ]);
    });
    it('should still allow labels with register names', function () {
        const prog = compileLines(['   ld hl,(ix)', 'ix: nop']);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([0x2a, 0x03, 0x00, 0x00]);
    });
    it('should report division by zero in db and dw', function () {
        const prog = compileLines([
            '   db 1, 1/0',
            '   dw 0/0',
            '   db x/0',
            'x: equ 5',
            '   db $1234',
        ]);
        expect(errorMessages(prog)).to.eql([
            'Invalid value Infinity in db',
            'Invalid value NaN in dw',
            'Invalid value Infinity in db',
        ]);
        // other values still just use the low byte
        expect(prog.getBytes().slice(-1)).to.eql([0x34]);
    });
    describe('.if using symbols', function () {
        it('should use EQUs defined later', function () {
            const prog = compileLines([
                '.if DEBUG',
                '   nop',
                '.else',
                '   halt',
                '.endif',
                'DEBUG: equ 1',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0x00]);
        });
        it('should use labels defined earlier', function () {
            const prog = compileLines([
                '   org 10',
                'start: nop',
                '.if start = 10',
                '   db 1',
                '.else',
                '   db 2',
                '.endif',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0x00, 1]);
        });
        it('should not use labels defined later', function () {
            const prog = compileLines([
                '.if later',
                '   nop',
                '.endif',
                'later:',
            ]);
            expect(errorMessages(prog)).to.eql(["Symbol 'later' not found"]);
        });
        it('should change the addresses of labels', function () {
            const prog = compileLines([
                '   db x',
                'BIG: equ 1',
                '.if BIG',
                '   ds 5',
                '.endif',
                'x: nop',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([6, 0, 0, 0, 0, 0, 0]);
        });
        it('should allow symbols to be defined in more than one branch', function () {
            const assemble = (big: number) =>
                compileLines([
                    `BIG: equ ${big}`,
                    '.if BIG',
                    'size: equ 100',
                    'x: nop',
                    '.else',
                    'size: equ 10',
                    'x: halt',
                    '.endif',
                    '   db size',
                    '   dw x',
                ]);
            const big = assemble(1);
            expect(big.errors).to.eql([]);
            expect(big.getBytes()).to.eql([0x00, 100, 0, 0]);
            expect(big.symbols).to.eql({ BIG: 1, size: 100, x: 0 });
            const small = assemble(0);
            expect(small.errors).to.eql([]);
            expect(small.getBytes()).to.eql([0x76, 10, 0, 0]);
        });
        it('should not allow a symbol to be defined twice in code which is assembled', function () {
            const prog = compileLines([
                'F: equ 1',
                '.if F',
                'x: nop',
                '.endif',
                '.if F',
                'x: halt',
                '.endif',
            ]);
            expect(errorMessages(prog)).to.eql(["Label 'x' already defined"]);
        });
        it('should not define symbols in code which is not assembled', function () {
            const prog = compileLines([
                'F: equ 0',
                '.if F',
                'x: nop',
                '.endif',
                '   jp x',
            ]);
            expect(errorMessages(prog)).to.eql(["Symbol 'x' not found"]);
            expect(prog.symbols).to.eql({ F: 0 });
        });
        it('should call macros', function () {
            const prog = compileLines([
                'macro m',
                '   nop',
                'endm',
                'YES: equ 1',
                'NO: equ 0',
                '.if YES',
                '   m',
                '.endif',
                '.if NO',
                '   m',
                '   m',
                '.endif',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0x00]);
        });
        it('should not allow includes or macro definitions', function () {
            const prog = compileLines([
                'F: equ 0',
                '.if F',
                '.include "file"',
                '.incbin "file"',
                'macro m',
                'endm',
                '.endif',
            ]);
            expect(errorMessages(prog)).to.eql([
                ".include can't be used inside an .if which uses symbols",
                ".incbin can't be used inside an .if which uses symbols",
                "Macros can't be defined inside an .if which uses symbols",
            ]);
        });
    });
    it('should allow rst addresses in any form', function () {
        const prog = compileLines([
            '   rst 0',
            '   rst 8',
            '   rst 10h',
            '   rst $18',
            '   rst 20H',
            '   rst 28h',
            '   rst vector',
            '   RST 38h',
            'vector: equ 30h',
        ]);
        expect(prog.errors).to.eql([]);
        expect(prog.getBytes()).to.eql([
            0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff,
        ]);
    });
    it('should report invalid rst addresses', function () {
        const prog = compileLines([
            '   rst 9',
            '   rst 40h',
            '   rst vector',
            'vector: equ 3',
        ]);
        expect(errorMessages(prog)).to.eql([
            'Invalid address for rst: 9h (it can be 0, 8, 10h, 18h, 20h, 28h, 30h or 38h)',
            'Invalid address for rst: 40h (it can be 0, 8, 10h, 18h, 20h, 28h, 30h or 38h)',
            'Invalid address for rst: 3h (it can be 0, 8, 10h, 18h, 20h, 28h, 30h or 38h)',
        ]);
    });
    describe('repeats', function () {
        it('should repeat lines with .rept', function () {
            const prog = compileLines([
                '.rept 3',
                '   nop',
                '.endr',
                '   halt',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0, 0, 0, 0x76]);
        });
        it('should use constants, equs defined before, and macro arguments for the count', function () {
            const prog = compileLines([
                'N: equ 2',
                '.rept N * 2 - 3',
                '   nop',
                '.endr',
                'macro m n',
                '.rept n',
                '   halt',
                '.endr',
                'endm',
                '   m 2',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0, 0x76, 0x76]);
        });
        it('should allow a count of 0', function () {
            const prog = compileLines([
                '.rept 0',
                '   nop',
                '.endr',
                '   halt',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0x76]);
        });
        it('should report a count which is not known before assembling', function () {
            const prog = compileLines([
                '.rept N',
                '   nop',
                '.endr',
                '.rept -1',
                '.endr',
                'N: equ 2',
            ]);
            expect(errorMessages(prog)).to.eql([
                'The count for .rept must be a constant, or only use equs defined before it',
                'Invalid count for .rept: -1',
            ]);
        });
        it('should repeat lines for each item with .repti, replacing the name', function () {
            const prog = compileLines([
                '.repti address, (bc), (de), (ix+2)',
                '   ld a,address',
                '.endr',
                '.repti v, 1, 2+3',
                '   db v',
                '.endr',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([
                0x0a, 0x1a, 0xdd, 0x7e, 0x02, 1, 5,
            ]);
        });
        it('should use registers as items with .repti', function () {
            const prog = compileLines([
                '.repti reg, bc, de, hl',
                '   push reg',
                '.endr',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0xc5, 0xd5, 0xe5]);
        });
        it('should repeat lines for each character with .reptc', function () {
            const prog = compileLines([
                '.reptc c, "ab"',
                '   db c, c+1',
                '.endr',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0x61, 0x62, 0x62, 0x63]);
        });
        it('should not replace names in strings, comments or numbers', function () {
            const prog = compileLines([
                '.repti ab, 1',
                '   db "ab", $ab, ab ; ab',
                "   ex af,af'",
                '.endr',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([0x61, 0x62, 0xab, 1, 0x08]);
        });
        it('should make labels local to each repetition', function () {
            const prog = compileLines([
                'start:',
                '.rept 2',
                'loop: djnz loop',
                '   jp start',
                '.endr',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([
                0x10, 0xfe, 0xc3, 0, 0, 0x10, 0xfe, 0xc3, 0, 0,
            ]);
            expect(prog.symbols).to.eql({ start: 0 });
        });
        it('should allow repeats to be nested', function () {
            const prog = compileLines([
                '.repti a, 1, 2',
                '.repti b, 10, 20',
                '   db a + b',
                '.endr',
                '.rept 2',
                '   db a',
                '.endr',
                '.endr',
            ]);
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([11, 21, 1, 1, 12, 22, 2, 2]);
        });
        it('should list each repetition', function () {
            const prog = compileLines([
                '.repti reg, bc, de',
                '   push reg',
                '.endr',
            ]);
            const list = prog.getList(false);
            expect(list.slice(0, 4)).to.eql([
                '    1                         .repti reg, bc, de',
                '    2 0000 c5                    push reg',
                '    2 0001 d5                    push reg',
                '    3                         .endr',
            ]);
        });
        it('should report unbalanced .endr', function () {
            const prog = compileLines([
                '.reptc c, "a"',
                '   nop',
                '   nop',
                '.endr',
                '.endr',
            ]);
            expect(errorMessages(prog)).to.eql(['.endr without .rept']);
            const prog2 = compileLines(['.repti x, 1', '   nop']);
            expect(errorMessages(prog2)).to.eql(['.repti without .endr']);
        });
        it('should not allow includes or macro definitions in repeats', function () {
            const prog = compileLines(['.rept 2', 'macro m', 'endm', '.endr']);
            expect(errorMessages(prog)).to.eql([
                ".include, .incbin, .library and macro definitions can't be used inside .rept",
            ]);
        });
    });
    describe('libraries', function () {
        function compileFiles(
            files: { [filename: string]: string[] },
            searchPaths: string[] = []
        ) {
            const fileResolver = new compiler.StringFileResolvers(files);
            fileResolver.searchPaths = searchPaths;
            return compiler.compile('test', { fileResolver });
        }
        const maths = [
            '; maths routines',
            'SIZE: equ 2',
            '.routine mul8',
            'loop: nop',
            '   djnz loop',
            '   ret',
            '.endroutine',
            '.routine mul16',
            '   call mul8',
            'loop: ret',
            '.endroutine',
            '.routine unused',
            '   halt',
            '.endroutine',
        ];
        it('should only assemble routines which are used, where the library is', function () {
            const prog = compileFiles({
                test: ['   call mul8', '.library "maths"', '   db SIZE'],
                maths,
            });
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([
                0xcd,
                0x03,
                0x00, // call mul8
                0x00,
                0x10,
                0xfd,
                0xc9, // mul8
                2,
            ]);
            // labels in routines are local to them
            expect(prog.symbols).to.eql({ SIZE: 2, mul8: 3 });
        });
        it('should assemble routines used by routines which are used', function () {
            const prog = compileFiles({
                test: ['   call mul16', '.library "maths"'],
                maths,
            });
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([
                0xcd,
                0x07,
                0x00, // call mul16
                0x00,
                0x10,
                0xfd,
                0xc9, // mul8
                0xcd,
                0x03,
                0x00,
                0xc9, // mul16
            ]);
        });
        it('should allow libraries to use libraries, which are only loaded once', function () {
            const prog = compileFiles({
                test: [
                    '   call first',
                    '.library "lib/one"',
                    '.library "lib/two"',
                ],
                'lib/one': [
                    '.library "common"',
                    '.routine first',
                    '   call shared',
                    '.endroutine',
                ],
                'lib/two': ['.library "common"'],
                'lib/common': ['.routine shared', '   ret', '.endroutine'],
            });
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes()).to.eql([
                0xcd,
                0x04,
                0x00, // call first
                0xc9, // shared, where lib/one uses common
                0xcd,
                0x03,
                0x00, // first
            ]);
        });
        it('should find libraries in the search path', function () {
            const prog = compileFiles(
                {
                    test: ['   call mul8', '.library "maths"'],
                    'libs/maths': maths,
                },
                ['libs']
            );
            expect(prog.errors).to.eql([]);
            expect(prog.getBytes().length).to.equal(7);
        });
        it('should list routines which are not used as not assembled', function () {
            const prog = compileFiles({
                test: ['   call mul8', '.library "maths"'],
                maths,
            });
            const list = prog.getList(false);
            expect(list).to.include('   13 xxxx 76                    halt');
            expect(list).to.include('    4 0003 00                 loop: nop');
        });
        it('should only allow routines, equs, macros and libraries in libraries', function () {
            const prog = compileFiles({
                test: ['.library "lib"'],
                lib: [
                    'macro m',
                    '   nop',
                    'endm',
                    'x: equ 1',
                    '   nop',
                    'y: nop',
                ],
            });
            expect(errorMessages(prog)).to.eql([
                'Code in a library must be inside a .routine',
                'Code in a library must be inside a .routine',
                'Code in a library must be inside a .routine',
            ]);
        });
        it('should only allow routines in libraries', function () {
            const prog = compileLines(['.routine x', '   ret', '.endroutine']);
            expect(errorMessages(prog)).to.eql([
                '.routine can only be used in a library',
            ]);
        });
        it('should not allow routines to be nested', function () {
            const prog = compileFiles({
                test: ['.library "lib"'],
                lib: ['.routine a', '.routine b', '.endroutine', '.endroutine'],
            });
            expect(errorMessages(prog)).to.include("Routines can't be nested");
        });
        it('should not allow a routine with the same name as another symbol', function () {
            const prog = compileFiles({
                test: ['mul8: call mul8', '.library "maths"'],
                maths,
            });
            expect(errorMessages(prog)).to.eql([
                "Routine 'mul8' has the same name as another symbol",
            ]);
        });
        it('should report a library which does not exist', function () {
            const prog = compileFiles({ test: ['.library "nothere"'] });
            expect(errorMessages(prog)).to.eql([
                'File does not exist: nothere',
            ]);
        });
    });
    describe('output', function () {
        const lines = [
            'org 100h',
            'start: ld a,1',
            'macro two x',
            '  ld b,x',
            '  db x',
            'endm',
            '  two 5',
            'msg: db "hi"',
            '  ds 3',
            '  .phase 200h',
            'moved: jp moved',
            '  .dephase',
            '.block',
            'local: nop',
            '.endblock',
            'size: equ $ - start',
        ];
        it('should list the lines which produced bytes', function () {
            const prog = compileLines(lines);
            expect(prog.errors).to.eql([]);
            const line = (
                line: number,
                address: number,
                out: number,
                length: number,
                source: string,
                data: boolean
            ) => ({
                file: 'test',
                line,
                address,
                out,
                length,
                source,
                data,
            });
            expect(prog.getLines()).to.eql([
                line(2, 0x100, 0x100, 2, 'start: ld a,1', false),
                // bytes from a macro come from the line which calls it
                line(7, 0x102, 0x102, 3, '  two 5', false),
                line(8, 0x105, 0x105, 2, 'msg: db "hi"', true),
                line(9, 0x107, 0x107, 3, '  ds 3', true),
                line(11, 0x200, 0x10a, 3, 'moved: jp moved', false),
                line(14, 0x10d, 0x10d, 1, 'local: nop', false),
            ]);
        });
        it('should give the bytes as segments', function () {
            const prog = compileLines(lines);
            // ds doesn't output any bytes, so starts a new segment
            expect(prog.getSegments()).to.eql([
                {
                    address: 0x100,
                    bytes: [0x3e, 1, 0x06, 5, 5, 0x68, 0x69],
                },
                { address: 0x10a, bytes: [0xc3, 0x00, 0x02, 0] },
            ]);
        });
        it('should give the values of symbols which are not in blocks', function () {
            const prog = compileLines(lines);
            expect(prog.symbols).to.eql({
                start: 0x100,
                msg: 0x105,
                moved: 0x200,
                size: 14,
            });
        });
    });
});
