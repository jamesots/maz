const parser = require('../lib/parser');
const Tracer = require('pegjs-backtrace');
const sourceMapSupport = require('source-map-support');
sourceMapSupport.install();

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
        const result = parse(``);
        expect(result).toBeNull();
    });
    it('should parse whitespace only', function() {
        const result = parse(`      
        `);
        expect(result).toBeNull();
    });
    it('should parse nop', function() {
        const result = parse('nop');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([0]);
    });
    it('should parse nop with whitespace', function() {
        const result = parse('  nop   ');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([0]);
    });
    it('should parse nop with label', function() {
        const result = parse('thing:  nop   ');
        expect(result.length).toBe(2);
        expect(result[0].label).toEqual('thing');
        expect(result[1].bytes).toEqual([0]);
    });
    it('should parse nop with two labels', function() {
        const result = parse(`
        blah:
        thing:  nop   `);
        expect(result.length).toBe(3);
        expect(result[0].label).toEqual('blah');
        expect(result[1].label).toEqual('thing');
        expect(result[2].bytes).toEqual([0]);
    });
    it('should parse nop with comment, followed by nop', function() {
        const result = parse(`thing:  nop  ; lovely stuff
        nop`);
        expect(result.length).toBe(3);
        expect(result[0].label).toEqual('thing');

        expect(result[1].bytes).toEqual([0]);

        expect(result[2].bytes).toEqual([0]);
        expect(result[2].label).toBeUndefined();
    });
    it('should parse nop with comment, followed by eof', function() {
        const result = parse(`thing:  nop  ; lovely stuff`);
        expect(result.length).toBe(2);
        expect(result[0].label).toEqual('thing');
        expect(result[1].bytes).toEqual([0]);
    });

    const opcodes = [
        // prefixless instructions

        ['nop', [0x00]],
        ['ld bc,$12 + $34 + $2', [0x01, 0x48, 0x00]],
        ['ld bc,$12 + start', [0x01, {
            expression: '$12 + start',
            vars: ['start']
        }, null]],
        ['ld bc,$1234', [0x01, 0x34, 0x12]],
        ['ld bc,chr', [0x01, {expression:'chr',vars:['chr']}, null]],
        ['ld (bc),a', [0x02]],
        ['inc bc', [0x03]],
        ['inc b', [0x04]],
        ['dec b', [0x05]],
        ['ld b,$12', [0x06, 0x12]],
        ['ld b,chr', [0x06, {expression:'chr',vars:['chr']}]],
        ['rlca', [0x07]],
        ['ex af,af\'', [0x08]],
        ['add hl,bc', [0x09]],
        ['ld a,(bc)', [0x0a]],
        ['dec bc', [0x0b]],
        ['inc c', [0x0c]],
        ['dec c', [0x0d]],
        ['ld c,$12', [0x0e, 0x12]],
        ['ld c,chr', [0x0e, {expression:'chr',vars:['chr']}]],
        ['rrca', [0x0f]],
        ['djnz $100', [0x10, {
            relative: 256
        }]],
        ['djnz chr', [0x10, {
            relative: {expression: 'chr',vars:['chr']}
        }]],
        ['ld de,$543F', [0x11, 0x3f, 0x54]],
        ['ld de,chr', [0x11, {expression:'chr',vars:['chr']}, null]],
        ['ld (de),a', [0x12]],
        ['inc de', [0x13]],
        ['inc d', [0x14]],
        ['dec d', [0x15]],
        ['ld d,$fe', [0x16, 0xfe]],
        ['ld d,chr', [0x16, {expression:'chr',vars:['chr']}]],
        ['rla', [0x17]],
        ['jr $100', [0x18, {
            relative: 256
        }]],
        ['jr chr', [0x18, {
            relative: {expression:'chr',vars:['chr']}
        }]],
        ['add hl,de', [0x19]],
        ['ld a,(de)', [0x1a]],
        ['dec de', [0x1b]],
        ['inc e', [0x1c]],
        ['dec e', [0x1d]],
        ['ld e,$01', [0x1e, 0x01]],
        ['ld e,chr', [0x1e, {expression:'chr',vars:['chr']}]],
        ['rra', [0x1f]],
        ['jr nz,$100', [0x20, {
            relative: 256
        }]],
        ['jr nz,chr', [0x20, {
            relative: {expression:'chr',vars:['chr']}
        }]],
        ['ld hl,$e0f9', [0x21, 0xf9, 0xe0]],
        ['ld hl,chr', [0x21, {expression:'chr',vars:['chr']}, null]],
        ['ld ($1234),hl', [0x22, 0x34, 0x12]],
        ['ld (chr),hl', [0x22, {expression:'chr',vars:['chr']}, null]],
        ['inc hl', [0x23]],
        ['inc h', [0x24]],
        ['dec h', [0x25]],
        ['ld h,$9a', [0x26, 0x9a]],
        ['ld h,chr', [0x26, {expression:'chr',vars:['chr']}]],
        ['daa', [0x27]],
        ['jr z,$100', [0x28, {
            relative: 256
        }]],
        ['jr z,chr', [0x28, {
            relative: {expression:'chr',vars:['chr']}
        }]],
        ['add hl,hl', [0x29]],
        ['ld hl,($7Bca)', [0x2a, 0xca, 0x7b]],
        ['ld hl,(chr)', [0x2a, {expression:'chr',vars:['chr']}, null]],
        ['dec hl', [0x2b]],
        ['inc l', [0x2c]],
        ['dec l', [0x2d]],
        ['ld l,$42', [0x2e, 0x42]],
        ['ld l,chr', [0x2e, {expression:'chr',vars:['chr']}]],
        ['cpl', [0x2f]],
        ['jr nc,$100', [0x30, {
            relative: 256
        }]],
        ['jr nc,chr', [0x30, {
            relative: {expression:'chr',vars:['chr']}
        }]],
        ['ld sp,$e0f9', [0x31, 0xf9, 0xe0]],
        ['ld sp,chr', [0x31, {expression:'chr',vars:['chr']}, null]],
        ['ld ($1234),a', [0x32, 0x34, 0x12]],
        ['ld (chr),a', [0x32, {expression:'chr',vars:['chr']}, null]],
        ['inc sp', [0x33]],
        ['inc (hl)', [0x34]],
        ['dec (hl)', [0x35]],
        ['ld (hl),$9a', [0x36, 0x9a]],
        ['ld (hl),chr', [0x36, {expression:'chr',vars:['chr']}]],
        ['scf', [0x37]],
        ['jr c,$100', [0x38, {
            relative: 256
        }]],
        ['jr c,chr', [0x38, {
            relative: {expression:'chr',vars:['chr']}
        }]],
        ['add hl,sp', [0x39]],
        ['ld a,($7Bca)', [0x3a, 0xca, 0x7b]],
        ['ld a,(chr)', [0x3a, {expression:'chr',vars:['chr']}, null]],
        ['dec sp', [0x3b]],
        ['inc a', [0x3c]],
        ['dec a', [0x3d]],
        ['ld a,$42', [0x3e, 0x42]],
        ['ld a,chr', [0x3e, {expression:'chr',vars:['chr']}]],
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
        ['jp nz,chr', [0xc2, {expression:'chr',vars:['chr']}, null]],
        ['jp $1234', [0xc3, 0x34, 0x12]],
        ['jp chr', [0xc3, {expression:'chr',vars:['chr']}, null]],
        ['call nz,$1234', [0xc4, 0x34, 0x12]],
        ['call nz,chr', [0xc4, {expression:'chr',vars:['chr']}, null]],
        ['push bc', [0xc5]],
        ['add a,$12', [0xc6, 0x12]],
        ['add a,chr', [0xc6, {expression:'chr',vars:['chr']}]],
        ['rst 00h', [0xc7]],
        ['rst $00', [0xc7]],

        ['ret z', [0xc8]],
        ['ret', [0xc9]],
        ['jp z,$1234', [0xca, 0x34, 0x12]],
        ['jp z,chr', [0xca, {expression:'chr',vars:['chr']}, null]],
        ['call z,$1234', [0xcc, 0x34, 0x12]],
        ['call z,chr', [0xcc, {expression:'chr',vars:['chr']}, null]],
        ['call $1234', [0xcd, 0x34, 0x12]],
        ['call chr', [0xcd, {expression:'chr',vars:['chr']}, null]],
        ['adc a,$12', [0xce, 0x12]],
        ['adc a,chr', [0xce, {expression:'chr',vars:['chr']}]],
        ['rst 08h', [0xcf]],
        ['rst $08', [0xcf]],

        ['ret nc', [0xd0]],
        ['pop de', [0xd1]],
        ['jp nc,$1234', [0xd2, 0x34, 0x12]],
        ['jp nc,chr', [0xd2, {expression:'chr',vars:['chr']}, null]],
        ['out ($12),a', [0xd3, 0x12]],
        ['out (chr),a', [0xd3, {expression:'chr',vars:['chr']}]],
        ['call nc,$1234', [0xd4, 0x34, 0x12]],
        ['call nc,chr', [0xd4, {expression:'chr',vars:['chr']}, null]],
        ['push de', [0xd5]],
        ['sub a,$12', [0xd6, 0x12]],
        ['sub a,chr', [0xd6, {expression:'chr',vars:['chr']}]],
        ['sub $12', [0xd6, 0x12]],
        ['sub chr', [0xd6, {expression:'chr',vars:['chr']}]],
        ['rst 10h', [0xd7]],
        ['rst $10', [0xd7]],

        ['ret c', [0xd8]],
        ['exx', [0xd9]],
        ['jp c,$1234', [0xda, 0x34, 0x12]],
        ['jp c,chr', [0xda, {expression:'chr',vars:['chr']}, null]],
        ['in a,($12)', [0xdb, 0x12]],
        ['in a,(chr)', [0xdb, {expression:'chr',vars:['chr']}]],
        ['call c,chr', [0xdc, {expression:'chr',vars:['chr']}, null]],
        ['pfix', [0xdd]],
        ['sbc a,$12', [0xde, 0x12]],
        ['sbc a,chr', [0xde, {expression:'chr',vars:['chr']}]],
        ['rst 18h', [0xdf]],
        ['rst $18', [0xdf]],

        ['ret po', [0xe0]],
        ['pop hl', [0xe1]],
        ['jp po,$1234', [0xe2, 0x34, 0x12]],
        ['jp po,chr', [0xe2, {expression:'chr',vars:['chr']}, null]],
        ['ex (sp),hl', [0xe3]],
        ['call po,$1234', [0xe4, 0x34, 0x12]],
        ['call po,chr', [0xe4, {expression:'chr',vars:['chr']}, null]],
        ['push hl', [0xe5]],
        ['and a,$12', [0xe6, 0x12]],
        ['and a,chr', [0xe6, {expression:'chr',vars:['chr']}]],
        ['and $12', [0xe6, 0x12]],
        ['and chr', [0xe6, {expression:'chr',vars:['chr']}]],
        ['rst 20h', [0xe7]],
        ['rst $20', [0xe7]],

        ['ret pe', [0xe8]],
        ['jp (hl)', [0xe9]],
        ['jp pe,$1234', [0xea, 0x34, 0x12]],
        ['jp pe,chr', [0xea, {expression:'chr',vars:['chr']}, null]],
        ['ex de,hl', [0xeb]],
        ['call pe,$1234', [0xec, 0x34, 0x12]],
        ['call pe,chr', [0xec, {expression:'chr',vars:['chr']}, null]],
        ['xor a,$12', [0xee, 0x12]],
        ['xor a,chr', [0xee, {expression:'chr',vars:['chr']}]],
        ['xor $12', [0xee, 0x12]],
        ['xor chr', [0xee, {expression:'chr',vars:['chr']}]],
        ['rst 28h', [0xef]],
        ['rst $28', [0xef]],

        ['ret p', [0xf0]],
        ['pop af', [0xf1]],
        ['jp p,$1234', [0xf2, 0x34, 0x12]],
        ['jp p,chr', [0xf2, {expression:'chr',vars:['chr']}, null]],
        ['di', [0xf3]],
        ['call p,$1234', [0xf4, 0x34, 0x12]],
        ['call p,chr', [0xf4, {expression:'chr',vars:['chr']}, null]],
        ['push af', [0xf5]],
        ['or a,$12', [0xf6, 0x12]],
        ['or a,chr', [0xf6, {expression:'chr',vars:['chr']}]],
        ['or $12', [0xf6, 0x12]],
        ['or chr', [0xf6, {expression:'chr',vars:['chr']}]],
        ['rst 30h', [0xf7]],
        ['rst $30', [0xf7]],

        ['ret m', [0xf8]],
        ['ld sp,hl', [0xf9]],
        ['jp m,$1234', [0xfa, 0x34, 0x12]],
        ['jp m,chr', [0xfa, {expression:'chr',vars:['chr']}, null]],
        ['ei', [0xfb]],
        ['call m,$1234', [0xfc, 0x34, 0x12]],
        ['call m,chr', [0xfc, {expression:'chr',vars:['chr']}, null]],
        ['pfiy', [0xfd]],
        ['cp a,$12', [0xfe, 0x12]],
        ['cp a,chr', [0xfe, {expression:'chr',vars:['chr']}]],
        ['cp $12', [0xfe, 0x12]],
        ['cp chr', [0xfe, {expression:'chr',vars:['chr']}]],
        ['rst 38h', [0xff]],
        ['rst $38', [0xff]],

        // extended instructions (ed)

        ['in b,(c)', [0xed, 0x40]],
        ['out (c),b', [0xed, 0x41]],
        ['sbc hl,bc', [0xed, 0x42]],
        ['ld ($1234),bc', [0xed, 0x43, 0x34, 0x12]],
        ['ld (chr),bc', [0xed, 0x43, {expression:'chr',vars:['chr']}, null]],
        ['neg', [0xed, 0x44]],
        ['retn', [0xed, 0x45]],
        ['im 0', [0xed, 0x46]],
        ['ld i,a', [0xed, 0x47]],
        ['in c,(c)', [0xed, 0x48]],
        ['out (c),c', [0xed, 0x49]],
        ['adc hl,bc', [0xed, 0x4a]],
        ['ld bc,($1234)', [0xed, 0x4b, 0x34, 0x12]],
        ['ld bc,(chr)', [0xed, 0x4b, {expression:'chr',vars:['chr']}, null]],
        ['reti', [0xed, 0x4d]],
        ['ld r,a', [0xed, 0x4f]],

        ['in d,(c)', [0xed, 0x50]],
        ['out (c),d', [0xed, 0x51]],
        ['sbc hl,de', [0xed, 0x52]],
        ['ld ($1234),de', [0xed, 0x53, 0x34, 0x12]],
        ['im 1', [0xed, 0x56]],
        ['ld a,i', [0xed, 0x57]],
        ['in e,(c)', [0xed, 0x58]],
        ['out (c),e', [0xed, 0x59]],
        ['adc hl,de', [0xed, 0x5a]],
        ['ld de,($1234)', [0xed, 0x5b, 0x34, 0x12]],
        ['im 2', [0xed, 0x5e]],
        ['ld a,r', [0xed, 0x5f]],

        ['in h,(c)', [0xed, 0x60]],
        ['out (c),h', [0xed, 0x61]],
        ['sbc hl,hl', [0xed, 0x62]],
        ['rrd', [0xed, 0x67]],
        ['in l,(c)', [0xed, 0x68]],
        ['out (c),l', [0xed, 0x69]],
        ['adc hl,hl', [0xed, 0x6a]],
        ['rld', [0xed, 0x6f]],

        ['sbc hl,sp', [0xed, 0x72]],
        ['ld ($1234),sp', [0xed, 0x73, 0x34, 0x12]],
        ['in a,(c)', [0xed, 0x78]],
        ['out (c),a', [0xed, 0x79]],
        ['adc hl,sp', [0xed, 0x7a]],
        ['ld sp,($1234)', [0xed, 0x7b, 0x34, 0x12]],

        ['ldi', [0xed, 0xa0]],
        ['cpi', [0xed, 0xa1]],
        ['ini', [0xed, 0xa2]],
        ['outi', [0xed, 0xa3]],
        ['ldd', [0xed, 0xa8]],
        ['cpd', [0xed, 0xa9]],
        ['ind', [0xed, 0xaa]],
        ['outd', [0xed, 0xab]],

        ['ldir', [0xed, 0xb0]],
        ['cpir', [0xed, 0xb1]],
        ['inir', [0xed, 0xb2]],
        ['otir', [0xed, 0xb3]],
        ['lddr', [0xed, 0xb8]],
        ['cpdr', [0xed, 0xb9]],
        ['indr', [0xed, 0xba]],
        ['otdr', [0xed, 0xbb]],

        // bit instructions (cb)

        ['rlc b', [0xcb, 0x00]],
        ['rlc c', [0xcb, 0x01]],
        ['rlc d', [0xcb, 0x02]],
        ['rlc e', [0xcb, 0x03]],
        ['rlc h', [0xcb, 0x04]],
        ['rlc l', [0xcb, 0x05]],
        ['rlc (hl)', [0xcb, 0x06]],
        ['rlc a', [0xcb, 0x07]],

        ['rrc b', [0xcb, 0x08]],
        ['rrc c', [0xcb, 0x09]],
        ['rrc d', [0xcb, 0x0a]],
        ['rrc e', [0xcb, 0x0b]],
        ['rrc h', [0xcb, 0x0c]],
        ['rrc l', [0xcb, 0x0d]],
        ['rrc (hl)', [0xcb, 0x0e]],
        ['rrc a', [0xcb, 0x0f]],

        ['rl b', [0xcb, 0x10]],
        ['rl c', [0xcb, 0x11]],
        ['rl d', [0xcb, 0x12]],
        ['rl e', [0xcb, 0x13]],
        ['rl h', [0xcb, 0x14]],
        ['rl l', [0xcb, 0x15]],
        ['rl (hl)', [0xcb, 0x16]],
        ['rl a', [0xcb, 0x17]],

        ['rr b', [0xcb, 0x18]],
        ['rr c', [0xcb, 0x19]],
        ['rr d', [0xcb, 0x1a]],
        ['rr e', [0xcb, 0x1b]],
        ['rr h', [0xcb, 0x1c]],
        ['rr l', [0xcb, 0x1d]],
        ['rr (hl)', [0xcb, 0x1e]],
        ['rr a', [0xcb, 0x1f]],

        ['sla b', [0xcb, 0x20]],
        ['sla c', [0xcb, 0x21]],
        ['sla d', [0xcb, 0x22]],
        ['sla e', [0xcb, 0x23]],
        ['sla h', [0xcb, 0x24]],
        ['sla l', [0xcb, 0x25]],
        ['sla (hl)', [0xcb, 0x26]],
        ['sla a', [0xcb, 0x27]],

        ['sra b', [0xcb, 0x28]],
        ['sra c', [0xcb, 0x29]],
        ['sra d', [0xcb, 0x2a]],
        ['sra e', [0xcb, 0x2b]],
        ['sra h', [0xcb, 0x2c]],
        ['sra l', [0xcb, 0x2d]],
        ['sra (hl)', [0xcb, 0x2e]],
        ['sra a', [0xcb, 0x2f]],

        ['sll b', [0xcb, 0x30]],
        ['sll c', [0xcb, 0x31]],
        ['sll d', [0xcb, 0x32]],
        ['sll e', [0xcb, 0x33]],
        ['sll h', [0xcb, 0x34]],
        ['sll l', [0xcb, 0x35]],
        ['sll (hl)', [0xcb, 0x36]],
        ['sll a', [0xcb, 0x37]],

        ['srl b', [0xcb, 0x38]],
        ['srl c', [0xcb, 0x39]],
        ['srl d', [0xcb, 0x3a]],
        ['srl e', [0xcb, 0x3b]],
        ['srl h', [0xcb, 0x3c]],
        ['srl l', [0xcb, 0x3d]],
        ['srl (hl)', [0xcb, 0x3e]],
        ['srl a', [0xcb, 0x3f]],

        ['bit 0,b', [0xcb, 0x40]],
        ['bit 0,c', [0xcb, 0x41]],
        ['bit 0,d', [0xcb, 0x42]],
        ['bit 0,e', [0xcb, 0x43]],
        ['bit 0,h', [0xcb, 0x44]],
        ['bit 0,l', [0xcb, 0x45]],
        ['bit 0,(hl)', [0xcb, 0x46]],
        ['bit 0,a', [0xcb, 0x47]],

        ['bit 1,b', [0xcb, 0x48]],
        ['bit 1,c', [0xcb, 0x49]],
        ['bit 1,d', [0xcb, 0x4a]],
        ['bit 1,e', [0xcb, 0x4b]],
        ['bit 1,h', [0xcb, 0x4c]],
        ['bit 1,l', [0xcb, 0x4d]],
        ['bit 1,(hl)', [0xcb, 0x4e]],
        ['bit 1,a', [0xcb, 0x4f]],

        ['bit 2,b', [0xcb, 0x50]],
        ['bit 2,c', [0xcb, 0x51]],
        ['bit 2,d', [0xcb, 0x52]],
        ['bit 2,e', [0xcb, 0x53]],
        ['bit 2,h', [0xcb, 0x54]],
        ['bit 2,l', [0xcb, 0x55]],
        ['bit 2,(hl)', [0xcb, 0x56]],
        ['bit 2,a', [0xcb, 0x57]],

        ['bit 3,b', [0xcb, 0x58]],
        ['bit 3,c', [0xcb, 0x59]],
        ['bit 3,d', [0xcb, 0x5a]],
        ['bit 3,e', [0xcb, 0x5b]],
        ['bit 3,h', [0xcb, 0x5c]],
        ['bit 3,l', [0xcb, 0x5d]],
        ['bit 3,(hl)', [0xcb, 0x5e]],
        ['bit 3,a', [0xcb, 0x5f]],

        ['bit 4,b', [0xcb, 0x60]],
        ['bit 4,c', [0xcb, 0x61]],
        ['bit 4,d', [0xcb, 0x62]],
        ['bit 4,e', [0xcb, 0x63]],
        ['bit 4,h', [0xcb, 0x64]],
        ['bit 4,l', [0xcb, 0x65]],
        ['bit 4,(hl)', [0xcb, 0x66]],
        ['bit 4,a', [0xcb, 0x67]],

        ['bit 5,b', [0xcb, 0x68]],
        ['bit 5,c', [0xcb, 0x69]],
        ['bit 5,d', [0xcb, 0x6a]],
        ['bit 5,e', [0xcb, 0x6b]],
        ['bit 5,h', [0xcb, 0x6c]],
        ['bit 5,l', [0xcb, 0x6d]],
        ['bit 5,(hl)', [0xcb, 0x6e]],
        ['bit 5,a', [0xcb, 0x6f]],

        ['bit 6,b', [0xcb, 0x70]],
        ['bit 6,c', [0xcb, 0x71]],
        ['bit 6,d', [0xcb, 0x72]],
        ['bit 6,e', [0xcb, 0x73]],
        ['bit 6,h', [0xcb, 0x74]],
        ['bit 6,l', [0xcb, 0x75]],
        ['bit 6,(hl)', [0xcb, 0x76]],
        ['bit 6,a', [0xcb, 0x77]],

        ['bit 7,b', [0xcb, 0x78]],
        ['bit 7,c', [0xcb, 0x79]],
        ['bit 7,d', [0xcb, 0x7a]],
        ['bit 7,e', [0xcb, 0x7b]],
        ['bit 7,h', [0xcb, 0x7c]],
        ['bit 7,l', [0xcb, 0x7d]],
        ['bit 7,(hl)', [0xcb, 0x7e]],
        ['bit 7,a', [0xcb, 0x7f]],

        ['res 0,b', [0xcb, 0x80]],
        ['res 0,c', [0xcb, 0x81]],
        ['res 0,d', [0xcb, 0x82]],
        ['res 0,e', [0xcb, 0x83]],
        ['res 0,h', [0xcb, 0x84]],
        ['res 0,l', [0xcb, 0x85]],
        ['res 0,(hl)', [0xcb, 0x86]],
        ['res 0,a', [0xcb, 0x87]],

        ['res 1,b', [0xcb, 0x88]],
        ['res 1,c', [0xcb, 0x89]],
        ['res 1,d', [0xcb, 0x8a]],
        ['res 1,e', [0xcb, 0x8b]],
        ['res 1,h', [0xcb, 0x8c]],
        ['res 1,l', [0xcb, 0x8d]],
        ['res 1,(hl)', [0xcb, 0x8e]],
        ['res 1,a', [0xcb, 0x8f]],

        ['res 2,b', [0xcb, 0x90]],
        ['res 2,c', [0xcb, 0x91]],
        ['res 2,d', [0xcb, 0x92]],
        ['res 2,e', [0xcb, 0x93]],
        ['res 2,h', [0xcb, 0x94]],
        ['res 2,l', [0xcb, 0x95]],
        ['res 2,(hl)', [0xcb, 0x96]],
        ['res 2,a', [0xcb, 0x97]],

        ['res 3,b', [0xcb, 0x98]],
        ['res 3,c', [0xcb, 0x99]],
        ['res 3,d', [0xcb, 0x9a]],
        ['res 3,e', [0xcb, 0x9b]],
        ['res 3,h', [0xcb, 0x9c]],
        ['res 3,l', [0xcb, 0x9d]],
        ['res 3,(hl)', [0xcb, 0x9e]],
        ['res 3,a', [0xcb, 0x9f]],

        ['res 4,b', [0xcb, 0xa0]],
        ['res 4,c', [0xcb, 0xa1]],
        ['res 4,d', [0xcb, 0xa2]],
        ['res 4,e', [0xcb, 0xa3]],
        ['res 4,h', [0xcb, 0xa4]],
        ['res 4,l', [0xcb, 0xa5]],
        ['res 4,(hl)', [0xcb, 0xa6]],
        ['res 4,a', [0xcb, 0xa7]],

        ['res 5,b', [0xcb, 0xa8]],
        ['res 5,c', [0xcb, 0xa9]],
        ['res 5,d', [0xcb, 0xaa]],
        ['res 5,e', [0xcb, 0xab]],
        ['res 5,h', [0xcb, 0xac]],
        ['res 5,l', [0xcb, 0xad]],
        ['res 5,(hl)', [0xcb, 0xae]],
        ['res 5,a', [0xcb, 0xaf]],

        ['res 6,b', [0xcb, 0xb0]],
        ['res 6,c', [0xcb, 0xb1]],
        ['res 6,d', [0xcb, 0xb2]],
        ['res 6,e', [0xcb, 0xb3]],
        ['res 6,h', [0xcb, 0xb4]],
        ['res 6,l', [0xcb, 0xb5]],
        ['res 6,(hl)', [0xcb, 0xb6]],
        ['res 6,a', [0xcb, 0xb7]],

        ['res 7,b', [0xcb, 0xb8]],
        ['res 7,c', [0xcb, 0xb9]],
        ['res 7,d', [0xcb, 0xba]],
        ['res 7,e', [0xcb, 0xbb]],
        ['res 7,h', [0xcb, 0xbc]],
        ['res 7,l', [0xcb, 0xbd]],
        ['res 7,(hl)', [0xcb, 0xbe]],
        ['res 7,a', [0xcb, 0xbf]],

        ['set 0,b', [0xcb, 0xc0]],
        ['set 0,c', [0xcb, 0xc1]],
        ['set 0,d', [0xcb, 0xc2]],
        ['set 0,e', [0xcb, 0xc3]],
        ['set 0,h', [0xcb, 0xc4]],
        ['set 0,l', [0xcb, 0xc5]],
        ['set 0,(hl)', [0xcb, 0xc6]],
        ['set 0,a', [0xcb, 0xc7]],

        ['set 1,b', [0xcb, 0xc8]],
        ['set 1,c', [0xcb, 0xc9]],
        ['set 1,d', [0xcb, 0xca]],
        ['set 1,e', [0xcb, 0xcb]],
        ['set 1,h', [0xcb, 0xcc]],
        ['set 1,l', [0xcb, 0xcd]],
        ['set 1,(hl)', [0xcb, 0xce]],
        ['set 1,a', [0xcb, 0xcf]],

        ['set 2,b', [0xcb, 0xd0]],
        ['set 2,c', [0xcb, 0xd1]],
        ['set 2,d', [0xcb, 0xd2]],
        ['set 2,e', [0xcb, 0xd3]],
        ['set 2,h', [0xcb, 0xd4]],
        ['set 2,l', [0xcb, 0xd5]],
        ['set 2,(hl)', [0xcb, 0xd6]],
        ['set 2,a', [0xcb, 0xd7]],

        ['set 3,b', [0xcb, 0xd8]],
        ['set 3,c', [0xcb, 0xd9]],
        ['set 3,d', [0xcb, 0xda]],
        ['set 3,e', [0xcb, 0xdb]],
        ['set 3,h', [0xcb, 0xdc]],
        ['set 3,l', [0xcb, 0xdd]],
        ['set 3,(hl)', [0xcb, 0xde]],
        ['set 3,a', [0xcb, 0xdf]],

        ['set 4,b', [0xcb, 0xe0]],
        ['set 4,c', [0xcb, 0xe1]],
        ['set 4,d', [0xcb, 0xe2]],
        ['set 4,e', [0xcb, 0xe3]],
        ['set 4,h', [0xcb, 0xe4]],
        ['set 4,l', [0xcb, 0xe5]],
        ['set 4,(hl)', [0xcb, 0xe6]],
        ['set 4,a', [0xcb, 0xe7]],

        ['set 5,b', [0xcb, 0xe8]],
        ['set 5,c', [0xcb, 0xe9]],
        ['set 5,d', [0xcb, 0xea]],
        ['set 5,e', [0xcb, 0xeb]],
        ['set 5,h', [0xcb, 0xec]],
        ['set 5,l', [0xcb, 0xed]],
        ['set 5,(hl)', [0xcb, 0xee]],
        ['set 5,a', [0xcb, 0xef]],

        ['set 6,b', [0xcb, 0xf0]],
        ['set 6,c', [0xcb, 0xf1]],
        ['set 6,d', [0xcb, 0xf2]],
        ['set 6,e', [0xcb, 0xf3]],
        ['set 6,h', [0xcb, 0xf4]],
        ['set 6,l', [0xcb, 0xf5]],
        ['set 6,(hl)', [0xcb, 0xf6]],
        ['set 6,a', [0xcb, 0xf7]],

        ['set 7,b', [0xcb, 0xf8]],
        ['set 7,c', [0xcb, 0xf9]],
        ['set 7,d', [0xcb, 0xfa]],
        ['set 7,e', [0xcb, 0xfb]],
        ['set 7,h', [0xcb, 0xfc]],
        ['set 7,l', [0xcb, 0xfd]],
        ['set 7,(hl)', [0xcb, 0xfe]],
        ['set 7,a', [0xcb, 0xff]],

        // ix bit instructions (dd cb)

        ['rlc (ix+$12),b', [0xdd, 0xcb, 0x00, 0x12]],
        ['rlc (ix+$12),c', [0xdd, 0xcb, 0x01, 0x12]],
        ['rlc (ix+$12),d', [0xdd, 0xcb, 0x02, 0x12]],
        ['rlc (ix+$12),e', [0xdd, 0xcb, 0x03, 0x12]],
        ['rlc (ix+$12),h', [0xdd, 0xcb, 0x04, 0x12]],
        ['rlc (ix+$12),l', [0xdd, 0xcb, 0x05, 0x12]],
        ['rlc (ix+$12)', [0xdd, 0xcb, 0x06, 0x12]],
        ['rlc (ix+$12),a', [0xdd, 0xcb, 0x07, 0x12]],

        ['rrc (ix+$12),b', [0xdd, 0xcb, 0x08, 0x12]],
        ['rrc (ix+$12),c', [0xdd, 0xcb, 0x09, 0x12]],
        ['rrc (ix+$12),d', [0xdd, 0xcb, 0x0a, 0x12]],
        ['rrc (ix+$12),e', [0xdd, 0xcb, 0x0b, 0x12]],
        ['rrc (ix+$12),h', [0xdd, 0xcb, 0x0c, 0x12]],
        ['rrc (ix+$12),l', [0xdd, 0xcb, 0x0d, 0x12]],
        ['rrc (ix+$12)', [0xdd, 0xcb, 0x0e, 0x12]],
        ['rrc (ix+$12),a', [0xdd, 0xcb, 0x0f, 0x12]],

        ['rl (ix+$12),b', [0xdd, 0xcb, 0x10, 0x12]],
        ['rl (ix+$12),c', [0xdd, 0xcb, 0x11, 0x12]],
        ['rl (ix+$12),d', [0xdd, 0xcb, 0x12, 0x12]],
        ['rl (ix+$12),e', [0xdd, 0xcb, 0x13, 0x12]],
        ['rl (ix+$12),h', [0xdd, 0xcb, 0x14, 0x12]],
        ['rl (ix+$12),l', [0xdd, 0xcb, 0x15, 0x12]],
        ['rl (ix+$12)', [0xdd, 0xcb, 0x16, 0x12]],
        ['rl (ix+$12),a', [0xdd, 0xcb, 0x17, 0x12]],

        ['rr (ix+$12),b', [0xdd, 0xcb, 0x18, 0x12]],
        ['rr (ix+$12),c', [0xdd, 0xcb, 0x19, 0x12]],
        ['rr (ix+$12),d', [0xdd, 0xcb, 0x1a, 0x12]],
        ['rr (ix+$12),e', [0xdd, 0xcb, 0x1b, 0x12]],
        ['rr (ix+$12),h', [0xdd, 0xcb, 0x1c, 0x12]],
        ['rr (ix+$12),l', [0xdd, 0xcb, 0x1d, 0x12]],
        ['rr (ix+$12)', [0xdd, 0xcb, 0x1e, 0x12]],
        ['rr (ix+$12),a', [0xdd, 0xcb, 0x1f, 0x12]],

        ['sla (ix+$12),b', [0xdd, 0xcb, 0x20, 0x12]],
        ['sla (ix+$12),c', [0xdd, 0xcb, 0x21, 0x12]],
        ['sla (ix+$12),d', [0xdd, 0xcb, 0x22, 0x12]],
        ['sla (ix+$12),e', [0xdd, 0xcb, 0x23, 0x12]],
        ['sla (ix+$12),h', [0xdd, 0xcb, 0x24, 0x12]],
        ['sla (ix+$12),l', [0xdd, 0xcb, 0x25, 0x12]],
        ['sla (ix+$12)', [0xdd, 0xcb, 0x26, 0x12]],
        ['sla (ix+$12),a', [0xdd, 0xcb, 0x27, 0x12]],

        ['sra (ix+$12),b', [0xdd, 0xcb, 0x28, 0x12]],
        ['sra (ix+$12),c', [0xdd, 0xcb, 0x29, 0x12]],
        ['sra (ix+$12),d', [0xdd, 0xcb, 0x2a, 0x12]],
        ['sra (ix+$12),e', [0xdd, 0xcb, 0x2b, 0x12]],
        ['sra (ix+$12),h', [0xdd, 0xcb, 0x2c, 0x12]],
        ['sra (ix+$12),l', [0xdd, 0xcb, 0x2d, 0x12]],
        ['sra (ix+$12)', [0xdd, 0xcb, 0x2e, 0x12]],
        ['sra (ix+$12),a', [0xdd, 0xcb, 0x2f, 0x12]],

        ['sll (ix+$12),b', [0xdd, 0xcb, 0x30, 0x12]],
        ['sll (ix+$12),c', [0xdd, 0xcb, 0x31, 0x12]],
        ['sll (ix+$12),d', [0xdd, 0xcb, 0x32, 0x12]],
        ['sll (ix+$12),e', [0xdd, 0xcb, 0x33, 0x12]],
        ['sll (ix+$12),h', [0xdd, 0xcb, 0x34, 0x12]],
        ['sll (ix+$12),l', [0xdd, 0xcb, 0x35, 0x12]],
        ['sll (ix+$12)', [0xdd, 0xcb, 0x36, 0x12]],
        ['sll (ix+$12),a', [0xdd, 0xcb, 0x37, 0x12]],

        ['srl (ix+$12),b', [0xdd, 0xcb, 0x38, 0x12]],
        ['srl (ix+$12),c', [0xdd, 0xcb, 0x39, 0x12]],
        ['srl (ix+$12),d', [0xdd, 0xcb, 0x3a, 0x12]],
        ['srl (ix+$12),e', [0xdd, 0xcb, 0x3b, 0x12]],
        ['srl (ix+$12),h', [0xdd, 0xcb, 0x3c, 0x12]],
        ['srl (ix+$12),l', [0xdd, 0xcb, 0x3d, 0x12]],
        ['srl (ix+$12)', [0xdd, 0xcb, 0x3e, 0x12]],
        ['srl (ix+$12),a', [0xdd, 0xcb, 0x3f, 0x12]],

        ['bit 0,(ix+$12)', [0xdd, 0xcb, 0x46, 0x12]],
        ['bit 1,(ix+$12)', [0xdd, 0xcb, 0x4e, 0x12]],
        ['bit 2,(ix+$12)', [0xdd, 0xcb, 0x56, 0x12]],
        ['bit 3,(ix+$12)', [0xdd, 0xcb, 0x5e, 0x12]],
        ['bit 4,(ix+$12)', [0xdd, 0xcb, 0x66, 0x12]],
        ['bit 5,(ix+$12)', [0xdd, 0xcb, 0x6e, 0x12]],
        ['bit 6,(ix+$12)', [0xdd, 0xcb, 0x76, 0x12]],
        ['bit 7,(ix+$12)', [0xdd, 0xcb, 0x7e, 0x12]],

        ['res 0,(ix+$12)', [0xdd, 0xcb, 0x86, 0x12]],
        ['res 1,(ix+$12)', [0xdd, 0xcb, 0x8e, 0x12]],
        ['res 2,(ix+$12)', [0xdd, 0xcb, 0x96, 0x12]],
        ['res 3,(ix+$12)', [0xdd, 0xcb, 0x9e, 0x12]],
        ['res 4,(ix+$12)', [0xdd, 0xcb, 0xa6, 0x12]],
        ['res 5,(ix+$12)', [0xdd, 0xcb, 0xae, 0x12]],
        ['res 6,(ix+$12)', [0xdd, 0xcb, 0xb6, 0x12]],
        ['res 7,(ix+$12)', [0xdd, 0xcb, 0xbe, 0x12]],

        ['set 0,(ix+$12)', [0xdd, 0xcb, 0xc6, 0x12]],
        ['set 1,(ix+$12)', [0xdd, 0xcb, 0xce, 0x12]],
        ['set 2,(ix+$12)', [0xdd, 0xcb, 0xd6, 0x12]],
        ['set 3,(ix+$12)', [0xdd, 0xcb, 0xde, 0x12]],
        ['set 4,(ix+$12)', [0xdd, 0xcb, 0xe6, 0x12]],
        ['set 5,(ix+$12)', [0xdd, 0xcb, 0xee, 0x12]],
        ['set 6,(ix+$12)', [0xdd, 0xcb, 0xf6, 0x12]],
        ['set 7,(ix+$12)', [0xdd, 0xcb, 0xfe, 0x12]],

        // iy bit instructions (fd cb)

        ['rlc (iy+$12),b', [0xfd, 0xcb, 0x00, 0x12]],
        ['rlc (iy+$12),c', [0xfd, 0xcb, 0x01, 0x12]],
        ['rlc (iy+$12),d', [0xfd, 0xcb, 0x02, 0x12]],
        ['rlc (iy+$12),e', [0xfd, 0xcb, 0x03, 0x12]],
        ['rlc (iy+$12),h', [0xfd, 0xcb, 0x04, 0x12]],
        ['rlc (iy+$12),l', [0xfd, 0xcb, 0x05, 0x12]],
        ['rlc (iy+$12)', [0xfd, 0xcb, 0x06, 0x12]],
        ['rlc (iy+$12),a', [0xfd, 0xcb, 0x07, 0x12]],

        ['rrc (iy+$12),b', [0xfd, 0xcb, 0x08, 0x12]],
        ['rrc (iy+$12),c', [0xfd, 0xcb, 0x09, 0x12]],
        ['rrc (iy+$12),d', [0xfd, 0xcb, 0x0a, 0x12]],
        ['rrc (iy+$12),e', [0xfd, 0xcb, 0x0b, 0x12]],
        ['rrc (iy+$12),h', [0xfd, 0xcb, 0x0c, 0x12]],
        ['rrc (iy+$12),l', [0xfd, 0xcb, 0x0d, 0x12]],
        ['rrc (iy+$12)', [0xfd, 0xcb, 0x0e, 0x12]],
        ['rrc (iy+$12),a', [0xfd, 0xcb, 0x0f, 0x12]],

        ['rl (iy+$12),b', [0xfd, 0xcb, 0x10, 0x12]],
        ['rl (iy+$12),c', [0xfd, 0xcb, 0x11, 0x12]],
        ['rl (iy+$12),d', [0xfd, 0xcb, 0x12, 0x12]],
        ['rl (iy+$12),e', [0xfd, 0xcb, 0x13, 0x12]],
        ['rl (iy+$12),h', [0xfd, 0xcb, 0x14, 0x12]],
        ['rl (iy+$12),l', [0xfd, 0xcb, 0x15, 0x12]],
        ['rl (iy+$12)', [0xfd, 0xcb, 0x16, 0x12]],
        ['rl (iy+$12),a', [0xfd, 0xcb, 0x17, 0x12]],

        ['rr (iy+$12),b', [0xfd, 0xcb, 0x18, 0x12]],
        ['rr (iy+$12),c', [0xfd, 0xcb, 0x19, 0x12]],
        ['rr (iy+$12),d', [0xfd, 0xcb, 0x1a, 0x12]],
        ['rr (iy+$12),e', [0xfd, 0xcb, 0x1b, 0x12]],
        ['rr (iy+$12),h', [0xfd, 0xcb, 0x1c, 0x12]],
        ['rr (iy+$12),l', [0xfd, 0xcb, 0x1d, 0x12]],
        ['rr (iy+$12)', [0xfd, 0xcb, 0x1e, 0x12]],
        ['rr (iy+$12),a', [0xfd, 0xcb, 0x1f, 0x12]],

        ['sla (iy+$12),b', [0xfd, 0xcb, 0x20, 0x12]],
        ['sla (iy+$12),c', [0xfd, 0xcb, 0x21, 0x12]],
        ['sla (iy+$12),d', [0xfd, 0xcb, 0x22, 0x12]],
        ['sla (iy+$12),e', [0xfd, 0xcb, 0x23, 0x12]],
        ['sla (iy+$12),h', [0xfd, 0xcb, 0x24, 0x12]],
        ['sla (iy+$12),l', [0xfd, 0xcb, 0x25, 0x12]],
        ['sla (iy+$12)', [0xfd, 0xcb, 0x26, 0x12]],
        ['sla (iy+$12),a', [0xfd, 0xcb, 0x27, 0x12]],

        ['sra (iy+$12),b', [0xfd, 0xcb, 0x28, 0x12]],
        ['sra (iy+$12),c', [0xfd, 0xcb, 0x29, 0x12]],
        ['sra (iy+$12),d', [0xfd, 0xcb, 0x2a, 0x12]],
        ['sra (iy+$12),e', [0xfd, 0xcb, 0x2b, 0x12]],
        ['sra (iy+$12),h', [0xfd, 0xcb, 0x2c, 0x12]],
        ['sra (iy+$12),l', [0xfd, 0xcb, 0x2d, 0x12]],
        ['sra (iy+$12)', [0xfd, 0xcb, 0x2e, 0x12]],
        ['sra (iy+$12),a', [0xfd, 0xcb, 0x2f, 0x12]],

        ['sll (iy+$12),b', [0xfd, 0xcb, 0x30, 0x12]],
        ['sll (iy+$12),c', [0xfd, 0xcb, 0x31, 0x12]],
        ['sll (iy+$12),d', [0xfd, 0xcb, 0x32, 0x12]],
        ['sll (iy+$12),e', [0xfd, 0xcb, 0x33, 0x12]],
        ['sll (iy+$12),h', [0xfd, 0xcb, 0x34, 0x12]],
        ['sll (iy+$12),l', [0xfd, 0xcb, 0x35, 0x12]],
        ['sll (iy+$12)', [0xfd, 0xcb, 0x36, 0x12]],
        ['sll (iy+$12),a', [0xfd, 0xcb, 0x37, 0x12]],

        ['srl (iy+$12),b', [0xfd, 0xcb, 0x38, 0x12]],
        ['srl (iy+$12),c', [0xfd, 0xcb, 0x39, 0x12]],
        ['srl (iy+$12),d', [0xfd, 0xcb, 0x3a, 0x12]],
        ['srl (iy+$12),e', [0xfd, 0xcb, 0x3b, 0x12]],
        ['srl (iy+$12),h', [0xfd, 0xcb, 0x3c, 0x12]],
        ['srl (iy+$12),l', [0xfd, 0xcb, 0x3d, 0x12]],
        ['srl (iy+$12)', [0xfd, 0xcb, 0x3e, 0x12]],
        ['srl (iy+$12),a', [0xfd, 0xcb, 0x3f, 0x12]],

        ['bit 0,(iy+$12)', [0xfd, 0xcb, 0x46, 0x12]],
        ['bit 1,(iy+$12)', [0xfd, 0xcb, 0x4e, 0x12]],
        ['bit 2,(iy+$12)', [0xfd, 0xcb, 0x56, 0x12]],
        ['bit 3,(iy+$12)', [0xfd, 0xcb, 0x5e, 0x12]],
        ['bit 4,(iy+$12)', [0xfd, 0xcb, 0x66, 0x12]],
        ['bit 5,(iy+$12)', [0xfd, 0xcb, 0x6e, 0x12]],
        ['bit 6,(iy+$12)', [0xfd, 0xcb, 0x76, 0x12]],
        ['bit 7,(iy+$12)', [0xfd, 0xcb, 0x7e, 0x12]],

        ['res 0,(iy+$12)', [0xfd, 0xcb, 0x86, 0x12]],
        ['res 1,(iy+$12)', [0xfd, 0xcb, 0x8e, 0x12]],
        ['res 2,(iy+$12)', [0xfd, 0xcb, 0x96, 0x12]],
        ['res 3,(iy+$12)', [0xfd, 0xcb, 0x9e, 0x12]],
        ['res 4,(iy+$12)', [0xfd, 0xcb, 0xa6, 0x12]],
        ['res 5,(iy+$12)', [0xfd, 0xcb, 0xae, 0x12]],
        ['res 6,(iy+$12)', [0xfd, 0xcb, 0xb6, 0x12]],
        ['res 7,(iy+$12)', [0xfd, 0xcb, 0xbe, 0x12]],

        ['set 0,(iy+$12)', [0xfd, 0xcb, 0xc6, 0x12]],
        ['set 1,(iy+$12)', [0xfd, 0xcb, 0xce, 0x12]],
        ['set 2,(iy+$12)', [0xfd, 0xcb, 0xd6, 0x12]],
        ['set 3,(iy+$12)', [0xfd, 0xcb, 0xde, 0x12]],
        ['set 4,(iy+$12)', [0xfd, 0xcb, 0xe6, 0x12]],
        ['set 5,(iy+$12)', [0xfd, 0xcb, 0xee, 0x12]],
        ['set 6,(iy+$12)', [0xfd, 0xcb, 0xf6, 0x12]],
        ['set 7,(iy+$12)', [0xfd, 0xcb, 0xfe, 0x12]],

        // ix instructions

        ['add ix,bc', [0xdd, 0x09]],
        ['add ix,de', [0xdd, 0x19]],
        ['ld ix,$1234', [0xdd, 0x21, 0x34, 0x12]],
        ['ld ($1234),ix', [0xdd, 0x22, 0x34, 0x12]],
        ['inc ix', [0xdd, 0x23]],
        ['inc ixh', [0xdd, 0x24]],
        ['dec ixh', [0xdd, 0x25]],
        ['ld ixh,$12', [0xdd, 0x26, 0x12]],
        ['ld ix,ix', [0xdd, 0x29]],
        ['ld ix,($1234)', [0xdd, 0x2a, 0x34, 0x12]],
        ['dec ix', [0xdd, 0x2b]],
        ['inc ixl', [0xdd, 0x2c]],
        ['dec ixl', [0xdd, 0x2d]],
        ['ld ixl,$12', [0xdd, 0x2e, 0x12]],
        ['inc (ix+$12)', [0xdd, 0x34, 0x12]],
        ['dec (ix+$12)', [0xdd, 0x35, 0x12]],
        ['ld (ix+$12),$34', [0xdd, 0x36, 0x12, 0x34]],
        ['add ix,sp', [0xdd, 0x39]],

        ['ld b,ixh', [0xdd, 0x44]],
        ['ld b,ixl', [0xdd, 0x45]],
        ['ld b,(ix+$12)', [0xdd, 0x46, 0x12]],
        ['ld c,ixh', [0xdd, 0x4c]],
        ['ld c,ixl', [0xdd, 0x4d]],
        ['ld c,(ix+$12)', [0xdd, 0x4e, 0x12]],
        ['ld d,ixh', [0xdd, 0x54]],
        ['ld d,ixl', [0xdd, 0x55]],
        ['ld d,(ix+$12)', [0xdd, 0x56, 0x12]],
        ['ld e,ixh', [0xdd, 0x5c]],
        ['ld e,ixl', [0xdd, 0x5d]],
        ['ld e,(ix+$12)', [0xdd, 0x5e, 0x12]],

        ['ld ixh,b', [0xdd, 0x60]],
        ['ld ixh,c', [0xdd, 0x61]],
        ['ld ixh,d', [0xdd, 0x62]],
        ['ld ixh,e', [0xdd, 0x63]],
        ['ld ixh,h', [0xdd, 0x64]],
        ['ld ixh,l', [0xdd, 0x65]],
        ['ld h,(ix+$12)', [0xdd, 0x66, 0x12]],
        ['ld ixh,a', [0xdd, 0x67]],

        ['ld ixl,b', [0xdd, 0x68]],
        ['ld ixl,c', [0xdd, 0x69]],
        ['ld ixl,d', [0xdd, 0x6a]],
        ['ld ixl,e', [0xdd, 0x6b]],
        ['ld ixl,h', [0xdd, 0x6c]],
        ['ld ixl,l', [0xdd, 0x6d]],
        ['ld l,(ix+$12)', [0xdd, 0x6e, 0x12]],
        ['ld ixl,a', [0xdd, 0x6f]],

        ['ld (ix+$12),b', [0xdd, 0x70, 0x12]],
        ['ld (ix+$12),c', [0xdd, 0x71, 0x12]],
        ['ld (ix+$12),d', [0xdd, 0x72, 0x12]],
        ['ld (ix+$12),e', [0xdd, 0x73, 0x12]],
        ['ld (ix+$12),h', [0xdd, 0x74, 0x12]],
        ['ld (ix+$12),l', [0xdd, 0x75, 0x12]],
        ['ld (ix+$12),a', [0xdd, 0x77, 0x12]],
        ['ld a,ixh', [0xdd, 0x7c]],
        ['ld a,ixl', [0xdd, 0x7d]],
        ['ld a,(ix+$12)', [0xdd, 0x7e, 0x12]],

        ['add a,ixh', [0xdd, 0x84]],
        ['add a,ixl', [0xdd, 0x85]],
        ['add a,(ix+$12)', [0xdd, 0x86, 0x12]],
        ['adc a,ixh', [0xdd, 0x8c]],
        ['adc a,ixl', [0xdd, 0x8d]],
        ['adc a,(ix+$12)', [0xdd, 0x8e, 0x12]],
        ['sub a,ixh', [0xdd, 0x94]],
        ['sub a,ixl', [0xdd, 0x95]],
        ['sub a,(ix+$12)', [0xdd, 0x96, 0x12]],
        ['sbc a,ixh', [0xdd, 0x9c]],
        ['sbc a,ixl', [0xdd, 0x9d]],
        ['sbc a,(ix+$12)', [0xdd, 0x9e, 0x12]],
        ['and a,ixh', [0xdd, 0xa4]],
        ['and a,ixl', [0xdd, 0xa5]],
        ['and a,(ix+$12)', [0xdd, 0xa6, 0x12]],
        ['xor a,ixh', [0xdd, 0xac]],
        ['xor a,ixl', [0xdd, 0xad]],
        ['xor a,(ix+$12)', [0xdd, 0xae, 0x12]],
        ['or a,ixh', [0xdd, 0xb4]],
        ['or a,ixl', [0xdd, 0xb5]],
        ['or a,(ix+$12)', [0xdd, 0xb6, 0x12]],
        ['cp a,ixh', [0xdd, 0xbc]],
        ['cp a,ixl', [0xdd, 0xbd]],
        ['cp a,(ix+$12)', [0xdd, 0xbe, 0x12]],

        ['pop ix', [0xdd, 0xe1]],
        ['ex (sp),ix', [0xdd, 0xe3]],
        ['push ix', [0xdd, 0xe5]],
        ['jp (ix)', [0xdd, 0xe9]],
        ['ld sp,ix', [0xdd, 0xf9]],

        // iy instructions

        ['add iy,bc', [0xfd, 0x09]],
        ['add iy,de', [0xfd, 0x19]],
        ['ld iy,$1234', [0xfd, 0x21, 0x34, 0x12]],
        ['ld ($1234),iy', [0xfd, 0x22, 0x34, 0x12]],
        ['inc iy', [0xfd, 0x23]],
        ['inc iyh', [0xfd, 0x24]],
        ['dec iyh', [0xfd, 0x25]],
        ['ld iyh,$12', [0xfd, 0x26, 0x12]],
        ['ld iy,iy', [0xfd, 0x29]],
        ['ld iy,($1234)', [0xfd, 0x2a, 0x34, 0x12]],
        ['dec iy', [0xfd, 0x2b]],
        ['inc iyl', [0xfd, 0x2c]],
        ['dec iyl', [0xfd, 0x2d]],
        ['ld iyl,$12', [0xfd, 0x2e, 0x12]],
        ['inc (iy+$12)', [0xfd, 0x34, 0x12]],
        ['dec (iy+$12)', [0xfd, 0x35, 0x12]],
        ['ld (iy+$12),$34', [0xfd, 0x36, 0x12, 0x34]],
        ['add iy,sp', [0xfd, 0x39]],

        ['ld b,iyh', [0xfd, 0x44]],
        ['ld b,iyl', [0xfd, 0x45]],
        ['ld b,(iy+$12)', [0xfd, 0x46, 0x12]],
        ['ld c,iyh', [0xfd, 0x4c]],
        ['ld c,iyl', [0xfd, 0x4d]],
        ['ld c,(iy+$12)', [0xfd, 0x4e, 0x12]],
        ['ld d,iyh', [0xfd, 0x54]],
        ['ld d,iyl', [0xfd, 0x55]],
        ['ld d,(iy+$12)', [0xfd, 0x56, 0x12]],
        ['ld e,iyh', [0xfd, 0x5c]],
        ['ld e,iyl', [0xfd, 0x5d]],
        ['ld e,(iy+$12)', [0xfd, 0x5e, 0x12]],

        ['ld iyh,b', [0xfd, 0x60]],
        ['ld iyh,c', [0xfd, 0x61]],
        ['ld iyh,d', [0xfd, 0x62]],
        ['ld iyh,e', [0xfd, 0x63]],
        ['ld iyh,h', [0xfd, 0x64]],
        ['ld iyh,l', [0xfd, 0x65]],
        ['ld h,(iy+$12)', [0xfd, 0x66, 0x12]],
        ['ld iyh,a', [0xfd, 0x67]],

        ['ld iyl,b', [0xfd, 0x68]],
        ['ld iyl,c', [0xfd, 0x69]],
        ['ld iyl,d', [0xfd, 0x6a]],
        ['ld iyl,e', [0xfd, 0x6b]],
        ['ld iyl,h', [0xfd, 0x6c]],
        ['ld iyl,l', [0xfd, 0x6d]],
        ['ld l,(iy+$12)', [0xfd, 0x6e, 0x12]],
        ['ld iyl,a', [0xfd, 0x6f]],

        ['ld (iy+$12),b', [0xfd, 0x70, 0x12]],
        ['ld (iy+$12),c', [0xfd, 0x71, 0x12]],
        ['ld (iy+$12),d', [0xfd, 0x72, 0x12]],
        ['ld (iy+$12),e', [0xfd, 0x73, 0x12]],
        ['ld (iy+$12),h', [0xfd, 0x74, 0x12]],
        ['ld (iy+$12),l', [0xfd, 0x75, 0x12]],
        ['ld (iy+$12),a', [0xfd, 0x77, 0x12]],
        ['ld a,iyh', [0xfd, 0x7c]],
        ['ld a,iyl', [0xfd, 0x7d]],
        ['ld a,(iy+$12)', [0xfd, 0x7e, 0x12]],

        ['add a,iyh', [0xfd, 0x84]],
        ['add a,iyl', [0xfd, 0x85]],
        ['add a,(iy+$12)', [0xfd, 0x86, 0x12]],
        ['adc a,iyh', [0xfd, 0x8c]],
        ['adc a,iyl', [0xfd, 0x8d]],
        ['adc a,(iy+$12)', [0xfd, 0x8e, 0x12]],
        ['sub a,iyh', [0xfd, 0x94]],
        ['sub a,iyl', [0xfd, 0x95]],
        ['sub a,(iy+$12)', [0xfd, 0x96, 0x12]],
        ['sbc a,iyh', [0xfd, 0x9c]],
        ['sbc a,iyl', [0xfd, 0x9d]],
        ['sbc a,(iy+$12)', [0xfd, 0x9e, 0x12]],
        ['and a,iyh', [0xfd, 0xa4]],
        ['and a,iyl', [0xfd, 0xa5]],
        ['and a,(iy+$12)', [0xfd, 0xa6, 0x12]],
        ['xor a,iyh', [0xfd, 0xac]],
        ['xor a,iyl', [0xfd, 0xad]],
        ['xor a,(iy+$12)', [0xfd, 0xae, 0x12]],
        ['or a,iyh', [0xfd, 0xb4]],
        ['or a,iyl', [0xfd, 0xb5]],
        ['or a,(iy+$12)', [0xfd, 0xb6, 0x12]],
        ['cp a,iyh', [0xfd, 0xbc]],
        ['cp a,iyl', [0xfd, 0xbd]],
        ['cp a,(iy+$12)', [0xfd, 0xbe, 0x12]],

        ['pop iy', [0xfd, 0xe1]],
        ['ex (sp),iy', [0xfd, 0xe3]],
        ['push iy', [0xfd, 0xe5]],
        ['jp (iy)', [0xfd, 0xe9]],
        ['ld sp,iy', [0xfd, 0xf9]],
    ];
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
        expect(result[0].bytes).toEqual([{expression: 'thing',vars:['thing']}]);
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
    it('should parse macrocall', function() {
        const result = parse('thing');
        expect(result[0]).toEqual({
            macrocall: 'thing',
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse macrocall with args', function() {
        const result = parse('thing 1, 2,3');
        expect(result[0]).toEqual({
            macrocall: 'thing',
            args: [1,2,3],
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse macrocall with args', function() {
        const result = parse('thing 1, a, "hello"');
        expect(result[0]).toEqual({
            macrocall: 'thing',
            args: [1,{expression:'a', vars: ['a']},'hello'],
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse macrodef', function() {
        const result = parse('macro thing');
        expect(result[0]).toEqual({
            macrodef: 'thing',
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse macrodef with params', function() {
        const result = parse('macro thing a, b, c');
        expect(result[0]).toEqual({
            macrodef: 'thing',
            params: ['a', 'b', 'c'],
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse defs', function() {
        const result = parse('defs 123');
        expect(result[0]).toEqual({
            defs: 123,
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse ds', function() {
        const result = parse('ds 123');
        expect(result[0]).toEqual({
            defs: 123,
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse ds with expression', function() {
        const result = parse('ds a + 2');
        expect(result[0]).toEqual({
            defs: {
                expression: 'a + 2',
                vars: ['a']
            },
            location: {
                line: 1, column: 1
            }
        });
    });
    it('should parse db string * num', function() {
        const result = parse('db "hello" * 3');
        expect(result.length).toBe(1);
        expect(result[0].bytes).toEqual([
            104, 101, 108, 108, 111,
            104, 101, 108, 108, 111,
            104, 101, 108, 108, 111,
        ]);
    });
});