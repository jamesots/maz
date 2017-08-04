import * as fs from 'fs';
import * as path from 'path';
import * as parser from './parser';
// import * as Tracer from 'pegjs-backtrace';
import * as Expr from './expr';
import * as chalk from 'chalk';
import * as els from './els';

declare function unescape(s: string): string;

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
        const prog = new Programme(options);
        prog.parse(filename);
        prog.processIncludes();
        prog.getMacros();
        prog.expandMacros();
        prog.getSymbols();
        prog.assignPCandEQU();
        prog.evaluateSymbols();
        prog.checkSymbols();
        prog.updateBytes();
        if (options.warnUndocumented) {
            prog.warnUndocumented();
        }
        return prog;
    } catch (e) {
        // if (options.trace) {
        //     // console.log(tracer.getBacktraceString());
        // } else {
            console.log(JSON.stringify(e, undefined, 2));
            throw e;
        // }
    }
}

export class Programme {
    public ast: els.Element[];
    public symbols = {};
    public sources = [];
    public dir: string;
    public macros = {};
    public errors = [];

    constructor(private options) {}

    public parse(filename) {
        const code = this.readSource(filename);
        this.ast = this.parseLines(code, 0);
    }

    private parseLines(lines, sourceIndex) {
        let ast: els.Element[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            try {
                const els = parser.parse(line, {source: sourceIndex, line: i + 1});
                if (els !== null) {
                    ast = ast.concat(els);
                }
            } catch (e) {
                if (e.name === 'SyntaxError') {
                    ast.push({
                        error: e.message,
                        filename: e.filename,
                        location: {
                            line: i + 1,
                            column: e.location.start.column,
                            source: sourceIndex
                        }
                    } as els.Error);
                } else if (e.location) {
                    ast.push({
                        error: e.message,
                        filename: e.filename,
                        location: e.location
                    } as els.Error);
                } else {
                    ast.push({
                        error: e,
                        location: {
                            source: sourceIndex,
                            line: i + 1,
                            column: 0
                        }
                    } as els.Error);
                }
                e.filename = this.sources[sourceIndex].name;
                e.source = this.sources[sourceIndex].source[i]
                this.logError(e);
            }
        }
        return ast;
    }

    private readSource(filename) {
        this.dir = path.dirname(filename);
        const source = fs.readFileSync(filename).toString().split('\n');
        this.sources.push({
            name: filename,
            source: source
        });
        return source;
    }

    private iterateAst(func: (el: els.Element, index: number, prefix: string, inMacro: boolean, ifTrue: boolean, inMacroCall: boolean) => void, ignoreIf = false) {
        let inMacro = false;
        let inMacroCall = false;
        const prefixes = [];
        const ifStack = [true];
        for (let i = 0; i < this.ast.length; i++) {
            const el = this.ast[i];
            if (els.isPrefixed(el)) {
                prefixes.push(el.prefix);
            }
            if (els.isEndMacro(el) || els.isEndBlock(el)) {
                prefixes.pop();
            }

            if (els.isMacroDef(el)) {
                inMacro = true;
            }

            if (!inMacro && els.isMacroCall(el)) {
                inMacroCall = true;
            }

            if (els.isIf(el)) {
                if (els.isExpression(el.if)) {
                    el.if = this.evaluateExpression(prefixes[prefixes.length - 1], el.if);
                }
                ifStack.push(el.if !== 0);
            }
            if (els.isElse(el)) {
                ifStack.push(!ifStack.pop());
            }
            if (els.isEndIf(el)) {
                ifStack.pop();
            }

            if (ignoreIf || ifStack[ifStack.length - 1]) {
                func(el, i, prefixes[prefixes.length - 1] || '', inMacro, ifStack[ifStack.length - 1], inMacroCall);
            }

            if (els.isEndMacro(el)) {
                inMacro = false;
            }
            if (els.isEndMacroCall(el)) {
                inMacroCall = false;
            }
        }    
    }

    public processIncludes() {
        const dirs = [];
        const sourceIndices = [];
        let sourceIndex = 0;

        this.iterateAst((el, i, prefix, inMacro) => {
            if (els.isInclude(el) && !el.included) {
                const filename = path.join(this.dir, el.include);
                if (!fs.existsSync(filename)) {
                    this.error("File does not exist: " + filename, el.location);
                    el.included = true;
                    return;
                }
                const source = this.readSource(filename);
                dirs.push(this.dir);
                sourceIndices.push(sourceIndex);
                sourceIndex = this.sources.length - 1;
                const includeAst = this.parseLines(source, sourceIndex);
                this.ast.splice(i + 1, 0, ...includeAst);
                this.ast.splice(i + 1 + includeAst.length, 0, {
                    endinclude: sourceIndex,
                    location: {
                        line: includeAst.length + 1,
                        column: 0,
                        source: sourceIndex
                    }
                } as els.EndInclude);
                el.included = true;
            } else if (els.isEndInclude(el)) {
                this.dir = dirs.pop();
                sourceIndex = sourceIndices.pop();
            }
        });
    }

    public getMacros() {
        let macro = undefined;
        let macroName = undefined;
        let macroLocation = undefined;
        this.iterateAst((el, i, prefix, inMacro) => {
            if (els.isMacroDef(el)) {
                if (macro) {
                    this.error("Cannot nest macros", el.location);
                    return;
                }
                macroLocation = el.location;
                macroName = el.macrodef;
                macro = {
                    ast: [],
                    params: el.params || []
                };
                if (this.macros[macroName]) {
                    this.error(`Already defined macro '${macroName}'`, el.location);
                    return;
                }
            } else if (els.isEndMacro(el)) {
                if (!macro) {
                    this.error("Not in a macro", el.location);
                    return;
                }
                this.macros[macroName] = macro;
                macro = undefined;
                macroName = undefined;
            }
            if (macro && !els.isMacroDef(el) && !els.isEndMacro(el)) {
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
            if (els.isLabel(el) && !inMacro) {
                if (blocks.length > 0 && !el.public) {
                    if (typeof this.symbols[labelName(blocks, el.label)] !== 'undefined') {
                        this.error(`Label '${el.label}' already defined at in this block`, el.location);
                        return;
                    }
                    this.symbols[labelName(blocks, el.label)] = null;
                    el.label = labelName(blocks, el.label);
                } else {
                    if (typeof this.symbols[el.label] !== 'undefined') {
                        this.error(`Label '${el.label}' already defined`, el.location);
                        return;
                    }
                    this.symbols[el.label] = null;
                }
            } else if (els.isBlock(el)) {
                blocks.push(nextBlock);
                el.prefix = labelPrefix(blocks);
                nextBlock++;
            } else if (els.isEndBlock(el) || els.isEndMacroCall(el)) {
                blocks.pop();
            } else if (els.isMacroCall(el) && !inMacro) {
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
            } else if (els.isEqu(el)) {
                if (i > 0 && els.isLabel(this.ast[i - 1])) {
                    let ii = i - 1;
                    let el2;
                    while ((el2 = this.ast[ii]) && els.isLabel(el2)) {
                        this.symbols[el2.label] = el.equ;
                        ii--;
                    }
                } else {
                    this.error("EQU has no label", el.location);
                    return;
                }
            }
        });
        if (blocks.length !== 0) {
            this.error("Mismatch between .block and .endblock statements");
        }
        return this.symbols;
    }

    private error(message, location?) {
        if (location !== undefined) {
            const error = {
                message: message,
                location: location,
                source: this.sources[location.source].source[location.line - 1],
                filename: this.sources[location.source].name
            };
            this.errors.push(error);
            this.logError(error);
        } else {
            const error = {
                message: message
            };
            this.errors.push(error);
            this.logError(error);
        }
    }

    public expandMacros() {
        this.iterateAst((el, i, prefix, inMacro) => {
            if (els.isMacroCall(el) && !inMacro) {
                const macro = this.macros[el.macrocall];
                if (!macro) {
                    this.error(`Unknown macro '${el.macrocall}'`, el.location);
                    el.params = [];
                    el.expanded = true;
                    this.ast.splice(i + 1, 0, { endmacrocall: true } as els.EndMacroCall);
                    return;
                }
                el.params = JSON.parse(JSON.stringify(macro.params));
                el.expanded = true;
                this.ast.splice(i + 1, 0, ...(JSON.parse(JSON.stringify(macro.ast))));
                this.ast.splice(i + 1 + macro.ast.length, 0, { endmacrocall: true } as els.EndMacroCall);
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
            if (els.isLabel(el)) {
                if (this.symbols[el.label] === null) {
                    this.symbols[el.label] = pc;
                }
                return;
            } else if (els.isEqu(el)) {
                if (el.equ.expression) {
                    el.equ.address = pc;
                }
            } else if (els.isDefs(el)) {
                let size: string | number | els.Expression = el.defs;
                if (els.isExpression(size)) {
                    size = this.evaluateExpression(prefix, size);
                }
                if (typeof size === 'string') {
                    const utf8 = toUtf8(size);
                    size = utf8.charCodeAt(0); // TODO test this
                }
                el.address = pc;
                el.out = out;
                pc += size;
                out += size;
            } else if (els.isOrg(el)) {
                if (els.isExpression(el.org)) {
                    el.org = this.evaluateExpression(prefix, el.org);
                }
                if (typeof el.org === 'string') {
                    const utf8 = toUtf8(el.org);
                    el.org = utf8.charCodeAt(0); // TODO test this
                }
                pc = el.org;
                out = el.org;
            } else if (els.isPhase(el)) {
                if (els.isExpression(el.phase)) {
                    el.phase = this.evaluateExpression(prefix, el.phase);
                }
                if (typeof el.phase === 'string') {
                    const utf8 = toUtf8(el.phase);
                    el.phase = utf8.charCodeAt(0); // TODO test this
                }
                pc = el.phase;
            } else if (els.isEndPhase(el)) {
                pc = out;
            } else if (els.isAlign(el)) {
                if (els.isExpression(el.align)) {
                    el.align = this.evaluateExpression(prefix, el.align);
                }
                if (typeof el.align === 'string') {
                    const utf8 = toUtf8(el.align);
                    el.align = utf8.charCodeAt(0); // TODO test this
                }
                let add = el.align - (pc % el.align);
                if (add !== el.align) {
                    pc += add;
                    out += add;
                }
            } else if (els.isBytes(el)) {
                el.address = pc;
                el.out = out;
                
                pc += el.bytes.length;
                out += el.bytes.length;
            }
        });
    }

    private evaluateExpression(prefix = '', expr, evaluated = []): number | string {
        const variables = expr.vars;
        const subVars = {}; // substitute variables
        if (expr.address !== undefined) {
            this.symbols['$'] = expr.address;
        }
        for (const variable of variables) {
            const subVar = this.findVariable(prefix, variable);

            if (this.symbols[subVar] === undefined || this.symbols[subVar] === null) {
                this.error(`Symbol '${variable}' not found`, expr.location);
                subVars[variable] = 0;
            } else {
                if (this.symbols[subVar].expression) {
                    this.evaluateSymbol(subVar, evaluated);
                }
                subVars[variable] = this.symbols[subVar];
            }
        }
        return Expr.parse(expr.expression, {variables: subVars});
    }

    private evaluateSymbol(symbol, evaluated) {
        if (evaluated.indexOf(symbol) !== -1) {
            this.error(`Circular symbol dependency while evaluating '${symbol}'`, this.symbols[symbol].location);
            return;
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
                this.error(`Symbol '${symbol}' cannot be calculated`);
            }
        }
    }

    public updateBytes() {
        this.iterateAst((el, i, prefix, inMacro) => {
            if (els.isBytes(el) && el.references && !inMacro) {
                this.symbols['$'] = el.address;
                for (let i = 0; i < el.bytes.length; i++) {
                    const byte = el.bytes[i];
                    if (byte && els.isRelative(byte)) {
                        let value = byte.relative;
                        if (els.isExpression(value)) {
                            value = this.evaluateExpression(prefix, value);
                        }
                        if (typeof value === 'string') {
                            const utf8 = toUtf8(value);
                            value = utf8.charCodeAt(0); // TODO test this - treat as signed value??
                        }

                        const relative = value - el.address;
                        if (relative > 127) {
                            this.error(`Relative jump is out of range (${relative} > 127)`, el.location);
                        } else if (relative < -128) {
                            this.error(`Relative jump is out of range (${relative} < -128)`, el.location);
                        }
                        el.bytes[i] = relative & 0xff;
                    }
                    if (byte && els.isExpression(byte)) {
                        const value = this.evaluateExpression(prefix, byte);

                        if (typeof value === 'string') {
                            const utf8 = toUtf8(value);
                            if (els.isDefb(el)) {
                                let bytes = [];
                                for (let i = 0; i < utf8.length; i++) {
                                    bytes.push(utf8.charCodeAt(i));
                                }
                                el.bytes.splice(i, 1, ...bytes);
                            } else if (els.isDefw(el)) {
                                let bytes = [];
                                for (let i = 0; i < utf8.length; i++) {
                                    bytes.push(utf8.charCodeAt(i));
                                }
                                el.bytes.splice(i, 1, ...bytes);
                            } else {
                                el.bytes[i] = utf8.charCodeAt(0);
                                if (el.bytes[i + 1] === null) {
                                    el.bytes[i + 1] = utf8.charCodeAt(1);
                                }
                            }
                        } else {
                            if (els.isDefb(el)) {
                                el.bytes[i] = value & 0xff;
                            } else if (els.isDefw(el)) {
                                el.bytes[i] = value & 0xff;
                                el.bytes.splice(i + 1, 0, (value >> 8) & 0xff);
                            } else {
                                el.bytes[i] = value & 0xff;
                                if (el.bytes[i + 1] === null) {
                                    el.bytes[i + 1] = (value >> 8) & 0xff;
                                }
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
        this.iterateAst((el, i, prefix, inMacro, ifTrue, inMacroCall) => {
            if (els.isLocatable(el)) {
                if ((el.location.line !== line && line !== 0) || (el.location.source !== source)) {
                    collectedAst.push(ast);                
                    ast = {};
                }
                line = el.location.line;
                source = el.location.source;
            }
  
            Object.assign(ast, el);
            if (inMacro) {
                ast.inMacro = true;
            }
            if (inMacroCall) {
                ast.inMacroCall = true;
            }
            ast.ifTrue = ifTrue;
            ast.prefix = prefix;
        }, true);
        if (Object.keys(ast).length !== 0) {
            collectedAst.push(ast);
        }
        return collectedAst;
    }

    public collectErrors(ast) {
        for (const el of ast) {
            for (const error of this.errors) {
                if ((error.location !== undefined) && (el.location.line === error.location.line) && (el.location.source === error.location.source)) {
                    el.error = error;
                }
            }
        }
    }

    public getList(warnUndoc: boolean) {
        const list = [];
        const lastLines = [];
        const sources = [];
        let lastSource = 0;
        let lastLine = 0;
        const ast = this.collectAst();
        this.collectErrors(ast);
        // console.log(JSON.stringify(ast, undefined, 2));
        let undoc = false;
        let error = false;
        for (const el of ast) {
            if (el.location.source !== lastSource) {
                lastLines.push(lastLine);
                sources.push(lastSource);
            } else {
                while (lastLine < el.location.line - 1) {
                    lastLine++;
                    list.push(' ' + pad(lastLine, 4));
                }
                if (el.macrocall) {
                    lastLines.push(lastLine);
                    sources.push(lastSource);
                }
            }

            undoc = undoc || el.undoc;
            error = error || el.error;

            this.dumpLine(list, 
                this.sources[el.location.source].source, 
                el.location.line, 
                el.out, 
                el.address, 
                el.bytes, 
                el.inMacro, 
                el.inMacroCall,
                el.ifTrue,
                (warnUndoc && el.undoc) ? 'U' :
                el.error ? 'E' : ' ');
                
            // if (el.macrocall && !el.inMacro) {
            //     list.push('           ' + ' '.repeat(BYTELEN * 2) + '  *UNROLL MACRO')
            // }

            if (el.endinclude) {
                list.push(` ${pad(el.location.line + 1, 4)}                        *END INCLUDE ${this.sources[el.location.source].name}`);
                lastLine = lastLines.pop();
                lastSource = sources.pop();
            } else if (el.endmacrocall) {
                lastLine = lastLines.pop() + 1;
                lastSource = sources.pop();
            } else {
                lastLine = el.location.line;
                lastSource = el.location.source;
            }
        }

        list.push('');

        if (warnUndoc && undoc) {
            list.push('U = Undocumented instruction')
        }
        if (error) {
            list.push('E = Error');
        }
        if ((warnUndoc && undoc) || error) {
            list.push('');
        }

        for (const symbol in this.symbols) {
            if (!symbol.startsWith('%')) {
                const value = this.symbols[symbol];
                if (value.expression) {
                    list.push(`${padr(symbol, 20)} unknown value`);
                } else {
                    list.push(`${padr(symbol, 20)} ${pad(value.toString(16), 4, '0')}`);
                }
            }
        }

        return list;
    }

    private dumpLine(list, lines, line, out, address, bytes, inMacro, inMacroCall, ifTrue, letter = ' ') {
        let byteString = '';
        if (bytes && !inMacro) {
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
        list.push(`${letter}${pad(line, 4)} ${address !== out?addressString + '@':''}${outString} ${padr(byteString, BYTELEN * 2).substring(0, BYTELEN * 2)} ${inMacroCall ? 'M' : ' '} ${lines[line - 1]}`);
        for (let i = BYTELEN * 2; i < byteString.length; i += BYTELEN * 2) {
            list.push(`           ${padr(byteString.substring(i, i + BYTELEN * 2), BYTELEN * 2).substring(0,BYTELEN * 2)}`)
        }
    }

    public logError(e) {
        if (e.name === "SyntaxError") {
            if (this.options.brief) {
                console.log(`${e.filename}:${e.location.start.line},${e.location.start.column}: Syntax error — ${e.message}`);
            } else {
                console.log(chalk.red(`Syntax error`));
                console.log(chalk.red(e.message));
                console.log(`  ${e.filename}:${e.location.start.line}`);
                console.log('  > ' + e.source);
                console.log('  > ' + ' '.repeat(e.location.start.column - 1) + '^');
            }
        } else if (e.location) {
            if (this.options.brief) {
                console.log(`${e.filename}:${e.location.line},${e.location.column}: ${e.message}`);
            } else {
                console.log(chalk.red(e.message));
                console.log(`  ${e.filename}:${e.location.line}`);
                console.log('  > ' + e.source);
                console.log('  > ' + ' '.repeat(e.location.column - 1) + '^');
            }
        } else if (e.message) {
            console.log(chalk.red(e.message));
        } else {
            console.log(chalk.red(e));
        }        
    }

    public warnUndocumented() {
        let lines = [];
        this.iterateAst((el) => {
            if (els.isUndocumented(el)) {
                lines.push(el.location.line);
            }
        });
        if (lines.length > 0) {
            console.log("Undocumented instructions used on line" + (lines.length > 1 ? "s" : "") + " "
                + lines.join(', '));
        }
    }

    public getBytes() {
        let bytes = [];
        let startOut = null;
        let out = null;

        this.iterateAst((el, i, prefix, inMacro) => {
            if (els.isBytes(el) && !inMacro) {
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

function toUtf8(s) {
    return unescape(encodeURIComponent(s));
}
