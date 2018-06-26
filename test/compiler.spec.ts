import * as compiler from '../lib/compiler';
import * as sourceMapSupport from 'source-map-support';
import * as mocha from 'mocha';
import * as chai from 'chai';
const expect = chai.expect;

sourceMapSupport.install();

describe('compiler', function() {
    let prog;

    beforeEach(function() {
        prog = new compiler.Programme({});
    });

    it('should get symbols', function() {
        prog.ast = [
            {label: 'one'},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: null,
            two: null
        });
    });
    it('should get symbols in a block', function() {
        prog.ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
            {endblock: true, endprefix: true},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: null,
            '%0_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
    });
    it('should get public symbols in a block', function() {
        prog.ast = [
            {label: 'one'},
            {block: true},
                {label: 'three', public: true},
            {endblock: true, endprefix: true},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: null,
            three: null,
            two: null
        });
    });
    it('should not allow symbol to repeat at top level', function() {
        prog.ast = [
            {label: 'one'},
            {label: 'one'},
        ];
        prog.getSymbols();
        expect(prog.errors.length).to.equal(1);
    });
    it('should not allow symbol to repeat in a block', function() {
        prog.ast = [
            {block: true},
            {label: 'one'},
            {label: 'one'},
            {endblock: true, endprefix: true}
        ];
        prog.getSymbols();
        expect(prog.errors.length).to.equal(1);
    });
    it('should get symbols in two blocks', function() {
        prog.ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
            {endblock: true, endprefix: true},
            {block: true},
                {label: 'one'},
            {endblock: true, endprefix: true},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: null,
            '%0_one': null,
            '%1_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
        expect(prog.ast[4].prefix).to.equal('%1_');
    });
    it('should get symbols in nested blocks', function() {
        prog.ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
                {block: true},
                    {label: 'one'},
                {endblock: true, endprefix: true},
            {endblock: true, endprefix: true},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
        expect(prog.ast[3].prefix).to.equal('%1_%0_');
    });
    it('should get symbols in multiple nested blocks', function() {
        prog.ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
                {block: true},
                    {label: 'one'},
                {endblock: true, endprefix: true},
            {endblock: true, endprefix: true},
            {block: true},
                {block: true},
                    {label: 'one'},
                {endblock: true, endprefix: true},
                {label: 'one'},
            {endblock: true, endprefix: true},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            '%3_%2_one': null,
            '%2_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).to.equal('%0_');
        expect(prog.ast[3].prefix).to.equal('%1_%0_');
        expect(prog.ast[7].prefix).to.equal('%2_');
        expect(prog.ast[8].prefix).to.equal('%3_%2_');
    });
    it('should get symbols of EQUs', function() {
        prog.ast = [
            {label: 'one'},
            {equ: 5},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            one: 5,
        });
    });
    it('should not reset already assigned symbols', function() {
        prog.ast = [
            {label: 'one'},
            {equ: 5},
        ];
        prog.symbols = {
            one: 5
        }
        prog.assignPCandEQU();
        expect(prog.symbols).to.eql({
            one: 5,
        });
    });
    it('should add address to EQSs with expressions', function() {
        prog.ast = [
            {label: 'one'},
            {equ: {
                expression: '$',
                vars: ['$']
            }},
        ];
        prog.symbols = {
            one: null
        }
        prog.assignPCandEQU();
        expect(prog.ast).to.eql([
            {label: 'one'},
            {equ: {
                expression: '$',
                vars: ['$'],
                address: 0
            }},
        ]);
    });
    it('should assign PC', function() {
        prog.ast = [
            {label: 'one'},
            {bytes: [0,0,0]},
            {label: 'two'},
            {bytes: [0,0,0]},
            {label: 'three'},
            {bytes: [0,0,0]},
            {org: 123},
            {bytes: [0,0,0]},
            {label: 'four'},
            {bytes: [0,0,0]},
            {phase: 200},
            {bytes: [0,0,0]},
            {label: 'five'},
            {bytes: [0,0,0]},
            {phase: 300},
            {bytes: [0,0,0]},
            {label: 'six'},
            {bytes: [0,0,0]},
            {endphase: true},
            {bytes: [0,0,0]},
            {label: 'seven'},
            {bytes: [0,0,0]},
            {endphase: true},
            {bytes: [0,0,0]},
            {label: 'eight'}
        ];
        prog.symbols = {
            one: null,
            two: null,
            three: null,
            four: null,
            five: null,
            six: null,
            seven: null,
            eight: null
        }
        prog.assignPCandEQU();
        expect(prog.symbols.one).to.equal(0);
        expect(prog.symbols.two).to.equal(3);
        expect(prog.symbols.three).to.equal(6);
        expect(prog.symbols.four).to.equal(126);
        expect(prog.symbols.five).to.equal(203);
        expect(prog.symbols.six).to.equal(303);
        expect(prog.symbols.seven).to.equal(144);
        expect(prog.symbols.eight).to.equal(150);
        expect(prog.ast).to.eql([
            {label: 'one'},
            {bytes: [0,0,0], address: 0, out: 0},
            {label: 'two'},
            {bytes: [0,0,0], address: 3, out: 3},
            {label: 'three'},
            {bytes: [0,0,0], address: 6, out: 6},
            {org: 123},
            {bytes: [0,0,0], address: 123, out: 123},
            {label: 'four'},
            {bytes: [0,0,0], address: 126, out: 126},
            {phase: 200},
            {bytes: [0,0,0], address: 200, out: 129},
            {label: 'five'},
            {bytes: [0,0,0], address: 203, out: 132},
            {phase: 300},
            {bytes: [0,0,0], address: 300, out: 135},
            {label: 'six'},
            {bytes: [0,0,0], address: 303, out: 138},
            {endphase: true},
            {bytes: [0,0,0], address: 141, out: 141},
            {label: 'seven'},
            {bytes: [0,0,0], address: 144, out: 144},
            {endphase: true},
            {bytes: [0,0,0], address: 147, out: 147},
            {label: 'eight'}
        ]);
    });
    it('should evaluate ORG expressions where possible', function() {
        prog.ast = [
            {label: 'one'},
            {org: { 
                expression: 'one',
                vars: ['one']
            }}
        ];
        prog.symbols = {
            one: null,
        }
        prog.assignPCandEQU();
        expect(prog.symbols.one).to.equal(0);
        expect(prog.ast).to.eql([
            {label: 'one'},
            {org: 0},
        ]);
    });
    it('should not evaluate ORG expressions where not possible', function() {
        prog.ast = [
            {label: 'one'},
            {org: { 
                expression: 'two',
                vars: ['two']
            }},
            {label: 'two'},
        ];
        prog.symbols = {
            one: null,
            two: null,
        }
        prog.assignPCandEQU();
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate ORG expressions where possible', function() {
        prog.ast = [
            {org: { 
                expression: 'one',
                vars: ['one']
            }},
            {label: 'one'},
            {equ: 5}
        ];
        prog.symbols = {
            one: 5,
        }
        prog.assignPCandEQU();
        expect(prog.ast).to.eql([
            {org: 5},
            {label: 'one'},
            {equ: 5}
        ]);
    });
    it('should evaluate PHASE expressions where possible', function() {
        prog.ast = [
            {label: 'one'},
            {phase: { 
                expression: 'one',
                vars: ['one']
            }}
        ];
        prog.symbols = {
            one: null,
        }
        prog.assignPCandEQU();
        expect(prog.symbols.one).to.equal(0);
        expect(prog.ast).to.eql([
            {label: 'one'},
            {phase: 0},
        ]);
    });
    it('should not evaluate PHASE expressions where not possible', function() {
        prog.ast = [
            {label: 'one'},
            {phase: { 
                expression: 'two',
                vars: ['two']
            }},
            {label: 'two'},
        ];
        prog.symbols = {
            one: null,
            two: null,
        }
        prog.assignPCandEQU();
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate PHASE expressions where possible', function() {
        prog.ast = [
            {phase: { 
                expression: 'one',
                vars: ['one']
            }},
            {label: 'one'},
            {equ: 5}
        ];
        prog.symbols = {
            one: 5,
        }
        prog.assignPCandEQU();
        expect(prog.ast).to.eql([
            {phase: 5},
            {label: 'one'},
            {equ: 5}
        ]);
    });
    it('should evaluate ALIGN expressions where possible', function() {
        prog.ast = [
            {label: 'one'},
            {align: { 
                expression: 'one',
                vars: ['one']
            }}
        ];
        prog.symbols = {
            one: null,
        }
        prog.assignPCandEQU();
        expect(prog.symbols.one).to.equal(0);
        expect(prog.ast).to.eql([
            {label: 'one'},
            {align: 0},
        ]);
    });
    it('should not evaluate ALIGN expressions where not possible', function() {
        prog.ast = [
            {label: 'one'},
            {align: { 
                expression: 'two',
                vars: ['two']
            }},
            {label: 'two'},
        ];
        prog.symbols = {
            one: null,
            two: null,
        }
        prog.assignPCandEQU();
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate ALIGN expressions where possible', function() {
        prog.ast = [
            {align: { 
                expression: 'one',
                vars: ['one']
            }},
            {label: 'one'},
            {equ: 5}
        ];
        prog.symbols = {
            one: 5,
        }
        prog.assignPCandEQU();
        expect(prog.ast).to.eql([
            {align: 5},
            {label: 'one'},
            {equ: 5}
        ]);
    });
    it('should get EQU', function() {
        prog.ast = [
            {label: 'one'},
            {label: 'two'},
            {equ: 5},
            {label: 'three'},
            {equ: {
                expr: 'one'
            }}
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols.one).to.equal(5);
        expect(prog.symbols.two).to.equal(5);
        expect(prog.symbols.three).to.eql({expr:'one'});
    });
    it('should evaluate symbols', function() {
        prog.symbols = {
            one: 1,
            two: {expression: 'three', vars: ['three']},
            three: {expression: 'one', vars: ['one']}
        };
        prog.evaluateSymbols();
        expect(prog.symbols).to.eql({
            one: 1,
            two: 1,
            three: 1
        })
    });
    it('should evaluate symbols and detect circular references', function() {
        prog.symbols = {
            one: 1,
            two: {expression: 'three', vars: ['three']},
            three: {expression: 'two', vars: ['two']}
        };
        prog.evaluateSymbols();
        expect(prog.errors.length).to.equal(1);
    });
    it('should evaluate symbols with scope', function() {
        prog.symbols = {
            '%1_two': {expression: 'three', vars: ['three']},
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': {expression: 'three + two', vars: ['three', 'two']}
        };
        prog.evaluateSymbols();
        expect(prog.symbols).to.eql({
            '%1_two': 4,
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': 9
        });
    });
    it('should get whole prefix', function() {
        expect(compiler.getWholePrefix('%2_%3_%4_bob')).to.equal('%2_%3_%4_');
    });
    it('should get reduced prefix', function() {
        expect(compiler.getReducedPrefix('%2_%3_%4_')).to.equal('%3_%4_');
    });
    it('should find variable', function() {
        prog.symbols = {
            '%2_%1_%0_a': 0,
            '%2_%1_%0_b': 1,
            '%1_%0_c': 2,
            '%0_d': 4,
            'e': 8,
            'd': 16,
            'c': 32,
            '%0_c': 64,
            'b': 128,
            '%0_b': 256,
            '%1_%0_b': 512
        }
        expect(prog.findVariable('%2_%1_%0_', 'a')).to.equal('%2_%1_%0_a');
        expect(prog.findVariable('%2_%1_%0_', 'b')).to.equal('%2_%1_%0_b');
        expect(prog.findVariable('%2_%1_%0_', 'c')).to.equal('%1_%0_c');
        expect(prog.findVariable('%2_%1_%0_', 'd')).to.equal('%0_d');
        expect(prog.findVariable('%2_%1_%0_', 'e')).to.equal('e');

        expect(prog.findVariable('%1_%0_', 'b')).to.equal('%1_%0_b');
        expect(prog.findVariable('%1_%0_', 'c')).to.equal('%1_%0_c');
        expect(prog.findVariable('%1_%0_', 'd')).to.equal('%0_d');
        expect(prog.findVariable('%1_%0_', 'e')).to.equal('e');

        expect(prog.findVariable('%0_', 'c')).to.equal('%0_c');
        expect(prog.findVariable('%0_', 'd')).to.equal('%0_d');
        expect(prog.findVariable('%0_', 'e')).to.equal('e');

        expect(prog.findVariable('', 'd')).to.equal('d');
        expect(prog.findVariable('', 'e')).to.equal('e');
    });
    it('should update bytes', function() {
        prog.ast = [
            { references: true, bytes: [0, {expression: 'three', vars: ['three']}]},
            { references: true, bytes: [0, {expression: 'three', vars: ['three']}, null]},
            { references: true, bytes: [0, {expression: '$', vars: ['$']}], address: 5},
            { references: true, defb: true, bytes: [0, {expression: 'three', vars: ['three']}, null, 0]},
            { references: true, defw: true, bytes: [0, {expression: 'three', vars: ['three']}, 0]},
            { references: true, defb: true, bytes: [0, {expression: '"abc"', vars: []}, 0]},
            { references: true, defw: true, bytes: [0, {expression: '"abc"', vars: []}, 0]},
            { references: true, bytes: [0, {expression: '"abc"', vars: []}, 0]},
            { references: true, bytes: [0, {expression: '"abc"', vars: []}, null, 0]},
        ];
        prog.symbols = {
            three: 0x1234
        }
        prog.updateBytes();
        expect(prog.ast).to.eql([
            { references: true, bytes: [0, 0x34]},
            { references: true, bytes: [0, 0x34, 0x12]},
            { references: true, bytes: [0, 5], address: 5},
            { references: true, defb: true, bytes: [0, 0x34, null, 0]},
            { references: true, defw: true, bytes: [0, 0x34, 0x12, 0]},
            { references: true, defb: true, bytes: [0, 97, 98, 99, 0]},
            { references: true, defw: true, bytes: [0, 97, 98, 99, 0, 0]},
            { references: true, bytes: [0, 97, 0]},
            { references: true, bytes: [0, 97, 98, 0]},
        ])
    });
    it('should update bytes with scope', function() {
        prog.ast = [
            { label: 'one' },
            { equ: 1 },
            { block: true, prefix: '%0_'},
            { label: '%0_one' },
            { equ: 2 },
            { bytes: [ {expression: 'one', vars: ['one']}], references: ['one']},
            { endblock: true, endprefix: true},
            { bytes: [ {expression: 'one', vars: ['one']}], references: ['one']}
        ];
        prog.symbols = {
            one: 1,
            '%0_one': 2
        }
        prog.updateBytes();
        expect(prog.ast).to.eql([
            { label: 'one' },
            { equ: 1 },
            { block: true, prefix: '%0_'},
            { label: '%0_one' },
            { equ: 2 },
            { bytes: [ 2 ], references: ['one']},
            { endblock: true, endprefix: true},
            { bytes: [ 1 ], references: ['one']}
        ])
    });
    it('should find macros', function() {
        prog.ast = [
            { macrodef: 'thing' },
            { endmacro: true }
        ];
        const macros = prog.getMacros();
        expect(macros).to.eql({
            thing: {
                params: [],
                ast: []
            }
        })
    });
    it('should not allow macro name to repeat', function() {
        prog.ast = [
            { macrodef: 'thing' },
            { endmacro: true },
            { macrodef: 'thing' },
            { endmacro: true }
        ];
        const macros = prog.getMacros();
        expect(prog.errors.length).to.equal(1);
    });
    it('should find macros with content', function() {
        prog.ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true }
        ];
        const macros = prog.getMacros();
        expect(macros).to.eql({
            thing: {
                params: [],
                ast: [
                    { bytes: [1, 2, 3] },
                ]
            }
        })
    });
    it('should find macros with args', function() {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3] },
            { endmacro: true }
        ];
        const macros = prog.getMacros();
        expect(macros).to.eql({
            thing: {
                params: ['a', 'b'],
                ast: [{ bytes: [1, 2, 3] }],
            }
        })
    });
    it('should not like nested macros', function() {
        prog.ast = [
            { macrodef: 'thing1' },
            { macrodef: 'thing2' },
            { endmacro: true },
            { endmacro: true }
        ];
        prog.getMacros();
        expect(prog.errors.length).to.equal(2);
    });
    it('should not like macros which don\'t end', function() {
        prog.ast = [
            { macrodef: 'thing2' },
        ];
        prog.getMacros();
        expect(prog.errors.length).to.equal(1);
    });
    it('should not like macros which don\'t start', function() {
        prog.ast = [
            { endmacro: true },
        ];
        prog.getMacros();
        expect(prog.errors.length).to.equal(1);
    });
    it('should expand macros', function() {
        prog.ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing' },
            { bytes: [4] }
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
            { bytes: [4] }
        ]);
    });
    it('should expand macros with params', function() {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', args: [1,'hello'] },
            { bytes: [4] }
        ];
        const macros = prog.getMacros();
        prog.expandMacros();
        expect(prog.ast).to.eql([
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true},
            { bytes: [0] },
            { macrocall: 'thing', params: ['a', 'b'], args: [1,'hello'], expanded: true },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacrocall: true },
            { bytes: [4] }
        ]);
    });
    it('should make copy of macro when expanding', function() {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', args: [1,'hello'] },
            { macrocall: 'thing', args: [2,'bob'] },
            { bytes: [4] }
        ];
        const macros = prog.getMacros();
        prog.expandMacros();
        expect(prog.ast).to.eql([
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true},
            { bytes: [0] },
            { macrocall: 'thing', params: ['a', 'b'], args: [1,'hello'], expanded: true },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacrocall: true },
            { macrocall: 'thing', params: ['a', 'b'], args: [2,'bob'], expanded: true },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacrocall: true },
            { bytes: [4] }
        ]);
        prog.ast[8].bytes = [3];
        expect(prog.ast).to.eql([
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true},
            { bytes: [0] },
            { macrocall: 'thing', params: ['a', 'b'], args: [1,'hello'], expanded: true },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacrocall: true },
            { macrocall: 'thing', params: ['a', 'b'], args: [2,'bob'], expanded: true },
            { bytes: [3] },
            { endmacrocall: true },
            { bytes: [4] }
        ]);
    });
    it('should get symbols from expanded macros', function() {
        prog.ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true},
            { bytes: [0] },
            { macrocall: 'thing', params: ['a', 'b'], args: [1,'hello'], expanded: true },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacrocall: true },
            { bytes: [4] }
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).to.eql({
            '%0_a': 1,
            '%0_b': 'hello'
        });
    });
    it('should get bytes with org', function() {
        prog.ast = [
            { bytes: [1,2,3], out: 0 },
            { bytes: [4,5,6], out: 10 },
            { bytes: [7,8,9], out: 2 },
        ];
        const bytes = prog.getBytes();
        expect(bytes).to.eql([1,2,7,8,9,0,0,0,0,0,4,5,6]);
    });
    it('should get bytes with org, non-zero start', function() {
        prog.ast = [
            { bytes: [1,2,3], out: 5 },
            { bytes: [4,5,6], out: 15 },
            { bytes: [7,8,9], out: 7 },
        ];
        const bytes = prog.getBytes();
        expect(bytes).to.eql([1,2,7,8,9,0,0,0,0,0,4,5,6]);
    });
    it('should not allow ORG less than first ORG', function() {
        prog.ast = [
            { bytes: [1,2,3], out: 5 },
            { bytes: [4,5,6], out: 0 },
            { bytes: [7,8,9], out: 7 },
        ];
        const bytes = prog.getBytes();
        expect(prog.errors.length).to.equal(1);
    });
    it('should calculate relative jumps', function() {
        prog.ast = [
            { 
                references: true,
                bytes: [1, {
                    relative: {
                        expression: '0',
                        vars: []
                    }
                }],
                address: 0 
            }
        ];
        const bytes = prog.updateBytes();
        expect(prog.ast).to.eql([
            { references: true, address: 0, bytes: [1, 0xfe]}
        ]);
    });
    it('should handle macros in blocks', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '.block',
                    '.macro bob',
                    '.endm',
                    'ld a,3',
                    '.endblock'
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([62, 3]);
    });
    it('should handle defw properly - should evaluate expression', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    'start: defw $+2',
                    'defw $1234',
                    'defw $2345,$3456'
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([0x02, 0x00, 0x34, 0x12, 0x45, 0x23, 0x56, 0x34]);
    });
    it('should handle defb properly - strings should be the right length', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    'defb "hello"',
                    'defb "hello"'
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    });
    it('should handle defb properly - multiple expressions on the same line should work', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    'defb cat("hello", $+1), $+10, $+11, $+12',
                    'defb 5'
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([0x68, 0x65, 0x6c, 0x6c, 0x6f, 49, 10, 11, 12, 5]);
    });
    it('should handle defb properly - simple forward references should not be errors', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '   defb more',
                    'more:',
                    '   defb 5',
                    '   defb more',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([1, 5, 1]);
    });
    it('should handle defw properly - mutliple expressions should work', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    'a1: equ $0102',
                    'a2: equ $0304',
                    'a3: equ $0506',
                    'a4: equ $0708',
                    'defw a1,a2,a3,a4',
                    'defw a1,a2,a3,a4',
                    'defw a1,a2,a3,a4',
                    'defw cat("a", "b", "c"), a1',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([0x02,0x01,0x04,0x03,0x06,0x05,0x08,0x07,
            0x02,0x01,0x04,0x03,0x06,0x05,0x08,0x07,
            0x02,0x01,0x04,0x03,0x06,0x05,0x08,0x07,
            0x61,0x62,0x63,0x00,0x02,0x01]);
    });
    it('should handle defw properly - forward references should not be errors', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '   defw more, more, 8',
                    'more:',
                    '   defb 5',
                    '   defw more, 6',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([6, 0, 6, 0, 8, 0, 5, 6, 0, 6, 0]);
    });
    it('defw should pad strings', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '   defw "123"',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([49, 50, 51, 0]);
    });
    it('defw cat should pad strings after catting', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '   defw cat("1", "23")',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([49, 50, 51, 0]);
    });
    it('defw cat should interpret values as strings', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    'start: ',
                    '   defw cat(start, "23")',
                    'thing: equ 123',
                    '   defw cat(thing, "0")'
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([48, 50, 51, 0, 49, 50, 51, 48]);
    });
    it.only('should handle defw properly - larger forward references should not be errors', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '   defw cat(more, "44"), 8',
                    'more:', // it is incorrectly working this out to be 4, and then
                    // overwriting the bytes from the previous line
                    '   defb 5',
                    '   defw more, 6',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).to.eql([54, 52, 52, 0, 8, 0, 5, 6, 0, 6, 0]);
    });
    it('should handle defb properly - some forward references should be errors', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    '   defw rpt("hi", more)',
                    'more:',
                    '   defb 5',
                ])
        });
        expect(prog.errors.length).to.be.above(0);
    });
    it('should handle includes properly', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolvers({
                'test': 
                [
                    '.include "src/one"',
                    '.include "src/two"',
                ],
                'src/one' :
                [
                    ';.include "src/two"'
                ],
                'src/two' :
                [
                    ';blah'
                ]
            })
        });
    });
});