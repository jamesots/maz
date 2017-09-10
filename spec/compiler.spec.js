const compiler = require('../lib/compiler');
const sourceMapSupport = require('source-map-support');
sourceMapSupport.install();

describe('compiler', function() {
    let prog;

    beforeEach(function() {
        prog = new compiler.Programme();
    });

    it('should get symbols', function() {
        prog.ast = [
            {label: 'one'},
            {label: 'two'},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).toEqual({
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
        expect(prog.symbols).toEqual({
            one: null,
            '%0_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).toBe('%0_');
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
        expect(prog.symbols).toEqual({
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
        expect(prog.errors.length).toBe(1);
    });
    it('should not allow symbol to repeat in a block', function() {
        prog.ast = [
            {block: true},
            {label: 'one'},
            {label: 'one'},
            {endblock: true, endprefix: true}
        ];
        prog.getSymbols();
        expect(prog.errors.length).toBe(1);
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
        expect(prog.symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).toBe('%0_');
        expect(prog.ast[4].prefix).toBe('%1_');
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
        expect(prog.symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).toBe('%0_');
        expect(prog.ast[3].prefix).toBe('%1_%0_');
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
        expect(prog.symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            '%3_%2_one': null,
            '%2_one': null,
            two: null
        });
        expect(prog.ast[1].prefix).toBe('%0_');
        expect(prog.ast[3].prefix).toBe('%1_%0_');
        expect(prog.ast[7].prefix).toBe('%2_');
        expect(prog.ast[8].prefix).toBe('%3_%2_');
    });
    it('should get symbols of EQUs', function() {
        prog.ast = [
            {label: 'one'},
            {equ: 5},
        ];
        prog.symbols = prog.getSymbols();
        expect(prog.symbols).toEqual({
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
        expect(prog.symbols).toEqual({
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
        expect(prog.ast).toEqual([
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
        expect(prog.symbols.one).toBe(0);
        expect(prog.symbols.two).toBe(3);
        expect(prog.symbols.three).toBe(6);
        expect(prog.symbols.four).toBe(126);
        expect(prog.symbols.five).toBe(203);
        expect(prog.symbols.six).toBe(303);
        expect(prog.symbols.seven).toBe(144);
        expect(prog.symbols.eight).toBe(150);
        expect(prog.ast).toEqual([
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
        expect(prog.symbols.one).toBe(0);
        expect(prog.ast).toEqual([
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
        expect(prog.errors.length).toBe(1);
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
        expect(prog.ast).toEqual([
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
        expect(prog.symbols.one).toBe(0);
        expect(prog.ast).toEqual([
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
        expect(prog.errors.length).toBe(1);
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
        expect(prog.ast).toEqual([
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
        expect(prog.symbols.one).toBe(0);
        expect(prog.ast).toEqual([
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
        expect(prog.errors.length).toBe(1);
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
        expect(prog.ast).toEqual([
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
        expect(prog.symbols.one).toBe(5);
        expect(prog.symbols.two).toBe(5);
        expect(prog.symbols.three).toEqual({expr:'one'});
    });
    it('should evaluate symbols', function() {
        prog.symbols = {
            one: 1,
            two: {expression: 'three', vars: ['three']},
            three: {expression: 'one', vars: ['one']}
        };
        prog.evaluateSymbols();
        expect(prog.symbols).toEqual({
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
        expect(prog.errors.length).toBe(1);
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
        expect(prog.symbols).toEqual({
            '%1_two': 4,
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': 9
        });
    });
    it('should get whole prefix', function() {
        expect(compiler.getWholePrefix('%2_%3_%4_bob')).toBe('%2_%3_%4_');
    });
    it('should get reduced prefix', function() {
        expect(compiler.getReducedPrefix('%2_%3_%4_')).toBe('%3_%4_');
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
        expect(prog.findVariable('%2_%1_%0_', 'a')).toBe('%2_%1_%0_a');
        expect(prog.findVariable('%2_%1_%0_', 'b')).toBe('%2_%1_%0_b');
        expect(prog.findVariable('%2_%1_%0_', 'c')).toBe('%1_%0_c');
        expect(prog.findVariable('%2_%1_%0_', 'd')).toBe('%0_d');
        expect(prog.findVariable('%2_%1_%0_', 'e')).toBe('e');

        expect(prog.findVariable('%1_%0_', 'b')).toBe('%1_%0_b');
        expect(prog.findVariable('%1_%0_', 'c')).toBe('%1_%0_c');
        expect(prog.findVariable('%1_%0_', 'd')).toBe('%0_d');
        expect(prog.findVariable('%1_%0_', 'e')).toBe('e');

        expect(prog.findVariable('%0_', 'c')).toBe('%0_c');
        expect(prog.findVariable('%0_', 'd')).toBe('%0_d');
        expect(prog.findVariable('%0_', 'e')).toBe('e');

        expect(prog.findVariable('', 'd')).toBe('d');
        expect(prog.findVariable('', 'e')).toBe('e');
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
        expect(prog.ast).toEqual([
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
        expect(prog.ast).toEqual([
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
        expect(macros).toEqual({
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
        expect(prog.errors.length).toBe(1);
    });
    it('should find macros with content', function() {
        prog.ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true }
        ];
        const macros = prog.getMacros();
        expect(macros).toEqual({
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
        expect(macros).toEqual({
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
        expect(prog.errors.length).toBe(2);
    });
    it('should not like macros which don\'t end', function() {
        prog.ast = [
            { macrodef: 'thing2' },
        ];
        prog.getMacros();
        expect(prog.errors.length).toBe(1);
    });
    it('should not like macros which don\'t start', function() {
        prog.ast = [
            { endmacro: true },
        ];
        prog.getMacros();
        expect(prog.errors.length).toBe(1);
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
        expect(prog.ast).toEqual([
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
        expect(prog.ast).toEqual([
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
        expect(prog.ast).toEqual([
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
        expect(prog.ast).toEqual([
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
        expect(prog.symbols).toEqual({
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
        expect(bytes).toEqual([1,2,7,8,9,0,0,0,0,0,4,5,6]);
    });
    it('should get bytes with org, non-zero start', function() {
        prog.ast = [
            { bytes: [1,2,3], out: 5 },
            { bytes: [4,5,6], out: 15 },
            { bytes: [7,8,9], out: 7 },
        ];
        const bytes = prog.getBytes();
        expect(bytes).toEqual([1,2,7,8,9,0,0,0,0,0,4,5,6]);
    });
    it('should not allow ORG less than first ORG', function() {
        prog.ast = [
            { bytes: [1,2,3], out: 5 },
            { bytes: [4,5,6], out: 0 },
            { bytes: [7,8,9], out: 7 },
        ];
        const bytes = prog.getBytes();
        expect(prog.errors.length).toBe(1);
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
        expect(prog.ast).toEqual([
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
        expect(bytes).toEqual([62, 3]);
    });
    it('should handle defw properly', function() {
        const prog = compiler.compile('test', {
            fileResolver: new compiler.StringFileResolver('test',
                [
                    'start: defw $+2',
                    'defw $1234',
                ])
        });
        const bytes = prog.getBytes();
        expect(bytes).toEqual([0x02, 0x00, 0x34, 0x12]);
    });
});