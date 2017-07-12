const maz = require('../build/maz');

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
            two: {expression: 'one'},
            three: {expression: 'two'}
        };
        maz.evaluateSymbols(symbols);
        expect(symbols).toEqual({
            one: 1,
            two: 1,
            three: 1
        })
    })
});