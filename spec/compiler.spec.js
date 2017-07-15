const maz = require('../build/compiler');

describe('maz', function() {
    it('should get symbols', function() {
        const ast = [
            {label: 'one'},
            {label: 'two'},
        ];
        const symbols = maz.getSymbols(ast);
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
        const symbols = maz.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
        expect(ast[3].prefix).toBe('%0_');
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
        const symbols = maz.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
        expect(ast[3].prefix).toBe('%0_');
        expect(ast[4].prefix).toBe('%1_');
        expect(ast[6].prefix).toBe('%1_');
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
        const symbols = maz.getSymbols(ast);
        expect(symbols).toEqual({
            one: null,
            '%0_one': null,
            '%1_%0_one': null,
            two: null
        });
        expect(ast[1].prefix).toBe('%0_');
        expect(ast[3].prefix).toBe('%1_%0_');
        expect(ast[5].prefix).toBe('%1_%0_');
        expect(ast[6].prefix).toBe('%0_');
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
        const symbols = maz.getSymbols(ast);
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
        expect(ast[5].prefix).toBe('%1_%0_');
        expect(ast[6].prefix).toBe('%0_');
        expect(ast[7].prefix).toBe('%2_');
        expect(ast[8].prefix).toBe('%3_%2_');
        expect(ast[10].prefix).toBe('%3_%2_');
        expect(ast[12].prefix).toBe('%2_');
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
        maz.assignPCandEQU(ast, symbols);
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
        maz.assignPCandEQU(ast, symbols);
        expect(symbols.one).toBe(5);
        expect(symbols.two).toBe(5);
        expect(symbols.three).toEqual({expr:'one'});
    });
    it('should evaluate symbols', function() {
        const symbols = {
            one: 1,
            two: {expression: 'three'},
            three: {expression: 'one'}
        };
        maz.evaluateSymbols(symbols);
        expect(symbols).toEqual({
            one: 1,
            two: 1,
            three: 1
        })
    });
    it('should evaluate symbols and detect circular references', function() {
        const symbols = {
            one: 1,
            two: {expression: 'three'},
            three: {expression: 'two'}
        };
        expect(function() {
             maz.evaluateSymbols(symbols);
        }).toThrow();
    });
    it('should evaluate symbols with scope', function() {
        const symbols = {
            '%1_two': {expression: 'three'},
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': {expression: 'three + two'}
        };
        maz.evaluateSymbols(symbols);
        expect(symbols).toEqual({
            '%1_two': 4,
            three: 3,
            '%1_three': 4,
            '%2_%1_three': 5,
            '%2_%1_bob': 9
        });
    });
    it('should get whole prefix', function() {
        expect(maz.getWholePrefix('%2_%3_%4_bob')).toBe('%2_%3_%4_');
    });
    it('should get reduced prefix', function() {
        expect(maz.getReducedPrefix('%2_%3_%4_')).toBe('%3_%4_');
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
        expect(maz.findVariable(symbols, '%2_%1_%0_', 'a')).toBe('%2_%1_%0_a');
        expect(maz.findVariable(symbols, '%2_%1_%0_', 'b')).toBe('%2_%1_%0_b');
        expect(maz.findVariable(symbols, '%2_%1_%0_', 'c')).toBe('%1_%0_c');
        expect(maz.findVariable(symbols, '%2_%1_%0_', 'd')).toBe('%0_d');
        expect(maz.findVariable(symbols, '%2_%1_%0_', 'e')).toBe('e');

        expect(maz.findVariable(symbols, '%1_%0_', 'b')).toBe('%1_%0_b');
        expect(maz.findVariable(symbols, '%1_%0_', 'c')).toBe('%1_%0_c');
        expect(maz.findVariable(symbols, '%1_%0_', 'd')).toBe('%0_d');
        expect(maz.findVariable(symbols, '%1_%0_', 'e')).toBe('e');

        expect(maz.findVariable(symbols, '%0_', 'c')).toBe('%0_c');
        expect(maz.findVariable(symbols, '%0_', 'd')).toBe('%0_d');
        expect(maz.findVariable(symbols, '%0_', 'e')).toBe('e');

        expect(maz.findVariable(symbols, '', 'd')).toBe('d');
        expect(maz.findVariable(symbols, '', 'e')).toBe('e');
    });
    it('should update bytes', function() {
        const ast = [
            { references: ['three'], bytes: [0, {expression: 'three'}]},
            { references: ['three'], bytes: [0, {expression: 'three'}, null]}
        ];
        const symbols = {
            three: 0x1234
        }
        maz.updateBytes(ast, symbols);
        expect(ast).toEqual([
            { references: ['three'], bytes: [0, 0x34]},
            { references: ['three'], bytes: [0, 0x34, 0x12]}
        ])
    });
});