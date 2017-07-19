const compiler = require('../build/compiler');
const sourceMapSupport = require('source-map-support');
sourceMapSupport.install();

describe('compiler', function() {
    it('should get symbols', function() {
        const ast = [
            {label: 'one'},
            {label: 'two'},
        ];
        const symbols = compiler.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            two: null
        });
    });
    it('should get symbols in a block', function() {
        const ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
            {endblock: true},
            {label: 'two'},
        ];
        const symbols = compiler.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
    });
    it('should get symbols in two blocks', function() {
        const ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
            {endblock: true},
            {block: true},
                {label: 'one'},
            {endblock: true},
            {label: 'two'},
        ];
        const symbols = compiler.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
        expect(ast[4].prefix).toBe('%1_');
    });
    it('should get symbols in nested blocks', function() {
        const ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
                {block: true},
                    {label: 'one'},
                {endblock: true},
            {endblock: true},
            {label: 'two'},
        ];
        const symbols = compiler.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
        expect(ast[3].prefix).toBe('%1_%0_');
    });
    it('should get symbols in multiple nested blocks', function() {
        const ast = [
            {label: 'one'},
            {block: true},
                {label: 'one'},
                {block: true},
                    {label: 'one'},
                {endblock: true},
            {endblock: true},
            {block: true},
                {block: true},
                    {label: 'one'},
                {endblock: true},
                {label: 'one'},
            {endblock: true},
            {label: 'two'},
        ];
        const symbols = compiler.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            '%3_%2_one': null,
            '%2_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
        expect(ast[3].prefix).toBe('%1_%0_');
        expect(ast[7].prefix).toBe('%2_');
        expect(ast[8].prefix).toBe('%3_%2_');
    });
    it('should assign PC', function() {
        const ast = [
            {label: 'one'},
            {bytes: [0,0,0]},
            {label: 'two'},
            {label: 'three'}
        ];
        const symbols = {
            one: null,
            two: null,
            three: null
        }
        compiler.assignPCandEQU(ast, symbols);
        expect(symbols.one).toBe(0);
        expect(symbols.two).toBe(3);
        expect(symbols.three).toBe(3);
    });
    it('should assign EQU', function() {
        const ast = [
            {label: 'one'},
            {label: 'two'},
            {equ: 5},
            {label: 'three'},
            {equ: {
                expr: 'one'
            }}
        ];
        const symbols = {
            one: null,
            two: null,
            three: null
        }
        compiler.assignPCandEQU(ast, symbols);
        expect(symbols.one).toBe(5);
        expect(symbols.two).toBe(5);
        expect(symbols.three).toEqual({expr:'one'});
    });
    it('should evaluate symbols', function() {
        const symbols = {
            one: 1,
            two: {expression: 'three', vars: ['three']},
            three: {expression: 'one', vars: ['one']}
        };
        compiler.evaluateSymbols(symbols);
        expect(symbols).toEqual({
            one: 1,
            two: 1,
            three: 1
        })
    });
    it('should evaluate symbols and detect circular references', function() {
        const symbols = {
            one: 1,
            two: {expression: 'three', vars: ['three']},
            three: {expression: 'two', vars: ['two']}
        };
        expect(function() {
             compiler.evaluateSymbols(symbols);
        }).toThrow();
    });
    it('should evaluate symbols with scope', function() {
        const symbols = {
            '%1_two': {expression: 'three', vars: ['three']},
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': {expression: 'three + two', vars: ['three', 'two']}
        };
        compiler.evaluateSymbols(symbols);
        expect(symbols).toEqual({
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
        const symbols = {
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
        expect(compiler.findVariable(symbols, '%2_%1_%0_', 'a')).toBe('%2_%1_%0_a');
        expect(compiler.findVariable(symbols, '%2_%1_%0_', 'b')).toBe('%2_%1_%0_b');
        expect(compiler.findVariable(symbols, '%2_%1_%0_', 'c')).toBe('%1_%0_c');
        expect(compiler.findVariable(symbols, '%2_%1_%0_', 'd')).toBe('%0_d');
        expect(compiler.findVariable(symbols, '%2_%1_%0_', 'e')).toBe('e');

        expect(compiler.findVariable(symbols, '%1_%0_', 'b')).toBe('%1_%0_b');
        expect(compiler.findVariable(symbols, '%1_%0_', 'c')).toBe('%1_%0_c');
        expect(compiler.findVariable(symbols, '%1_%0_', 'd')).toBe('%0_d');
        expect(compiler.findVariable(symbols, '%1_%0_', 'e')).toBe('e');

        expect(compiler.findVariable(symbols, '%0_', 'c')).toBe('%0_c');
        expect(compiler.findVariable(symbols, '%0_', 'd')).toBe('%0_d');
        expect(compiler.findVariable(symbols, '%0_', 'e')).toBe('e');

        expect(compiler.findVariable(symbols, '', 'd')).toBe('d');
        expect(compiler.findVariable(symbols, '', 'e')).toBe('e');
    });
    it('should update bytes', function() {
        const ast = [
            { references: ['three'], bytes: [0, {expression: 'three', vars: ['three']}]},
            { references: ['three'], bytes: [0, {expression: 'three', vars: ['three']}, null]}
        ];
        const symbols = {
            three: 0x1234
        }
        compiler.updateBytes(ast, symbols);
        expect(ast).toEqual([
            { references: ['three'], bytes: [0, 0x34]},
            { references: ['three'], bytes: [0, 0x34, 0x12]}
        ])
    });
    it('should update bytes with scope', function() {
        const ast = [
            { label: 'one' },
            { equ: 1 },
            { block: true, prefix: '%0_'},
            { label: '%0_one' },
            { equ: 2 },
            { bytes: [ {expression: 'one', vars: ['one']}], references: ['one']},
            { endblock: true},
            { bytes: [ {expression: 'one', vars: ['one']}], references: ['one']}
        ];
        const symbols = {
            one: 1,
            '%0_one': 2
        }
        compiler.updateBytes(ast, symbols);
        expect(ast).toEqual([
            { label: 'one' },
            { equ: 1 },
            { block: true, prefix: '%0_'},
            { label: '%0_one' },
            { equ: 2 },
            { bytes: [ 2 ], references: ['one']},
            { endblock: true},
            { bytes: [ 1 ], references: ['one']}
        ])
    });
    it('should find macros', function() {
        const ast = [
            { macrodef: 'thing' },
            { endmacro: true }
        ];
        const macros = compiler.getMacros(ast);
        expect(macros).toEqual({
            thing: {
                params: [],
                ast: []
            }
        })
    });
    it('should find macros with content', function() {
        const ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true }
        ];
        const macros = compiler.getMacros(ast);
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
        const ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3] },
            { endmacro: true }
        ];
        const macros = compiler.getMacros(ast);
        expect(macros).toEqual({
            thing: {
                params: ['a', 'b'],
                ast: [{ bytes: [1, 2, 3] }],
            }
        })
    });
    it('should not like nested macros', function() {
        const ast = [
            { macrodef: 'thing1' },
            { macrodef: 'thing2' },
            { endmacro: true },
            { endmacro: true }
        ];
        expect(function() {
            compiler.getMacros(ast);
        }).toThrow();
    });
    it('should not like macros which don\'t end', function() {
        const ast = [
            { macrodef: 'thing2' },
        ];
        expect(function() {
            compiler.getMacros(ast);
        }).toThrow();
    });
    it('should not like macros which don\'t start', function() {
        const ast = [
            { endmacro: true },
        ];
        expect(function() {
            compiler.getMacros(ast);
        }).toThrow();
    });
    it('should expand macros', function() {
        const ast = [
            { macrodef: 'thing' },
            { bytes: [1, 2, 3] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing' },
            { bytes: [4] }
        ];
        const macros = compiler.getMacros(ast);
        compiler.expandMacros(ast, macros);
        expect(ast).toEqual([
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
        const ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', args: [1,'hello'] },
            { bytes: [4] }
        ];
        const macros = compiler.getMacros(ast);
        compiler.expandMacros(ast, macros);
        expect(ast).toEqual([
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
        const ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true },
            { bytes: [0] },
            { macrocall: 'thing', args: [1,'hello'] },
            { macrocall: 'thing', args: [2,'bob'] },
            { bytes: [4] }
        ];
        const macros = compiler.getMacros(ast);
        compiler.expandMacros(ast, macros);
        expect(ast).toEqual([
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
        ast[8].bytes = [3];
        expect(ast).toEqual([
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
        const ast = [
            { macrodef: 'thing', params: ['a', 'b'] },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacro: true},
            { bytes: [0] },
            { macrocall: 'thing', params: ['a', 'b'], args: [1,'hello'], expanded: true },
            { bytes: [1, 2, 3, {expression: 'a + b', vars: ['a', 'b']}] },
            { endmacrocall: true },
            { bytes: [4] }
        ];
        const symbols = compiler.getSymbols(ast);
        expect(symbols).toEqual({
            '%0_a': 1,
            '%0_b': 'hello'
        });
    })
});