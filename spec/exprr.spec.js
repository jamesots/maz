const expr = require('../build/expr-reduced');

fdescribe('expr-reduced', function() {
    it('should parse things', function() {
        const result = expr.parse(`123 + thing * (1 + max(4, 9 << 2)) ? 12 : 0`);
        expect(result).toBe("123 + thing * (1 + max(4, 9 << 2)) ? 12 : 0");
    });

    it('should fail to parse things', function() {
        expect(function() {
            const result = expr.parse(`123 + thing ? * (1 + max(4, 9 << 2)) ? 12 : 0`);
        }).toThrow();
    });
});
