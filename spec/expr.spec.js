const expr = require('../build/expr');

fdescribe('expr', function() {
    it('should parse number', function() {
        const result = expr.parse(`123`);
        expect(result).toBe(123);
    });

    it('should add numbers', function() {
        const result = expr.parse(`123 + 5`);
        expect(result).toBe(128);
    });

    it('should subtract numbers', function() {
        const result = expr.parse(`123 - 5`);
        expect(result).toBe(118);
    });

    it('should add multiple numbers', function() {
        const result = expr.parse(`123 + 5 + 12`);
        expect(result).toBe(140);
    });

    it('should multiply numbers', function() {
        const result = expr.parse(`3 * 5`);
        expect(result).toBe(15);
    });

    it('should multiply multiple numbers', function() {
        const result = expr.parse(`3 * 5 * 2`);
        expect(result).toBe(30);
    });

    it('should multiply and add numbers with correct precedence', function() {
        const result = expr.parse(`1 + 3 * 5`);
        expect(result).toBe(16);
    });

    it('should multiply and add numbers with correct precedence, with brackets', function() {
        const result = expr.parse(`(1 + 3) * 5`);
        expect(result).toBe(20);
    });

    it('should multiply and add mutliple numbers with correct precedence, with brackets', function() {
        const result = expr.parse(`(1 + 3) * 5 + (3 + 2) * 6`);
        expect(result).toBe(50);
    });

    it('should parse string', function() {
        const result = expr.parse(`"hello"`);
        expect(result).toBe("hello");
    });

    it('should add strings', function() {
        const result = expr.parse(`"hello" + "bob"`);
        expect(result).toBe("hellobob");
    });

    it('should add char and number', function() {
        const result = expr.parse(`"A" + 1`);
        expect(result).toBe(66);
    });

    it('should add number and char', function() {
        const result = expr.parse(`1 + "A"`);
        expect(result).toBe(66);
    });

    it('should not add number and string', function() {
        expect(function() {
            expr.parse(`1 + "bob"`);
        }).toThrow();
    });

    it('should not add string and number', function() {
        expect(function() {
            expr.parse(`"bob" + 1`);
        }).toThrow();
    });

    it('should multiply number and char', function() {
        const result = expr.parse(`2 * "A"`);
        expect(result).toBe(65 * 2);
    });

    it('should multiply char and number', function() {
        const result = expr.parse(`"A" * 2`);
        expect(result).toBe(65 * 2);
    });

    it('should multiply two chars', function() {
        const result = expr.parse(`"A" * "A"`);
        expect(result).toBe(65 * 65);
    });

    it('should multiply string and number', function() {
        const result = expr.parse(`"BOB" * 2`);
        expect(result).toBe("BOBBOB");
    });

    it('should multiply number and string', function() {
        const result = expr.parse(`2 * "BOB"`);
        expect(result).toBe("BOBBOB");
    });

    it('should not multiply two strings', function() {
        expect(function() {
            expr.parse(`"bob" * "bob"`);
        }).toThrow();
    });

    it('should multiply number and chars, with brackets, etc', function() {
        const result = expr.parse(`((1 + 2) * 3) * "BOB"`);
        expect(result).toBe("BOBBOBBOBBOBBOBBOBBOBBOBBOB");
    });

    it('should add numbers and variables', function() {
        const result = expr.parse(`123 + bob`, {variables: {
            bob: 2
        }});
        expect(result).toBe(125);
    });

    it('should use variables', function() {
        const result = expr.parse(`(num + chr) * str`, {variables: {
            num: 2,
            chr: 'A',
            str: 'BOB'
        }});
        expect(result).toBe('BOB'.repeat(65 + 2));
    });

    it('should shift numbers left', function() {
        const result = expr.parse(`1 << 2`);
        expect(result).toBe(4);
    });

    it('should shift numbers right', function() {
        const result = expr.parse(`8 >> 2`);
        expect(result).toBe(2);
    });

    it('should shift numbers right, test precedence', function() {
        const result = expr.parse(`6 + 2 >> 2`);
        expect(result).toBe(2);
    });
});