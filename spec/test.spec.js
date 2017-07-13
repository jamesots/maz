const parser = require('../src/parser');
const Tracer = require('pegjs-backtrace');

describe('parser', function() {
    function parse(text) {
        const tracer = new Tracer(text);
        try {
            return parser.parse(text, { trace: true, tracer: tracer });
        } catch (e) {
            console.log(tracer.getBacktraceString());
            throw e;
        }
    }
    
    function testOpcode(opcode, bytes) {
        const result = parse(opcode);
        expect(result[0].bytes).toEqual(bytes);
    }

    it('should parse empty file', function() {
        const result = parse(``)
        expect(result).toBeNull();
    });
    it('should parse whitespace only', function() {
        const result = parse(`      
        `)
        expect(result).toBeNull();
    });
    it('should parse nop', function() {
        const result = parse('nop');
        expect(result.length).toBe(1);
        expect(result[0].text).toEqual('nop');
        expect(result[0].bytes).toEqual([0]);
    });
    it('should parse nop with whitespace', function() {
        const result = parse('  nop   ');
        expect(result.length).toBe(1);
        expect(result[0].text).toEqual('nop');
        expect(result[0].bytes).toEqual([0]);
    });
    it('should parse nop with label', function() {
        const result = parse('thing:  nop   ');
        expect(result.length).toBe(2);
        expect(result[0].label).toEqual('thing');
        expect(result[1].text).toEqual('nop');
        expect(result[1].bytes).toEqual([0]);
    });
    it('should parse nop with two labels', function() {
        const result = parse(`
        blah:
        thing:  nop   `);
        expect(result.length).toBe(3);
        expect(result[0].label).toEqual('blah');
        expect(result[1].label).toEqual('thing');
        expect(result[2].text).toEqual('nop');
        expect(result[2].bytes).toEqual([0]);
    });
    it('should parse nop with comment, followed by nop', function() {
        const result = parse(`thing:  nop  ; lovely stuff
        nop`);
        expect(result.length).toBe(3);
        expect(result[0].label).toEqual('thing');

        expect(result[1].text).toEqual('nop');
        expect(result[1].bytes).toEqual([0]);

        expect(result[2].text).toEqual('nop');
        expect(result[2].bytes).toEqual([0]);
        expect(result[2].label).toBeUndefined();
    });
    it('should parse nop with comment, followed by eof', function() {
        const result = parse(`thing:  nop  ; lovely stuff`);
        expect(result.length).toBe(2);
        expect(result[0].label).toEqual('thing');
        expect(result[1].text).toEqual('nop');
        expect(result[1].bytes).toEqual([0]);
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
        ['ld hl,($7Bca)', [0x2a, 0xca, 0x7b]],
        ['dec hl', [0x2b]],
        ['inc l', [0x2c]],
        ['dec l', [0x2d]],
        ['ld l,$42', [0x2e, 0x42]],
        ['cpl', [0x2f]],
        ['jr nc,$100', [0x30, {
            relative: 256
        }]],
        ['ld sp,$e0f9', [0x31, 0xf9, 0xe0]],
        ['ld ($1234),a', [0x32, 0x34, 0x12]],
        ['inc sp', [0x33]],
        ['inc (hl)', [0x34]],
        ['dec (hl)', [0x35]],
        ['ld (hl),$9a', [0x36, 0x9a]],
        ['scf', [0x37]],
        ['jr c,$100', [0x38, {
            relative: 256
        }]],
        ['add hl,sp', [0x39]],
        ['ld a,($7Bca)', [0x3a, 0xca, 0x7b]],
        ['dec sp', [0x3b]],
        ['inc a', [0x3c]],
        ['dec a', [0x3d]],
        ['ld a,$42', [0x3e, 0x42]],
        ['ccf', [0x3f]],

        ['ld b,b', [0x40]],
        ['ld b,c', [0x41]],
        ['ld b,d', [0x42]],
        ['ld b,e', [0x43]],
        ['ld b,h', [0x44]],
        ['ld b,l', [0x45]],
        ['ld b,(hl)', [0x46]],
        ['ld b,a', [0x47]],

        ['ld c,b', [0x48]],
        ['ld c,c', [0x49]],
        ['ld c,d', [0x4a]],
        ['ld c,e', [0x4b]],
        ['ld c,h', [0x4c]],
        ['ld c,l', [0x4d]],
        ['ld c,(hl)', [0x4e]],
        ['ld c,a', [0x4f]],

        ['ld d,b', [0x50]],
        ['ld d,c', [0x51]],
        ['ld d,d', [0x52]],
        ['ld d,e', [0x53]],
        ['ld d,h', [0x54]],
        ['ld d,l', [0x55]],
        ['ld d,(hl)', [0x56]],
        ['ld d,a', [0x57]],

        ['ld e,b', [0x58]],
        ['ld e,c', [0x59]],
        ['ld e,d', [0x5a]],
        ['ld e,e', [0x5b]],
        ['ld e,h', [0x5c]],
        ['ld e,l', [0x5d]],
        ['ld e,(hl)', [0x5e]],
        ['ld e,a', [0x5f]],

        ['ld h,b', [0x60]],
        ['ld h,c', [0x61]],
        ['ld h,d', [0x62]],
        ['ld h,e', [0x63]],
        ['ld h,h', [0x64]],
        ['ld h,l', [0x65]],
        ['ld h,(hl)', [0x66]],
        ['ld h,a', [0x67]],

        ['ld l,b', [0x68]],
        ['ld l,c', [0x69]],
        ['ld l,d', [0x6a]],
        ['ld l,e', [0x6b]],
        ['ld l,h', [0x6c]],
        ['ld l,l', [0x6d]],
        ['ld l,(hl)', [0x6e]],
        ['ld l,a', [0x6f]],

        ['ld (hl),b', [0x70]],
        ['ld (hl),c', [0x71]],
        ['ld (hl),d', [0x72]],
        ['ld (hl),e', [0x73]],
        ['ld (hl),h', [0x74]],
        ['ld (hl),l', [0x75]],
        ['halt', [0x76]],
        ['ld (hl),a', [0x77]],

        ['ld a,b', [0x78]],
        ['ld a,c', [0x79]],
        ['ld a,d', [0x7a]],
        ['ld a,e', [0x7b]],
        ['ld a,h', [0x7c]],
        ['ld a,l', [0x7d]],
        ['ld a,(hl)', [0x7e]],
        ['ld a,a', [0x7f]],

        ['add a,b', [0x80]],
        ['add a,c', [0x81]],
        ['add a,d', [0x82]],
        ['add a,e', [0x83]],
        ['add a,h', [0x84]],
        ['add a,l', [0x85]],
        ['add a,(hl)', [0x86]],
        ['add a,a', [0x87]],

        ['adc a,b', [0x88]],
        ['adc a,c', [0x89]],
        ['adc a,d', [0x8a]],
        ['adc a,e', [0x8b]],
        ['adc a,h', [0x8c]],
        ['adc a,l', [0x8d]],
        ['adc a,(hl)', [0x8e]],
        ['adc a,a', [0x8f]],

        ['sub b', [0x90]],
        ['sub c', [0x91]],
        ['sub d', [0x92]],
        ['sub e', [0x93]],
        ['sub h', [0x94]],
        ['sub l', [0x95]],
        ['sub (hl)', [0x96]],
        ['sub a', [0x97]],

        // alternative syntax
        ['sub a,b', [0x90]],
        ['sub a,c', [0x91]],
        ['sub a,d', [0x92]],
        ['sub a,e', [0x93]],
        ['sub a,h', [0x94]],
        ['sub a,l', [0x95]],
        ['sub a,(hl)', [0x96]],
        ['sub a,a', [0x97]],

        ['sbc a,b', [0x98]],
        ['sbc a,c', [0x99]],
        ['sbc a,d', [0x9a]],
        ['sbc a,e', [0x9b]],
        ['sbc a,h', [0x9c]],
        ['sbc a,l', [0x9d]],
        ['sbc a,(hl)', [0x9e]],
        ['sbc a,a', [0x9f]],

        ['and b', [0xa0]],
        ['and c', [0xa1]],
        ['and d', [0xa2]],
        ['and e', [0xa3]],
        ['and h', [0xa4]],
        ['and l', [0xa5]],
        ['and (hl)', [0xa6]],
        ['and a', [0xa7]],

        // alternative syntax
        ['and a,b', [0xa0]],
        ['and a,c', [0xa1]],
        ['and a,d', [0xa2]],
        ['and a,e', [0xa3]],
        ['and a,h', [0xa4]],
        ['and a,l', [0xa5]],
        ['and a,(hl)', [0xa6]],
        ['and a,a', [0xa7]],

        ['xor b', [0xa8]],
        ['xor c', [0xa9]],
        ['xor d', [0xaa]],
        ['xor e', [0xab]],
        ['xor h', [0xac]],
        ['xor l', [0xad]],
        ['xor (hl)', [0xae]],
        ['xor a', [0xaf]],

        // alternative syntax
        ['xor a,b', [0xa8]],
        ['xor a,c', [0xa9]],
        ['xor a,d', [0xaa]],
        ['xor a,e', [0xab]],
        ['xor a,h', [0xac]],
        ['xor a,l', [0xad]],
        ['xor a,(hl)', [0xae]],
        ['xor a,a', [0xaf]],

        ['or b', [0xb0]],
        ['or c', [0xb1]],
        ['or d', [0xb2]],
        ['or e', [0xb3]],
        ['or h', [0xb4]],
        ['or l', [0xb5]],
        ['or (hl)', [0xb6]],
        ['or a', [0xb7]],

        // alternative syntax
        ['or a,b', [0xb0]],
        ['or a,c', [0xb1]],
        ['or a,d', [0xb2]],
        ['or a,e', [0xb3]],
        ['or a,h', [0xb4]],
        ['or a,l', [0xb5]],
        ['or a,(hl)', [0xb6]],
        ['or a,a', [0xb7]],

        ['cp b', [0xb8]],
        ['cp c', [0xb9]],
        ['cp d', [0xba]],
        ['cp e', [0xbb]],
        ['cp h', [0xbc]],
        ['cp l', [0xbd]],
        ['cp (hl)', [0xbe]],
        ['cp a', [0xbf]],

        // alternative syntax
        ['cp a,b', [0xb8]],
        ['cp a,c', [0xb9]],
        ['cp a,d', [0xba]],
        ['cp a,e', [0xbb]],
        ['cp a,h', [0xbc]],
        ['cp a,l', [0xbd]],
        ['cp a,(hl)', [0xbe]],
        ['cp a,a', [0xbf]],

        ['ret nz', [0xc0]],
        ['pop bc', [0xc1]],
        ['jp nz,$1234', [0xc2, 0x34, 0x12]],
        ['jp $1234', [0xc3, 0x34, 0x12]],
        ['call nz,$1234', [0xc4, 0x34, 0x12]],
        ['push bc', [0xc5]],
        ['add a,$12', [0xc6, 0x12]],
        ['rst 00h', [0xc7]],
        ['rst $00', [0xc7]],

        ['ret z', [0xc8]],
        ['ret', [0xc9]],
        ['jp z,$1234', [0xca, 0x34, 0x12]],
        ['call z,$1234', [0xcc, 0x34, 0x12]],
        ['call $1234', [0xcd, 0x34, 0x12]],
        ['adc a,$12', [0xce, 0x12]],
        ['rst 08h', [0xcf]],
        ['rst $08', [0xcf]],

        ['ret nc', [0xd0]],
        ['pop de', [0xd1]],
        ['jp nc,$1234', [0xd2, 0x34, 0x12]],
        ['out ($12),a', [0xd3, 0x12]],
        ['call nc,$1234', [0xd4, 0x34, 0x12]],
        ['push de', [0xd5]],
        ['sub a,$12', [0xd6, 0x12]],
        ['sub $12', [0xd6, 0x12]],
        ['rst 10h', [0xd7]],
        ['rst $10', [0xd7]],

        ['ret c', [0xd8]],
        ['exx', [0xd9]],
        ['jp c,$1234', [0xda, 0x34, 0x12]],
        ['in a,($12)', [0xdb, 0x12]],
        ['call c,$1234', [0xdc, 0x34, 0x12]],
        ['pfix', [0xdd]],
        ['sbc a,$12', [0xde, 0x12]],
        ['rst 18h', [0xdf]],
        ['rst $18', [0xdf]],

        ['ret po', [0xe0]],
        ['pop hl', [0xe1]],
        ['jp po,$1234', [0xe2, 0x34, 0x12]],
        ['ex (sp),hl', [0xe3]],
        ['call po,$1234', [0xe4, 0x34, 0x12]],
        ['push hl', [0xe5]],
        ['and a,$12', [0xe6, 0x12]],
        ['and $12', [0xe6, 0x12]],
        ['rst 20h', [0xe7]],
        ['rst $20', [0xe7]],

        ['ret pe', [0xe8]],
        ['jp (hl)', [0xe9]],
        ['jp pe,$1234', [0xea, 0x34, 0x12]],
        ['ex de,hl', [0xeb]],
        ['call pe,$1234', [0xec, 0x34, 0x12]],
        ['xor a,$12', [0xee, 0x12]],
        ['xor $12', [0xee, 0x12]],
        ['rst 28h', [0xef]],
        ['rst $28', [0xef]],

        ['ret p', [0xf0]],
        ['pop af', [0xf1]],
        ['jp p,$1234', [0xf2, 0x34, 0x12]],
        ['di', [0xf3]],
        ['call p,$1234', [0xf4, 0x34, 0x12]],
        ['push af', [0xf5]],
        ['or a,$12', [0xf6, 0x12]],
        ['or $12', [0xf6, 0x12]],
        ['rst 30h', [0xf7]],
        ['rst $30', [0xf7]],

        ['ret m', [0xf8]],
        ['ld sp,hl', [0xf9]],
        ['jp m,$1234', [0xfa, 0x34, 0x12]],
        ['ei', [0xfb]],
        ['call m,$1234', [0xfc, 0x34, 0x12]],
        ['pfiy', [0xfd]],
        ['cp a,$12', [0xfe, 0x12]],
        ['cp $12', [0xfe, 0x12]],
        ['rst 38h', [0xff]],
        ['rst $38', [0xff]],
    ]
    for (const opcode of opcodes) {
        it('should parse ' + opcode[0], function() {;
            const result = parse(opcode[0]);
            expect(result[0].bytes).toEqual(opcode[1]);
        });
    }

    it('should not parse ld (hl),(hl)', function() {
        expect(function() {
            const result = parser.parse('ld (hl),(hl)', {trace: false, tracer: null});
        }).toThrow();
    });
    it('should parse db string in double quotes', function() {
        const result = parse('db "hello"');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([104, 101, 108, 108, 111]);
    });
    it('should parse db string in single quotes', function() {
        const result = parse('db \'hello\'');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([104, 101, 108, 108, 111]);
    });
    it('should parse db number', function() {
        const result = parse('db 12');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([12]);
    });
    it('should parse db multiple numbers', function() {
        const result = parse('db 12,13');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([12, 13]);
    });
    it('should parse db numbers and strings', function() {
        const result = parse('db "he",108,108,"o"');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([104, 101, 108, 108, 111]);
    });
    it('should parse db numbers and strings followed by something', function() {
        const result = parse(`db "he",108
nop`);
        expect(result.length).toBe(2);
        expect(result[0].bytes).toEqual([104, 101, 108]);
        expect(result[1].bytes).toEqual([0]);
    });
    it('should parse db expression', function() {
        const result = parse('db 5 + 6');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([11]);
    });
    it('should parse db label', function() {
        const result = parse('db thing');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([{expression: 'thing'}]);
    });
    it('should parse db complex escaping', function() {
        const result = parse('db "\\"Hey \\0\\r\\n\\x13" ');
        expect(String.fromCharCode.apply(this, result[0].bytes)).toBe("\"Hey \0\r\n\x13");
    });
    it('should parse equ', function() {
        const result = parse('thing: equ 6');
        expect(result.length).toBe(2);
        expect(result[0].label).toEqual('thing');
        expect(result[1].equ).toEqual(6);
        // console.log(JSON.stringify(result));
    });
});