import * as fs from 'fs';
import * as path from 'path';
import * as parser from './parser';
// import * as Tracer from 'pegjs-backtrace';
import * as Expr from './expr';

const BYTELEN = 8;

export function compile(filename, options) {
    const parserOptions = {source: 0} as any;
    // const tracer = new Tracer(code, {
    //     showTrace: true,
    //     showFullPath: true
    // });
    // if (options.trace) {
    //     parserOptions.tracer = tracer;
    // }
    try {
        const prog = new Programme();
        prog.parse(filename);
        prog.processIncludes();
        prog.getMacros();
        prog.expandMacros();
        prog.getSymbols();
        prog.assignPCandEQU();
        prog.evaluateSymbols();
        prog.checkSymbols();
        prog.updateBytes();
        return prog;
    } catch (e) {
        // if (options.trace) {
        //     // console.log(tracer.getBacktraceString());
        // } else {
            throw e;
        // }
    }
}

export class Programme {
    public ast;
    public symbols = {};
    public sources = [];
    public dir: string;
    public macros = {};

    public parse(filename) {
        this.dir = path.dirname(filename);
        const code = fs.readFileSync(filename).toString();
        this.sources.push({
            name: filename,
            source: code.split('\n')
        })

        this.ast = parser.parse(code, {source: 0});        
    }

    private iterateAst(func, ignoreIf = false) {
        let inMacro = false;
        const prefixes = [];
        const ifStack = [true];
        for (let i = 0; i < this.ast.length; i++) {
            const el = this.ast[i];
            if (el.prefix) {
                prefixes.push(el.prefix);
            }
            if (el.endmacro || el.endblock) {
                prefixes.pop();
            }

            if (el.macrodef) {
                inMacro = true;
            } else if (el.endmacro) {
                inMacro = false;
            }

            if (el.if !== undefined) {
                if (el.if.expression) {
                    el.if = this.evaluateExpression(prefixes[prefixes.length - 1], el.if);
                }
                ifStack.push(el.if !== 0);
            }
            if (el.else) {
                ifStack.push(!ifStack.pop());
            }
            if (el.endif) {
                ifStack.pop();
            }

            if (ignoreIf || ifStack[ifStack.length - 1]) {
                func(el, i, prefixes[prefixes.length - 1] || '', inMacro, ifStack[ifStack.length - 1]);
            }
        }    
    }

    public processIncludes() {
        const dirs = [];
        const sourceIndices = [];
        let sourceIndex = 0;

        let dir = this.dir;
        this.iterateAst((el, i, prefix, inMacro) => {
            if (el.include && !el.included) {
                const filename = path.join(dir, el.include);
                dir = path.dirname(filename);
                dirs.push(dir);
                if (!fs.existsSync(filename)) {
                    this.error("File does not exist", el.location);
                }
                const source = fs.readFileSync(filename).toString();
                this.sources.push({
                    name: filename,
                    source: source.split('\n')
                });
                sourceIndices.push(sourceIndex);
                sourceIndex = this.sources.length - 1;
                const includeAst = parser.parse(source, {source: sourceIndex});
                if (includeAst !== null) {
                    this.ast.splice(i + 1, 0, ...includeAst);
                    this.ast.splice(i + 1 + includeAst.length, 0, {
                        endinclude: sourceIndex,
                        location: {
                            line: includeAst.length + 1,
                            column: 0,
                            source: sourceIndex
                        }
                    });
                } else {
                    this.ast.splice(i + 1, 0, {
                        endinclude: sourceIndex,
                        location: {
                            line: 0,
                            column: 0,
                            source: sourceIndex
                        }
                    });
                }
                el.included = true;
            } else if (el.endinclude !== undefined) {
                dir = dirs.pop();
                sourceIndex = sourceIndices.pop();
            }
        });
    }

    public getMacros() {
        let macro = undefined;
        let macroName = undefined;
        let macroLocation = undefined;
        this.iterateAst((el, i, prefix, inMacro) => {
            if (el.macrodef) {
                if (macro) {
                    this.error("Cannot nest macros", el.location);
                }
                macroLocation = el.location;
                macroName = el.macrodef;
                macro = {
                    ast: [],
                    params: el.params || []
                };
                if (this.macros[macroName]) {
                    this.error(`Already defined macro '${macroName}'`, el.location);
                }
            } else if (el.endmacro) {
                if (!macro) {
                    this.error("Not in a macro", el.location);
                }
                this.macros[macroName] = macro;
                macro = undefined;
                macroName = undefined;
            }
            if (macro && !el.macrodef && !el.endmacro) {
                macro.ast.push(el);
            }
        });
        if (macro) {
            this.error(`Macro '${macroName}' doesn't finish`, macroLocation);
        }
        return this.macros;
    }

    /**
     * Gets a map of symbols, and updates the parsed objects
     * so the block and endblock objects have prefixes
     */
    public getSymbols() {
        let nextBlock = 0;
        let blocks = [];
        this.iterateAst((el, i, prefix, inMacro) => {
            if (el.label && !inMacro) {
                if (blocks.length > 0 && !el.public) {
                    if (typeof this.symbols[labelName(blocks, el.label)] !== 'undefined') {
                        this.error(`Label '${el.label}' already defined at in this block`, el.location);
                    }
                    this.symbols[labelName(blocks, el.label)] = null;
                    el.label = labelName(blocks, el.label);
                } else {
                    if (typeof this.symbols[el.label] !== 'undefined') {
                        this.error(`Label '${el.label}' already defined`, el.location);
                    }
                    this.symbols[el.label] = null;
                }
            } else if (el.block) {
                blocks.push(nextBlock);
                el.prefix = labelPrefix(blocks);
                nextBlock++;
            } else if (el.endblock || el.endmacrocall) {
                blocks.pop();
            } else if (el.macrocall) {
                blocks.push(nextBlock);
                el.prefix = labelPrefix(blocks);
                nextBlock++;
                for (let j = 0; j < el.params.length; j++) {
                    const param = el.params[j];
                    if (blocks.length > 0) {
                        this.symbols[labelName(blocks, param)] = el.args[j];
                        el.params[j] = labelName(blocks, param);
                    } else {
                        this.symbols[param] = null;
                    }
                }
            } else if (el.equ) {
                if (i > 0 && this.ast[i - 1].label) {
                    let ii = i - 1;
                    while (this.ast[ii] && this.ast[ii].label) {
                        this.symbols[this.ast[ii].label] = el.equ;
                        ii--;
                    }
                } else {
                    this.error("EQU has no label", el.location);
                }
            }
        });
        if (blocks.length !== 0) {
            throw "Mismatch between .block and .endblock statements";
        }
        return this.symbols;
    }

    private error(message, location): never {
        throw {
            message: message,
            location: location,
            source: this.sources[location.source].source[location.line - 1],
            filename: this.sources[location.source].name
        };
    }

    public expandMacros() {
        this.iterateAst((el, i, prefix, inMacro) => {
            if (el.macrocall) {
                const macro = this.macros[el.macrocall];
                if (!macro) {
                    this.error(`Unknown instruction/macro '${el.macrocall}'`, el.location);
                }
                el.params = JSON.parse(JSON.stringify(macro.params));
                el.expanded = true;
                this.ast.splice(i + 1, 0, ...(JSON.parse(JSON.stringify(macro.ast))));
                this.ast.splice(i + 1 + macro.ast.length, 0, { endmacrocall: true });
                i += macro.ast.length + 1;
            }
        });
    }

    /**
     * Assign correct value to labels, based on PC. Starts at
     * 0, increments by bytes in ast or set by org.
     * Assign correct value to equs, although it does not
     * evaluate expressions, it simply put the expression into
     * the symbol
     */
    public assignPCandEQU() {
        let pc = 0;
        let out = 0;
        this.iterateAst((el, i, prefix, inMacro) => {
            if (inMacro) {
                return;
            }
            if (el.label) {
                if (this.symbols[el.label] === null) {
                    this.symbols[el.label] = pc;
                }
                return;
            } else if (el.equ) {
                if (el.equ.expression) {
                    el.equ.address = pc;
                }
            } else if (el.defs !== undefined) {
                let size = el.defs;
                if (size.expression) {
                    size = this.evaluateExpression(prefix, size);
                }
                el.address = pc;
                el.out = out;
                pc += size;
                out += size;
            } else if (el.org !== undefined) {
                if (el.org.expression) {
                    el.org = this.evaluateExpression(prefix, el.org);
                }
                pc = el.org;
                out = el.org;
            } else if (el.phase !== undefined) {
                if (el.phase.expression) {
                    el.phase = this.evaluateExpression(prefix, el.phase);
                }
                pc = el.phase;
            } else if (el.endphase) {
                pc = out;
            } else if (el.align !== undefined) {
                if (el.align.expression) {
                    el.align = this.evaluateExpression(prefix, el.align);
                }
                let add = el.align - (pc % el.align);
                if (add !== el.align) {
                    pc += add;
                    out += add;
                }
            } else if (el.bytes) {
                el.address = pc;
                el.out = out;
                
                pc += el.bytes.length;
                out += el.bytes.length;
            }
        });
    }

    private evaluateExpression(prefix = '', expr, evaluated = []) {
        const variables = expr.vars;
        const subVars = {}; // substitute variables
        if (expr.address !== undefined) {
            this.symbols['$'] = expr.address;
        }
        for (const variable of variables) {
            const subVar = this.findVariable(prefix, variable);

            if (this.symbols[subVar] === undefined) {
                this.error(`Symbol '${variable}' not found`, expr.location);
            }
            if (this.symbols[subVar].expression) {
                this.evaluateSymbol(subVar, evaluated);
            }
            subVars[variable] = this.symbols[subVar];
        }
        return Expr.parse(expr.expression, {variables: subVars});
    }

    private evaluateSymbol(symbol, evaluated) {
        if (evaluated.indexOf(symbol) !== -1) {
            this.error(`Circular symbol dependency while evaluating '${symbol}'`, this.symbols[symbol].location);
        }
        evaluated.push(symbol);
        const prefix = getWholePrefix(symbol);
        this.symbols[symbol] = this.evaluateExpression(prefix, this.symbols[symbol], evaluated)
    }

    private findVariable(prefix, variable) {
        while (true) {
            const subVar = this.symbols[prefix + variable];
            if (subVar !== undefined) {
                return prefix + variable;
            }
            if (prefix === '') {
                break;
            }
            prefix = getReducedPrefix(prefix);
        }
    }

    public evaluateSymbols() {
        // console.log(`eval symbols ${JSON.stringify(symbols, undefined, 2)}`);
        const evaluated = [];
        for (const symbol in this.symbols) {
            if (this.symbols[symbol].expression) {
                // console.log('evaluate ' + symbol);
                if (evaluated.indexOf(symbol) !== -1) {
                    continue;
                }
                this.evaluateSymbol(symbol, evaluated);
            }
        }
    }

    public checkSymbols() {
        for (const symbol in this.symbols) {
            if (this.symbols[symbol].expression) {
                throw `Symbol '${symbol}' cannot be calculated`;
            }
        }
    }

    public updateBytes() {
        this.iterateAst((el, i, prefix, inMacro) => {
            if (el.references && !inMacro) {
                this.symbols['$'] = el.address;
                for (let i = 0; i < el.bytes.length; i++) {
                    const byte = el.bytes[i];
                    if (byte && byte.expression) {
                        const value = this.evaluateExpression(prefix, byte);

                        if (typeof value === 'string') {
                            let bytes = [];
                            for (let i = 0; i < value.length; i++) {
                                bytes.push(value.charCodeAt(i));
                            }
                            el.bytes.splice(i, 1, ...bytes);
                        } else {
                            el.bytes[i] = value & 0xFF;
                            if (el.bytes[i + 1] === null) {
                                el.bytes[i + 1] = (value & 0xFF00) >> 8;
                            }
                        }
                    }
                }
            }
        });
    }

    public collectAst() {
        const collectedAst = [];
        let line = 0;
        let source = 0;
        let ast: any = {};
        this.iterateAst((el, i, prefix, inMacro, ifTrue) => {
            if (el.location) {
                if ((el.location.line !== line && line !== 0) || (el.location.source !== source)) {
                    collectedAst.push(ast);                
                    ast = {};
                }
                line = el.location.line;
                source = el.location.source;
            }
  
            Object.assign(ast, el);
            ast.inMacro = inMacro;
            ast.ifTrue = ifTrue;
            ast.prefix = prefix;
        }, true);
        if (Object.keys(ast).length !== 0) {
            collectedAst.push(ast);
        }
        return collectedAst;
    }

    public getList() {
        const list = [];
        const ast = this.collectAst();
        for (const el of ast) {
            this.dumpLine(list, 
                this.sources[el.location.source].source, 
                el.location.line, 
                el.out, 
                el.address, 
                el.bytes, 
                el.inMacro, 
                el.ifTrue);
                
            if (el.macrocall) {
                list.push('          ' + ' '.repeat(BYTELEN * 2) + '* UNROLL MACRO')
            }

            if (el.endinclude) {
                list.push(`${pad(el.location.line + 1, 4)}                      * END INCLUDE ${this.sources[el.location.source].name}`);
            }
        }

        list.push('');

        for (const symbol in this.symbols) {
            if (!symbol.startsWith('%')) {
                list.push(`${padr(symbol, 20)} ${pad(this.symbols[symbol].toString(16), 4, '0')}`);
            }
        }

        return list;
    }

    private dumpLine(list, lines, line, out, address, bytes, inMacro, ifTrue) {
        let byteString = '';
        if (bytes) {
            for (const byte of bytes) {
                byteString += pad((byte & 0xFF).toString(16), 2, '0');
            }
        }
        let outString = '    ';
        if (out !== undefined) {
            outString = pad(out.toString(16), 4, '0');
        }
        let addressString = '    ';
        if (address !== undefined) {
            addressString = pad(address.toString(16), 4, '0');
        }
        if (!ifTrue) {
            addressString = 'xxxx';
            outString = 'xxxx';
        }
        list.push(`${pad(line, 4)} ${address !== out?addressString + '@':''}${outString} ${padr(byteString, BYTELEN * 2).substring(0, BYTELEN * 2)} ${inMacro ? '*' : ' '}${lines[line - 1]}`);
        for (let i = BYTELEN * 2; i < byteString.length; i += BYTELEN * 2) {
            list.push(`          ${padr(byteString.substring(i, i + BYTELEN * 2), BYTELEN * 2).substring(0,BYTELEN * 2)}`)
        }
    }

    public getBytes() {
        let bytes = [];
        let startOut = null;
        let out = null;

        this.iterateAst((el, i, prefix, inMacro) => {
            if (el.bytes && !inMacro) {
                const end = bytes.length + startOut;
                if (out === null || el.out === end) {
                    if (startOut === null) {
                        startOut = el.out;
                    }
                    out = el.bytes.length + el.out;
                    bytes = bytes.concat(el.bytes);
                } else if (el.out > end) {
                    for (let i = out; i < el.out; i++) {
                        bytes.push(0);
                    }
                    bytes = bytes.concat(el.bytes);
                    out = el.bytes.length + el.out;
                } else if (el.out < startOut) {
                    this.error("Cannot ORG to earlier address than first ORG", el.location);
                } else if (el.out < end) {
                    for (let i = 0; i < el.bytes.length; i++) {
                        bytes[(el.out - startOut) + i] = el.bytes[i];
                    }
                    out = el.bytes.length + el.out;
                }
            }
        });
        return bytes;
    }
}

function pad(num, size, chr = ' ') {
    let result = '' + num;
    return chr.repeat(Math.max(0, size - result.length)) + result;
}

function padr(num, size, chr = ' ') {
    let result = '' + num;
    return result + chr.repeat(Math.max(0, size - result.length));
}

function labelPrefix(blocks: number[]) {
    let result = '';
    for (let i = 0; i < blocks.length; i++) {
        result = `%${blocks[i]}_${result}`;
    }
    return result;
}

function labelName(blocks: number[], label) {
    return labelPrefix(blocks) + label;
}

export function getReducedPrefix(prefix) {
    const match = /%[0-9]+_(.*)/.exec(prefix);
    if (match) {
        return match[1];
    }
    return '';
}

export function getWholePrefix(symbol) {
    const match = /((%[0-9]+_)+)(.*)/.exec(symbol);
    if (match) {
        return match[1];
    }
    return '';
}

