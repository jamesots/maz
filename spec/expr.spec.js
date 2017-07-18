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

    it('should add number and char-word', function() {
        const result = expr.parse(`1 + "AA"`);
        expect(result).toBe(16706);
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

    it('should not 0 to 1', function() {
        const result = expr.parse(`!0`);
        expect(result).toBe(1);
    });

    it('should not other numbers to 0', function() {
        let result = expr.parse(`!1`);
        expect(result).toBe(0);
        result = expr.parse(`!12`);
        expect(result).toBe(0);
    });

    it('should invert numbers', function() {
        let result = expr.parse(`~1`);
        expect(result).toBe(-2);
        result = expr.parse(`~240`);
        expect(result).toBe(-241);
    });

    it('should not invert strings', function() {
        expect(function() {
            expr.parse(`~"bob"`);
        }).toThrow();
    });

    it('should not not strings', function() {
        expect(function() {
            expr.parse(`!"bob"`);
        }).toThrow();
    });

    it('should min things', function() {
        let result = expr.parse(`min(1, 2)`);
        expect(result).toBe(1);
        result = expr.parse(`min('a', 'z')`);
        expect(result).toBe(97);
        result = expr.parse(`min("abba", "zappa")`);
        expect(result).toBe("abba");
    });

    it('should not min string and number', function() {
        expect(function() {
            expr.parse(`min("bob", 1)`);
        }).toThrow();
        expect(function() {
            expr.parse(`min(1, "bob")`);
        }).toThrow();
    });

    it('should max things', function() {
        let result = expr.parse(`max(1, 2)`);
        expect(result).toBe(2);
        result = expr.parse(`max('a', 'z')`);
        expect(result).toBe(122);
        result = expr.parse(`max("abba", "zappa")`);
        expect(result).toBe("zappa");
    });

    it('should not max string and number', function() {
        expect(function() {
            expr.parse(`max("bob", 1)`);
        }).toThrow();
        expect(function() {
            expr.parse(`max(1, "bob")`);
        }).toThrow();
    });

    it('should recognise +', function() {
        let result = expr.parse(`+5`);
        expect(result).toBe(5);
        result = expr.parse(`2 + +3`);
        expect(result).toBe(5);
        result = expr.parse(`2++3`);
        expect(result).toBe(5);
        result = expr.parse(`+'a'`);
        expect(result).toBe(97);
    });

    it('should recognise -', function() {
        let result = expr.parse(`-5`);
        expect(result).toBe(-5);
        result = expr.parse(`2 + -3`);
        expect(result).toBe(-1);
        result = expr.parse(`2+-3`);
        expect(result).toBe(-1);
        result = expr.parse(`-'a'`);
        expect(result).toBe(-97);
    });

    it('should not allow + string', function() {
        expect(function() {
            expr.parse(`+"bob"`);
        }).toThrow();
    });

    it('should not allow - string', function() {
        expect(function() {
            expr.parse(`-"bob"`);
        }).toThrow();
    });

    it('should compare things', function() {
        let result = expr.parse(`5 < 3`);
        expect(result).toBe(0);
        result = expr.parse(`5 > 3`);
        expect(result).toBe(1);
        result = expr.parse(`5 > 3 < 2`);
        expect(result).toBe(1);
        result = expr.parse(`5 > 3 < 0`);
        expect(result).toBe(0);
        result = expr.parse(`"a" < "b"`);
        expect(result).toBe(1);
        result = expr.parse(`"aaaa" < "aaab"`);
        expect(result).toBe(1);
        result = expr.parse(`"aaaa" < 1`);
        expect(result).toBe(0);
        result = expr.parse(`"0" < 1`);
        expect(result).toBe(1);
        result = expr.parse(`"123" < 124`);
        expect(result).toBe(1);
        result = expr.parse(`10 <= 3`);
        expect(result).toBe(0);
        result = expr.parse(`11 <= 11`);
        expect(result).toBe(1);
        result = expr.parse(`12 >= 3`);
        expect(result).toBe(1);
        result = expr.parse(`13 >= 13`);
        expect(result).toBe(1);
    });

    it('should compare things for equality', function() {
        let result = expr.parse(`5 == 5`);
        expect(result).toBe(1);
        result = expr.parse(`"5" == "5"`);
        expect(result).toBe(1);
        result = expr.parse(`"5" = "5"`);
        expect(result).toBe(1);
        result = expr.parse(`"5" = "55"`);
        expect(result).toBe(0);
        result = expr.parse(`10 = 10`);
        expect(result).toBe(1);
        result = expr.parse(`10 = 11`);
        expect(result).toBe(0);
        result = expr.parse(`10 != 10`);
        expect(result).toBe(0);
        result = expr.parse(`10 != 10`);
        expect(result).toBe(0);
        result = expr.parse(`10 <> 10`);
        expect(result).toBe(0);
    });

    it('should bitwise and things', function() {
        let result = expr.parse(`11111111b and 11001010b`);
        expect(result).toBe(0b11001010);
        result = expr.parse(`10101100b & 11001010b`);
        expect(result).toBe(0b10001000);
        result = expr.parse(`10101100b & 11001010b and 10000000b`);
        expect(result).toBe(0b10000000);
    });

    it('should bitwise xor things', function() {
        let result = expr.parse(`11111111b xor 11001010b`);
        expect(result).toBe(0b00110101);
        result = expr.parse(`10101100b ^ 11001010b`);
        expect(result).toBe(0b01100110);
        result = expr.parse(`10101100b ^ 11001010b xor 10000000b`);
        expect(result).toBe(0b11100110);
    });

    it('should bitwise or things', function() {
        let result = expr.parse(`11110000b or 11001010b`);
        expect(result).toBe(0b11111010);
        result = expr.parse(`10101100b | 11001010b`);
        expect(result).toBe(0b11101110);
        result = expr.parse(`10101100b | 11001010b or 10000001b`);
        expect(result).toBe(0b11101111);
    });
});