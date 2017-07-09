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
        ['ld bc,$12 + $34 + $2', [0x01, 0x48, 0x00]],
        ['ld bc,$12 + start', [0x01, {
            expression: '18 + start'
        }, null]],
        ['ld bc,$1234', [0x01, 0x34, 0x12]],
        ['ld (bc),a', [0x02]],
        ['inc bc', [0x03]],
        ['inc b', [0x04]],
        ['dec b', [0x05]],
        ['ld b,$12', [0x06, 0x12]],
        ['rlca', [0x07]],
        ['ex af,af\'', [0x08]],
        ['add hl,bc', [0x09]],
        ['ld a,(bc)', [0x0a]],
        ['dec bc', [0x0b]],
        ['inc c', [0x0c]],
        ['dec c', [0x0d]],
        ['ld c,$12', [0x0e, 0x12]],
        ['rrca', [0x0f]],
        ['djnz $100', [0x10, {
            relative: 256
        }]],
        ['ld de,$543F', [0x11, 0x3f, 0x54]],
        ['ld (de),a', [0x12]],
        ['inc de', [0x13]],
        ['inc d', [0x14]],
        ['dec d', [0x15]],
        ['ld d,$fe', [0x16, 0xfe]],
        ['rla', [0x17]],
        ['jr $100', [0x18, {
            relative: 256
        }]],
        ['add hl,de', [0x19]],
        ['ld a,(de)', [0x1a]],
        ['dec de', [0x1b]],
        ['inc e', [0x1c]],
        ['dec e', [0x1d]],
        ['ld e,$01', [0x1e, 0x01]],
        ['rra', [0x1f]],
        ['jr nz,$100', [0x20, {
            relative: 256
        }]],
        ['ld hl,$e0f9', [0x21, 0xf9, 0xe0]],
        ['ld ($1234),hl', [0x22, 0x34, 0x12]],
        ['inc hl', [0x23]],
        ['inc h', [0x24]],
        ['dec h', [0x25]],
        ['ld h,$9a', [0x26, 0x9a]],
        ['daa', [0x27]],
        ['jr z,$100', [0x28, {
            relative: 256
        }]],
        ['add hl,hl', [0x29]],
        ['ld hl,($7bca)', [0x2a, 0xca, 0x7b]]
    ]
    for (const opcode of opcodes) {
        it('should parse ' + opcode[0], function() {;
            const result = parser.parse(opcode[0]);
            expect(result[0].bytes).toEqual(opcode[1]);
        });
    }
});