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
});