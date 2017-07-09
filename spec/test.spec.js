const parser = require('../src/parser');


describe('parser', function() {
    function testOpcode(opcode, bytes) {
        const result = parser.parse(opcode);
        expect(result[0].bytes).toEqual(bytes);
    }

    it('should parse empty file', function() {
        const result = parser.parse(``)
        expect(result).toBeNull();
    });
    it('should parse whitespace only', function() {
        const result = parser.parse(`      
        `)
        expect(result).toBeNull();
    });
    it('should parse nop', function() {
        const result = parser.parse('nop');
        expect(result).toEqual([{
            text: 'nop',
            bytes: [0]
        }]);
    });
    it('should parse nop with whitespace', function() {
        const result = parser.parse('  nop   ');
        expect(result).toEqual([{
            text: 'nop',
            bytes: [0]
        }]);
    });
    it('should parse nop with label', function() {
        const result = parser.parse('thing:  nop   ');
        expect(result).toEqual([{
            text: 'nop',
            bytes: [0],
            label: 'thing'
        }]);
    });
    it('should parse nop with comment, followed by nop', function() {
        const result = parser.parse(`thing:  nop  ; lovely stuff
        nop`);
        expect(result).toEqual([{
            text: 'nop',
            bytes: [0],
            label: 'thing'
        }, {
            text: 'nop',
            bytes: [0],
        }]);
    });
    it('should parse nop with comment, followed by eof', function() {
        const result = parser.parse(`thing:  nop  ; lovely stuff`);
        expect(result).toEqual([{
            text: 'nop',
            bytes: [0],
            label: 'thing'
        }]);
        // console.log(JSON.stringify(result));
    });

    const opcodes = [
        ['nop', [0x00]],
        ['ld bc,$12 + $34 + $2', [0x01, 0x34, 0x12]],
        ['ld bc,$12 + start', [0x01, 0x34, 0x12]],
        ['ld bc,$1234', [0x01, 0x34, 0x12]]
    ]
    for (const opcode of opcodes) {
        it('should parse ' + opcode[0], function() {;
            const result = parser.parse(opcode[0]);
            expect(result[0].bytes).toEqual(opcode[1]);
        });
    }
});