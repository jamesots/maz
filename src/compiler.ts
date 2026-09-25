import * as fs from 'fs';
import * as path from 'path';
import * as parser from './parser';
// import * as Tracer from 'pegjs-backtrace';
import * as Expr from './expr';
import * as chalk from 'chalk';
import * as els from './els';

declare function unescape(s: string): string;

const BYTELEN = 8;
const MAX_PASSES = 10;
// Register names aren't reserved, so they can be used as labels, but if
// one is used in an expression without being defined, it was probably
// meant as a register
const REGISTERS = new Set([
    'a', 'b', 'c', 'd', 'e', 'h', 'l', 'i', 'r',
    'af', 'bc', 'de', 'hl', 'sp', 'ix', 'iy',
    'ixh', 'ixl', 'iyh', 'iyl',
]);

export abstract class FileResolver {
    public abstract fileExists(filename: string): boolean;
    public abstract readFile(filename: string): string[];
    public abstract readBinaryFile(filename: string): number[];
    public abstract finishFile(): void;
    public abstract getRealFilename(filename: string): string;
    public readonly filename: string;
}

export class DefaultFileResolver implements FileResolver {
    private files: string[] = [];
    private _filename: string;
    public searchPaths: string[] = [];

    public fileExists(filename: string): boolean {
        return fs.existsSync(this.getFilename(filename));
    }

    public readFile(filename: string): string[] {
        this._filename = this.getFilename(filename);
        this.files.push(this._filename);
        return fs.readFileSync(this._filename).toString().split('\n');
    }

    public readBinaryFile(filename: string): number[] {
        return Array.from(fs.readFileSync(this.getFilename(filename)));
    }

    public finishFile() {
        this.files.pop();
        this._filename = this.files[this.files.length - 1];
    }

    public getRealFilename(filename: string): string {
        return this.getFilename(filename);
    }

    private getFilename(filename: string): string {
        for (const searchPath of this.searchPaths) {
            const newFilename = path.join(searchPath, filename);
            if (fs.existsSync(newFilename)) {
                return newFilename;
            }
        }
        if (this._filename === undefined) {
            return filename;
        }
        return path.join(path.dirname(this._filename), filename);
    }

    public get filename(): string {
        return this._filename;
    }
}

export class StringFileResolvers implements FileResolver {
    private files: string[] = [];
    private _filename: string;
    public searchPaths: string[] = [];

    constructor(private fileContent: { [filename: string]: string[] }) {}

    public fileExists(filename: string): boolean {
        return this.fileContent[this.getFilename(filename)] !== undefined;
    }

    public readFile(filename: string): string[] {
        this._filename = this.getFilename(filename);
        this.files.push(this._filename);
        return this.fileContent[this._filename];
    }

    public readBinaryFile(filename: string): number[] {
        const content = this.fileContent[this.getFilename(filename)];
        return Array.from(Buffer.from(content.join('\n')));
    }

    public finishFile() {
        this.files.pop();
        this._filename = this.files[this.files.length - 1];
    }

    public getRealFilename(filename: string): string {
        return this.getFilename(filename);
    }

    private getFilename(filename: string): string {
        for (const searchPath of this.searchPaths) {
            const newFilename = searchPath + '/' + filename;
            if (this.fileContent[newFilename] !== undefined) {
                return newFilename;
            }
        }
        if (this._filename === undefined) {
            return filename;
        }
        const index = this._filename.lastIndexOf('/');
        if (index === -1) {
            return filename;
        }
        return this._filename.substring(0, index) + '/' + filename;
    }

    public get filename(): string {
        return this._filename;
    }
}

export class StringFileResolver implements FileResolver {
    public constructor(private _filename: string, private code: string[]) {}
    public fileExists(filename: string): boolean {
        return filename === this._filename;
    }
    public readFile(filename: string): string[] {
        if (filename === this._filename) {
            return this.code;
        }
        throw 'File not found: ' + filename;
    }
    public readBinaryFile(filename: string): number[] {
        return Array.from(Buffer.from(this.readFile(filename).join('\n')));
    }
    public finishFile() {}
    public getRealFilename(filename: string): string {
        return filename;
    }
    public get filename(): string {
        return this._filename;
    }
}

export function compile(filename, options) {
    const parserOptions = { source: 0 } as any;
    // const tracer = new Tracer(code, {
    //     showTrace: true,
    //     showFullPath: true
    // });
    // if (options.trace) {
    //     parserOptions.tracer = tracer;
    // }
    const prog = new Programme(options);
    prog.parse(filename);
    prog.processIncludes();
    prog.checkConditionals();
    prog.getMacros();
    prog.expandMacros();
    prog.getSymbols();
    // no evaluation up to here
    prog.assignPCandEQU();
    prog.evaluateSymbols();
    prog.checkSymbols();
    prog.updateBytes();
    if (options.warnUndocumented) {
        prog.warnUndocumented();
    }
    return prog;
}

export interface Source {
    name: string;
    source: string[];
}

export class Programme {
    public ast: els.Element[];
    public symbols = {};
    public sources: Source[] = [];
    public macros = {};
    public errors = [];
    private fileResolver: FileResolver;
    private originalBytes = new WeakMap<els.Bytes, els.Bytes['bytes']>();
    private originalValues = new WeakMap<els.Element, any>();
    private deferredErrors: (els.Error | string)[] | undefined;
    // label values from the previous pass, used for forward references
    private forwardLabels: { [label: string]: number } | undefined;
    private allowForwardLabels = false;

    constructor(private options) {
        if (options && options.fileResolver) {
            this.fileResolver = options.fileResolver;
        } else {
            const fileResolver = new DefaultFileResolver();
            this.fileResolver = fileResolver;
            if (options && options.searchPaths) {
                fileResolver.searchPaths = options.searchPaths;
            }
        }
    }

    public parse(filename) {
        const code = this.readSource(filename);
        this.ast = this.parseLines(code, 0);
        // this.debug();
    }

    private debug() {
        console.log(
            JSON.stringify(
                this.ast,
                function (name, value) {
                    if (name === 'location') {
                        return `${value.source}:${value.line}:${value.column}`;
                    }
                    if (typeof value === 'number') {
                        return '>> $' + value.toString(16);
                    }
                    return value;
                },
                2
            )
        );
        console.log(JSON.stringify(this.symbols, undefined, 2));
    }

    private parseLines(lines, sourceIndex) {
        let ast: els.Element[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            try {
                const els = parser.parse(line, {
                    source: sourceIndex,
                    line: i + 1,
                });
                if (els !== null) {
                    ast.push(...els);
                }
            } catch (e) {
                if (e.name === 'SyntaxError') {
                    const error = {
                        error: 'Syntax Error: ' + e.message,
                        filename: this.sources[sourceIndex].name,
                        location: {
                            line: i + 1,
                            column: e.location.start.column,
                            source: sourceIndex,
                        },
                        source: this.sources[sourceIndex].source[i],
                    };
                    ast.push(error);
                    this.logError(error);
                } else if (e.location) {
                    const error = {
                        error: e.message,
                        filename: this.sources[sourceIndex].name,
                        location: e.location,
                        source: this.sources[sourceIndex].source[i],
                    } as els.Error;
                    ast.push(error);
                    this.logError(error);
                } else {
                    const error = {
                        error: e,
                        filename: this.sources[sourceIndex].name,
                        location: {
                            source: sourceIndex,
                            line: i + 1,
                            column: 1,
                        },
                        source: this.sources[sourceIndex].source[i],
                    } as els.Error;
                    ast.push(error);
                    this.logError(error);
                }
            }
        }
        return ast;
    }

    private readSource(filename) {
        const source = this.fileResolver.readFile(filename);
        this.sources.push({
            name: this.fileResolver.filename,
            source: source,
        });
        return source;
    }

    private iterateAst(
        func: (
            el: els.Element,
            index: number,
            prefix: string,
            inMacroDef: boolean,
            ifTrue: boolean,
            inMacroCall: boolean
        ) => void,
        ignoreIf = false
    ) {
        let inMacroDef = false;
        let inMacroCall = false;
        const prefixes = [];
        const ifStack = [true];
        for (let i = 0; i < this.ast.length; i++) {
            const el = this.ast[i];
            if (els.isPrefixed(el)) {
                prefixes.push(el.prefix);
            }
            if (els.isEndPrefix(el)) {
                prefixes.pop();
            }

            if (els.isMacroDef(el)) {
                inMacroDef = true;
            }

            if (!inMacroDef && els.isMacroCall(el)) {
                inMacroCall = true;
            }

            // unbalanced .if/.else/.endif are reported by checkConditionals,
            // so just ignore them here
            if (els.isIf(el)) {
                // an .if inside code which isn't being assembled is false,
                // and isn't evaluated
                const parentTrue = ifStack[ifStack.length - 1];
                if (parentTrue && els.isExpression(el.if)) {
                    el.if = this.evaluateExpression(
                        prefixes[prefixes.length - 1],
                        el.if
                    );
                }
                ifStack.push(parentTrue && el.if !== 0);
            }
            if (els.isElse(el) && ifStack.length > 1) {
                const wasTrue = ifStack.pop();
                ifStack.push(ifStack[ifStack.length - 1] && !wasTrue);
            }
            if (els.isEndIf(el) && ifStack.length > 1) {
                ifStack.pop();
            }

            if (ignoreIf || ifStack[ifStack.length - 1]) {
                func(
                    el,
                    i,
                    prefixes[prefixes.length - 1] || '',
                    inMacroDef,
                    ifStack[ifStack.length - 1],
                    inMacroCall
                );
            }

            if (els.isEndMacro(el)) {
                inMacroDef = false;
            }
            if (els.isEndMacroCall(el)) {
                inMacroCall = false;
            }
        }
    }

    /**
     * Finds all include elements which haven't already been included.
     * Add error if file doesn't exist, but mark it as included
     * If it does, read the file, parse it and insert it after the
     * include element. Then add an endinclude element.
     * Then carry on iterating over the file, so any included includes
     * get processed.
     */
    public processIncludes() {
        const sourceIndices = [];
        let sourceIndex = 0;

        this.iterateAst((el, i, prefix, inMacroDef) => {
            if (els.isInclude(el) && !el.included) {
                if (!this.fileResolver.fileExists(el.include)) {
                    this.error(
                        'File does not exist: ' +
                            this.fileResolver.getRealFilename(el.include),
                        el.location
                    );
                    el.included = true;
                    return;
                }
                const source = this.readSource(el.include);
                sourceIndices.push(sourceIndex);
                sourceIndex = this.sources.length - 1;
                const includeAst = this.parseLines(source, sourceIndex);
                this.ast.splice(i + 1, 0, ...includeAst);
                this.ast.splice(i + 1 + includeAst.length, 0, {
                    endinclude: sourceIndex,
                    location: {
                        line: includeAst.length + 1,
                        column: 0,
                        source: sourceIndex,
                    },
                } as els.EndInclude);
                el.included = true;
            } else if (els.isIncbin(el) && !el.included) {
                // done here, while the file resolver knows which file we're
                // in, so the filename is relative to the current file
                if (!this.fileResolver.fileExists(el.incbin)) {
                    this.error(
                        'File does not exist: ' +
                            this.fileResolver.getRealFilename(el.incbin),
                        el.location
                    );
                    el.included = true;
                    return;
                }
                this.ast.splice(i + 1, 0, {
                    defb: true,
                    references: false,
                    location: el.location,
                    bytes: this.fileResolver.readBinaryFile(el.incbin),
                } as els.Defb);
                el.included = true;
            } else if (els.isEndInclude(el)) {
                this.fileResolver.finishFile();
                sourceIndex = sourceIndices.pop();
            }
        });
    }

    /**
     * Check that .if, .else and .endif are balanced
     */
    public checkConditionals() {
        const ifs: { location: els.Location; hadElse: boolean }[] = [];
        for (const el of this.ast) {
            if (els.isIf(el)) {
                ifs.push({ location: el.location, hadElse: false });
            } else if (els.isElse(el)) {
                if (ifs.length === 0) {
                    this.error('.else without .if', el.location);
                } else if (ifs[ifs.length - 1].hadElse) {
                    this.error('More than one .else for .if', el.location);
                } else {
                    ifs[ifs.length - 1].hadElse = true;
                }
            } else if (els.isEndIf(el)) {
                if (ifs.length === 0) {
                    this.error('.endif without .if', el.location);
                } else {
                    ifs.pop();
                }
            }
        }
        for (const unclosed of ifs) {
            this.error('.if without .endif', unclosed.location);
        }
    }

    /**
     * Look for macrodefs. Don't allow nested macros. Don't allow
     * a macro to be redefined.
     * Store all ast elements until endmacro.
     * Look for endmacros. If not in a macro, throw error. Otherwise
     * store the macro in the list of macros, indexed by macro name.
     */
    public getMacros() {
        let macro = undefined;
        let macroName = undefined;
        let macroLocation = undefined;
        this.iterateAst((el, i, prefix, inMacroDef) => {
            if (els.isMacroDef(el)) {
                if (macro) {
                    this.error('Cannot nest macros', el.location);
                    return;
                }
                macroLocation = el.location;
                macroName = el.macrodef;
                macro = {
                    ast: [],
                    params: el.params || [],
                };
                if (this.macros[macroName]) {
                    this.error(
                        `Already defined macro '${macroName}'`,
                        el.location
                    );
                    return;
                }
            } else if (els.isEndMacro(el)) {
                if (!macro) {
                    this.error('Not in a macro', el.location);
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
     *
     * Labels
     *  - don't allow label to redefined in the same block
     *  - don't allow public label to be defined
     *  - relabel labels in blocks with %n_n_n... for blocks
     *  - symbol is stored with value of null
     * Blocks / EndBlocks
     *  - count the block depth
     * Macrocall
     *  - add prefixes to parameter names and
     *    set their values to whatever they are being called with
     * Equ
     *  - must have a label
     *  - this symbol is set to the equ expression
     */
    public getSymbols() {
        let nextBlock = 0;
        let blocks = [];
        this.iterateAst((el, i, prefix, inMacroDef) => {
            if (els.isLabel(el) && !inMacroDef) {
                if (blocks.length > 0 && !el.public) {
                    if (
                        typeof this.symbols[labelName(blocks, el.label)] !==
                        'undefined'
                    ) {
                        this.error(
                            `Label '${el.label}' already defined at in this block`,
                            el.location
                        );
                        return;
                    }
                    this.symbols[labelName(blocks, el.label)] = null;
                    el.label = labelName(blocks, el.label);
                } else {
                    if (typeof this.symbols[el.label] !== 'undefined') {
                        this.error(
                            `Label '${el.label}' already defined`,
                            el.location
                        );
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
            } else if (els.isMacroCall(el) && !inMacroDef) {
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
                    this.error('EQU has no label', el.location);
                    return;
                }
            }
        });
        if (blocks.length !== 0) {
            this.error('Mismatch between .block and .endblock statements');
        }
        return this.symbols;
    }

    private error(message, location?) {
        if (location !== undefined) {
            const error = {
                error: message,
                location: location,
                source: this.sources[location.source].source[location.line - 1],
                filename: this.sources[location.source].name,
            };
            this.logError(error);
        } else {
            const error = {
                error: message,
                location: undefined,
                source: undefined,
                filename: undefined,
            };
            this.logError(error);
        }
    }

    /**
     * Look for macrocalls. If macro doesn't exist, add error. Then add
     * an endmacrocall element.
     * If macro does exist, splice in the macro's ast. Then add an
     * endmacrocall element.
     */
    public expandMacros() {
        this.iterateAst((el, i, prefix, inMacroDef) => {
            if (els.isMacroCall(el) && !inMacroDef) {
                const macro = this.macros[el.macrocall];
                if (!macro) {
                    this.error(`Unknown macro '${el.macrocall}'`, el.location);
                    el.params = [];
                    el.expanded = true;
                    this.ast.splice(i + 1, 0, {
                        endmacrocall: true,
                        endprefix: true,
                    } as els.EndMacroCall);
                    return;
                }
                el.params = JSON.parse(JSON.stringify(macro.params));
                el.expanded = true;
                this.ast.splice(
                    i + 1,
                    0,
                    ...JSON.parse(JSON.stringify(macro.ast))
                );
                this.ast.splice(i + 1 + macro.ast.length, 0, {
                    endmacrocall: true,
                } as els.EndMacroCall);
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
        // labels whose value comes from the pc (rather than from an equ)
        const pcLabels = new Set<string>();
        for (const symbol in this.symbols) {
            if (this.symbols[symbol] === null) {
                pcLabels.add(symbol);
            }
        }

        // symbols (equs and macro arguments) which are expressions. These
        // get replaced by their values when evaluated, so keep the originals
        const symbolExpressions = {};
        for (const symbol in this.symbols) {
            if (this.symbols[symbol] && this.symbols[symbol].expression) {
                symbolExpressions[symbol] = this.symbols[symbol];
            }
        }

        // The size of some elements (e.g. defw cat(label, "x")) can depend
        // on the value of labels defined later, so keep assigning addresses
        // until the labels stop moving. Each pass lets defb and defw use the
        // label values from the previous pass for forward references; other
        // things which affect the pc (org, align, etc.) can't use forward
        // references. Only errors from the last pass are reported, as
        // earlier passes may not have known the values of all the labels.
        let changed: string[] = [];
        for (let pass = 0; pass < MAX_PASSES; pass++) {
            const previous = {};
            for (const label of pcLabels) {
                previous[label] = this.symbols[label];
                this.symbols[label] = null;
            }
            this.forwardLabels = previous;
            Object.assign(this.symbols, symbolExpressions);
            this.restoreExpressions();
            this.deferredErrors = [];
            this.assignPCandEQUPass(pcLabels);
            changed = [...pcLabels].filter(
                (label) => !Object.is(this.symbols[label], previous[label])
            );
            if (changed.length === 0) {
                break;
            }
        }
        const errors = this.deferredErrors;
        this.deferredErrors = undefined;
        this.forwardLabels = undefined;
        for (const error of errors) {
            this.logError(error);
        }
        if (changed.length !== 0) {
            this.error(
                `Could not resolve address of '${changed[0]}' - ` +
                    'forward references keep changing the size of the code'
            );
        }
    }

    /**
     * Put back any expressions which were replaced by their values
     * in a previous pass, so they can be evaluated again
     */
    private restoreExpressions() {
        for (const el of this.ast) {
            if (els.isBytes(el)) {
                if (!this.originalBytes.has(el)) {
                    this.originalBytes.set(el, el.bytes.slice());
                } else {
                    el.bytes = this.originalBytes.get(el).slice();
                }
                continue;
            }
            let key: string;
            if (els.isOrg(el)) {
                key = 'org';
            } else if (els.isPhase(el)) {
                key = 'phase';
            } else if (els.isAlign(el)) {
                key = 'align';
            } else {
                continue;
            }
            if (!this.originalValues.has(el)) {
                this.originalValues.set(el, el[key]);
            } else {
                el[key] = this.originalValues.get(el);
            }
        }
    }

    private assignPCandEQUPass(pcLabels: Set<string>) {
        // pc starts at 0 unless org or phase changes it
        let pc = 0;
        let out = 0;
        this.iterateAst((el, i, prefix, inMacroDef) => {
            // console.log("in: " + JSON.stringify(el, undefined, 2));
            if (inMacroDef) {
                // don't need to update things in the macro defs
                return;
            }
            if (els.isLabel(el)) {
                // label - just set the value to the pc
                if (this.symbols[el.label] === null) {
                    this.symbols[el.label] = pc;
                }
                return;
            } else if (els.isEqu(el)) {
                // if the equ is an expression, store the address in it
                // for later evaluation
                if (el.equ.expression) {
                    el.equ.address = pc;
                }
            } else if (els.isDefs(el)) {
                let size: string | number | els.Expression = el.defs;
                if (els.isExpression(size)) {
                    size = this.evaluateExpression(prefix, size);
                    // TODO what if size can't be evaluated
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

                if (els.isDefb(el) || els.isDefw(el)) {
                    this.allowForwardLabels = true;
                    this.updateByte(el, prefix, inMacroDef, true);
                    this.allowForwardLabels = false;
                }

                let elementLength = els.isDefw(el) ? 2 : 1;
                let length = 0;
                for (const byte of el.bytes) {
                    // this is assuming all expressions return a single byte/word
                    // but cat and repeat, etc, may not
                    if (byte && els.isExpression(byte)) {
                        // todo: maybe make a method to get unevaluated
                        // expression length, and throw error if it can't
                        // be worked out at this time
                        length += elementLength;
                    } else {
                        length += 1;
                    }
                }
                pc += length;
                out += length;
            }
            // console.log("out: " + JSON.stringify(el, undefined, 2));
        });
    }

    private evaluateExpression(
        prefix = '',
        expr,
        evaluated = [],
        ignoreErrors: boolean = false
    ): number | string {
        const variables = expr.vars;
        const subVars = {}; // substitute variables
        if (expr.address !== undefined) {
            this.symbols['$'] = expr.address;
        }
        for (const variable of variables) {
            const subVar = this.findVariable(prefix, variable);

            if (
                this.symbols[subVar] === null &&
                this.allowForwardLabels &&
                this.forwardLabels[subVar] !== null
            ) {
                subVars[variable] = this.forwardLabels[subVar];
            } else if (
                this.symbols[subVar] === undefined ||
                this.symbols[subVar] === null
            ) {
                if (!ignoreErrors) {
                    if (
                        this.symbols[subVar] === undefined &&
                        REGISTERS.has(variable.toLowerCase())
                    ) {
                        // most likely an instruction which doesn't exist,
                        // e.g. ld hl,(ix), which is parsed as ld hl,(nn)
                        this.error(
                            `Register '${variable}' can't be used here`,
                            expr.location
                        );
                    } else {
                        this.error(`Symbol '${variable}' not found`, expr.location);
                    }
                    subVars[variable] = 0;
                }
            } else {
                if (this.symbols[subVar].expression) {
                    this.evaluateSymbol(subVar, evaluated);
                }
                subVars[variable] = this.symbols[subVar];
            }
        }
        try {
            return Expr.parse(expr.expression, { variables: subVars });
        } catch (e) {
            if (!ignoreErrors) {
                this.error(e, expr.location);
            }
        }
    }

    private evaluateSymbol(symbol, evaluated) {
        if (evaluated.indexOf(symbol) !== -1) {
            this.error(
                `Circular symbol dependency while evaluating '${symbol}'`,
                this.symbols[symbol].location
            );
            return;
        }
        evaluated.push(symbol);
        const prefix = getWholePrefix(symbol);
        this.symbols[symbol] = this.evaluateExpression(
            prefix,
            this.symbols[symbol],
            evaluated
        );
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
        this.iterateAst((el, i, prefix, inMacroDef) => {
            this.updateByte(el, prefix, inMacroDef);
        });
    }

    public updateByte(
        el: els.Element,
        prefix: string,
        inMacroDef: boolean,
        ignoreErrors: boolean = false
    ) {
        let allEvaluated = true;
        if (els.isBytes(el) && el.references && !inMacroDef) {
            this.symbols['$'] = el.address;
            for (let i = 0; i < el.bytes.length; i++) {
                const byte = el.bytes[i];
                if (byte && els.isRelative(byte)) {
                    let value = byte.relative;
                    if (els.isExpression(value)) {
                        value = this.evaluateExpression(
                            prefix,
                            value,
                            [],
                            ignoreErrors
                        );
                    }
                    if (typeof value === 'string') {
                        const utf8 = toUtf8(value);
                        value = utf8.charCodeAt(0); // TODO test this - treat as signed value??
                    }

                    const relative = value - (el.address + 2);
                    if (!ignoreErrors) {
                        if (relative > 127) {
                            this.error(
                                `Relative jump is out of range (${relative} > 127)`,
                                el.location
                            );
                        } else if (relative < -128) {
                            this.error(
                                `Relative jump is out of range (${relative} < -128)`,
                                el.location
                            );
                        }
                    }
                    el.bytes[i] = relative & 0xff;
                }
                if (byte && els.isExpression(byte)) {
                    const value = this.evaluateExpression(
                        prefix,
                        byte,
                        [],
                        ignoreErrors
                    );

                    if (ignoreErrors && value === undefined) {
                        allEvaluated = false;
                        continue;
                    }

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
                            if (utf8.length % 2 === 1) {
                                bytes.push(0);
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
                            if (!ignoreErrors) {
                                this.checkRange(
                                    value,
                                    byte.offset
                                        ? 'offset'
                                        : el.bytes[i + 1] === null
                                        ? 'word'
                                        : 'byte',
                                    byte.location || el.location
                                );
                            }
                            el.bytes[i] = value & 0xff;
                            if (el.bytes[i + 1] === null) {
                                el.bytes[i + 1] = (value >> 8) & 0xff;
                            }
                        }
                    }
                }
            }
        }
        return allEvaluated;
    }

    private checkRange(
        value: number,
        size: 'byte' | 'word' | 'offset',
        location: els.Location
    ) {
        const [min, max, description] = {
            byte: [-0x80, 0xff, 'an 8 bit value'],
            word: [-0x8000, 0xffff, 'a 16 bit value'],
            offset: [-0x80, 0x7f, 'an index offset'],
        }[size] as [number, number, string];
        if (value === undefined) {
            // couldn't be evaluated, and that has already been reported
            return;
        } else if (!Number.isFinite(value)) {
            this.error(`Invalid value ${value} for ${description}`, location);
        } else if (value < min || value > max) {
            this.error(
                `Value ${value} is out of range for ${description} ` +
                    `(${min} to ${max})`,
                location
            );
        }
    }

    public collectAst() {
        const collectedAst = [];
        let line = 0;
        let source = 0;
        let ast: any = {};
        this.iterateAst((el, i, prefix, inMacroDef, ifTrue, inMacroCall) => {
            if (el.location) {
                if (
                    (el.location.line !== line && line !== 0) ||
                    el.location.source !== source
                ) {
                    collectedAst.push(ast);
                    ast = {};
                }
                line = el.location.line;
                source = el.location.source;
            }

            Object.assign(ast, el);
            if (inMacroDef) {
                ast.inMacroDef = true;
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
                if (
                    error.location !== undefined &&
                    el.location.line === error.location.line &&
                    el.location.source === error.location.source
                ) {
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

            this.dumpLine(
                list,
                this.sources[el.location.source].source,
                el.location.line,
                el.out,
                el.address,
                el.bytes,
                el.inMacroDef,
                el.inMacroCall,
                el.ifTrue,
                warnUndoc && el.undoc ? 'U' : el.error ? 'E' : ' '
            );

            // if (el.macrocall && !el.inMacroDef) {
            //     list.push('           ' + ' '.repeat(BYTELEN * 2) + '  *UNROLL MACRO')
            // }

            if (el.endinclude) {
                list.push(
                    ` ${pad(
                        el.location.line + 1,
                        4
                    )}                        *END INCLUDE ${
                        this.sources[el.location.source].name
                    }`
                );
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
            list.push('U = Undocumented instruction');
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
                } else if (typeof value === 'string') {
                    list.push(`${padr(symbol, 20)} "${value}"`);
                } else {
                    list.push(
                        `${padr(symbol, 20)} ${pad(value.toString(16), 4, '0')}`
                    );
                }
            }
        }

        return list;
    }

    private dumpLine(
        list,
        lines,
        line,
        out,
        address,
        bytes,
        inMacroDef,
        inMacroCall,
        ifTrue,
        letter = ' '
    ) {
        let byteString = '';
        if (bytes && !inMacroDef) {
            for (const byte of bytes) {
                byteString += pad((byte & 0xff).toString(16), 2, '0');
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
        list.push(
            `${letter}${pad(line, 4)} ${
                address !== out ? addressString + '@' : ''
            }${outString} ${padr(byteString, BYTELEN * 2).substring(
                0,
                BYTELEN * 2
            )} ${inMacroCall ? 'M' : ' '} ${lines[line - 1]}`
        );
        for (let i = BYTELEN * 2; i < byteString.length; i += BYTELEN * 2) {
            list.push(
                `           ${padr(
                    byteString.substring(i, i + BYTELEN * 2),
                    BYTELEN * 2
                ).substring(0, BYTELEN * 2)}`
            );
        }
    }

    public logError(e: els.Error | string) {
        if (this.deferredErrors) {
            this.deferredErrors.push(e);
            return;
        }
        this.errors.push(e);
        if (typeof e === 'string') {
            console.log(chalk.red(e));
        } else if (e.location) {
            if (this.options.brief) {
                console.log(
                    `${e.filename}:${e.location.line},${e.location.column}: ${e.error}`
                );
            } else {
                console.log(chalk.red(e.error));
                console.log(`  ${e.filename}:${e.location.line}`);
                console.log('  > ' + e.source);
                console.log('  > ' + ' '.repeat(e.location.column - 1) + '^');
            }
        } else if (e.error) {
            console.log(chalk.red(e.error));
        } else {
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
            console.log(
                'Undocumented instructions used on line' +
                    (lines.length > 1 ? 's' : '') +
                    ' ' +
                    lines.join(', ')
            );
        }
    }

    public getBytes() {
        let bytes = [];
        let startOut = null;
        let out = null;

        this.iterateAst((el, i, prefix, inMacroDef) => {
            if (els.isBytes(el) && !inMacroDef) {
                const end = bytes.length + startOut;
                if (out === null || el.out === end) {
                    if (startOut === null) {
                        startOut = el.out;
                    }
                    out = el.bytes.length + el.out;
                    // not using concat or push(...), as they are slow or
                    // can overflow the stack with large arrays
                    for (const byte of el.bytes) {
                        bytes.push(byte);
                    }
                } else if (el.out > end) {
                    for (let i = end; i < el.out; i++) {
                        bytes.push(0);
                    }
                    for (const byte of el.bytes) {
                        bytes.push(byte);
                    }
                    out = el.bytes.length + el.out;
                } else if (el.out < startOut) {
                    this.error(
                        'Cannot ORG to earlier address than first ORG',
                        el.location
                    );
                } else if (el.out < end) {
                    for (let i = 0; i < el.bytes.length; i++) {
                        bytes[el.out - startOut + i] = el.bytes[i];
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
