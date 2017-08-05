const expr = require('../lib/expr');
const sourceMapSupport = require('source-map-support');
sourceMapSupport.install();

describe('expr', function() {
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

    it('should multiply two char strings', function() {
        const result = expr.parse(`"ab" * 2`);
        expect(result).toBe(0xc4c2);
    });

    it('should multiply one char strings', function() {
        const result = expr.parse(`"a" * 2`);
        expect(result).toBe(0xc2);
    });

    it('should add two char strings', function() {
        const result = expr.parse(`"ab" + "cd"`);
        expect(result).toBe(0xc6c4);
    });

    it('should not add three char strings', function() {
        expect(function() {
            const result = expr.parse(`"abc" + "def"`);
        }).toThrow();
    });

    it('should parse string', function() {
        const result = expr.parse(`"hello"`);
        expect(result).toBe("hello");
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
        expect(function() {
            const result = expr.parse(`"BOB" * 2`);
        }).toThrow();
    });

    it('should not multiply number and string', function() {
        expect(function() {
            const result = expr.parse(`2 * "BOB"`);
        }).toThrow();
    });

    it('should not multiply two strings', function() {
        expect(function() {
            expr.parse(`"bob" * "bob"`);
        }).toThrow();
    });

    it('should add numbers and variables', function() {
        const result = expr.parse(`123 + bob`, {variables: {
            bob: 2
        }});
        expect(result).toBe(125);
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

    it('should concatenate thing', function() {
        let result = expr.parse(`cat("ab", "bc", 16)`);
        expect(result).toBe("abbc16");
    });

    it('should repeat string', function() {
        let result = expr.parse(`rpt("hello", 3)`);
        expect(result).toBe("hellohellohello");
    });

    it('should swap bytes', function() {
        let result = expr.parse(`swp($1234)`);
        expect(result).toBe(0x3412);
    });

    it('should min things', function() {
        let result = expr.parse(`min(1, 2)`);
        expect(result).toBe(1);
        result = expr.parse(`min(5, 1, 2)`);
        expect(result).toBe(1);
        result = expr.parse(`min('a', 'z')`);
        expect(result).toBe(97);
        result = expr.parse(`min('m', 'a', 'z')`);
        expect(result).toBe(97);
        result = expr.parse(`min("abba", "zappa")`);
        expect(result).toBe("abba");
        result = expr.parse(`min("bubba", "abba", "zappa")`);
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
        result = expr.parse(`max(5, 1, 2)`);
        expect(result).toBe(5);
        result = expr.parse(`max('a', 'z')`);
        expect(result).toBe(122);
        result = expr.parse(`max('a', 'z', 'b')`);
        expect(result).toBe(122);
        result = expr.parse(`max("abba", "zappa")`);
        expect(result).toBe("zappa");
        result = expr.parse(`max("abba", "zappa", "bubba")`);
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
        expect(function() {
            expr.parse(`100101001b or101110101b`);
        }).toThrow();
        result = expr.parse(`10101100b | 11001010b or(10000001b)`);
        expect(result).toBe(0b11101111);
    });

    it('should logical and things', function() {
        let result = expr.parse(`1 && 1`);
        expect(result).toBe(1);
        result = expr.parse(`1 && 0`);
        expect(result).toBe(0);
        result = expr.parse(`12 && 5`);
        expect(result).toBe(1);
    });

    it('should logical or things', function() {
        let result = expr.parse(`1 || 1`);
        expect(result).toBe(1);
        result = expr.parse(`1 || 0`);
        expect(result).toBe(1);
        result = expr.parse(`0 || 1`);
        expect(result).toBe(1);
        result = expr.parse(`0 || 0`);
        expect(result).toBe(0);
        result = expr.parse(`12 || 0`);
        expect(result).toBe(1);
    });

    it('should do ternary things', function() {
        let result = expr.parse(`1 ? 2 : 3`);
        expect(result).toBe(2);
        result = expr.parse(`0 ? 2 : 3`);
        expect(result).toBe(3);
        result = expr.parse(`10 ? 2 : 3`);
        expect(result).toBe(2);
    });

    it('should parse $', function() {
        let result = expr.parse('$', { variables: {'$': 10}});
        expect(result).toBe(10);
    })
});