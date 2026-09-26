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
    'a',
    'b',
    'c',
    'd',
    'e',
    'h',
    'l',
    'i',
    'r',
    'af',
    'bc',
    'de',
    'hl',
    'sp',
    'ix',
    'iy',
    'ixh',
    'ixl',
    'iyh',
    'iyl',
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
    prog.selectRoutines();
    prog.getSymbols();
    // no evaluation up to here
    prog.assemble();
    if (options.warnUndocumented) {
        prog.warnUndocumented();
    }
    return prog;
}

export interface Source {
    name: string;
    source: string[];
}

export type Value = number | string;

/**
 * Where a symbol is defined. Labels get their value from the address of
 * the element; equs and macro arguments from their expression.
 */
export interface SymbolDefinition {
    kind: 'label' | 'equ' | 'arg';
    // index in the ast of the element which defines it
    index: number;
    value?: Value | els.Expression;
    location?: els.Location;
    // true if it's inside an .if whose condition uses symbols, so it may
    // or may not be assembled
    conditional?: boolean;
    // for an equ, the index of the label element
    labelIndex?: number;
}

/**
 * Where an element ended up in one pass, and the bytes it produced
 */
export interface Placement {
    address: number;
    out: number;
    bytes?: number[];
    size?: number;
}

/**
 * A contiguous block of assembled bytes
 */
export interface Segment {
    address: number;
    bytes: number[];
}

/**
 * A source line which produced some bytes. Bytes produced by a macro are
 * counted as coming from the line which calls the macro.
 */
export interface Line {
    file: string;
    line: number;
    // the address the code runs at, which is different to out when phased
    address: number;
    out: number;
    length: number;
    source: string;
    // whether the line is data (db, dw, ds or incbin) rather than code
    data: boolean;
}

/**
 * The results of one pass of assigning addresses and assembling bytes.
 * Nothing in the ast is changed by a pass, so passes can be repeated until
 * the addresses stop changing.
 */
export class Pass {
    public labels = new Map<string, number>();
    // indexed by the element's index in the ast
    public placements: Placement[] = [];
    // the conditions of .ifs which use symbols, by index in the ast
    public conditions = new Map<number, boolean>();
    public errors: els.Error[] = [];
    private errorKeys = new Set<string>();

    public addError(error: els.Error) {
        const location = error.location;
        const key = `${error.error}|${
            location
                ? `${location.source}:${location.line}:${location.column}`
                : ''
        }`;
        if (!this.errorKeys.has(key)) {
            this.errorKeys.add(key);
            this.errors.push(error);
        }
    }

    public sameAs(other: Pass) {
        if (this.labels.size !== other.labels.size) {
            return false;
        }
        for (const [label, value] of this.labels) {
            if (!Object.is(value, other.labels.get(label))) {
                return false;
            }
        }
        if (this.conditions.size !== other.conditions.size) {
            return false;
        }
        for (const [index, condition] of this.conditions) {
            if (condition !== other.conditions.get(index)) {
                return false;
            }
        }
        if (this.placements.length !== other.placements.length) {
            return false;
        }
        for (let i = 0; i < this.placements.length; i++) {
            const a = this.placements[i];
            const b = other.placements[i];
            if (
                (a === undefined) !== (b === undefined) ||
                (a &&
                    (!Object.is(a.address, b.address) ||
                        !Object.is(a.out, b.out)))
            ) {
                return false;
            }
        }
        return true;
    }
}

/**
 * Evaluates expressions for one pass. Labels which haven't been reached
 * yet in this pass can use their value from the previous pass, but only
 * when allowForward is true, which is for things which can't change the
 * size of the code in a way which stops it settling (db, dw and
 * instruction operands). Equs are evaluated when they are used.
 */
export class Evaluator {
    // how many circular definitions have been found
    private cycles = 0;
    // how many forward references have been found to labels which don't
    // have a value yet, in the first pass
    private unknowns = 0;
    // how many symbols have been looked up which aren't defined in this
    // pass, e.g. a label which hasn't been reached yet
    public missing = 0;

    constructor(
        private definitions: Map<string, SymbolDefinition[]>,
        private pass: Pass,
        private previous: Pass | undefined,
        private error: (message: string, location?: els.Location) => void
    ) {}

    /**
     * Evaluates an expression. address is the value of $. Returns
     * undefined if it can't be evaluated, after reporting an error.
     */
    public evaluate(
        expr: Value | els.Expression,
        prefix: string,
        address: number | undefined,
        allowForward: boolean,
        evaluating: string[] = []
    ): Value | undefined {
        if (expr === undefined || expr === null || !els.isExpression(expr)) {
            return expr as Value;
        }
        const unknowns = this.unknowns;
        const variables = {};
        for (const variable of expr.vars) {
            let value: Value | undefined;
            if (variable === '$') {
                value = address;
                if (value === undefined) {
                    this.error(`Symbol '$' not found`, expr.location);
                }
            } else {
                value = this.lookup(
                    variable,
                    prefix,
                    allowForward,
                    evaluating,
                    expr.location
                );
            }
            variables[variable] = value === undefined ? 0 : value;
        }
        if (this.unknowns > unknowns) {
            // it can't be worked out until the next pass
            return undefined;
        }
        try {
            return Expr.parse(expr.expression, { variables });
        } catch (e) {
            this.error(e, expr.location);
            return undefined;
        }
    }

    /**
     * Gets the value of a symbol, given its full name
     */
    public symbolValue(
        name: string,
        allowForward: boolean,
        evaluating: string[] = []
    ): Value | undefined {
        const definition = this.definitionFor(name, allowForward);
        if (!definition) {
            return undefined;
        }
        if (definition.kind === 'label') {
            if (this.pass.labels.has(name)) {
                return this.pass.labels.get(name);
            }
            if (allowForward) {
                if (this.previous?.labels.has(name)) {
                    return this.previous.labels.get(name);
                }
                if (!this.previous) {
                    this.unknowns++;
                    return undefined;
                }
            }
            this.missing++;
            return undefined;
        }
        if (evaluating.includes(name)) {
            this.circularError(evaluating.slice(evaluating.indexOf(name)));
            return undefined;
        }
        // $ in an equ is the address of the equ
        const placement =
            this.pass.placements[definition.index] ??
            (allowForward
                ? this.previous?.placements[definition.index]
                : undefined);
        const cycles = this.cycles;
        const value = this.evaluate(
            definition.value,
            getWholePrefix(name),
            placement?.address,
            allowForward,
            [...evaluating, name]
        );
        // a symbol which depends on a circular definition has no value
        return this.cycles > cycles ? undefined : value;
    }

    /**
     * Gets the definition of a symbol which is being assembled. If it's
     * defined in .ifs which use symbols, that's the one in the branch which
     * is assembled, or which was in the previous pass if that branch
     * hasn't been reached yet.
     */
    private definitionFor(
        name: string,
        allowForward: boolean
    ): SymbolDefinition | undefined {
        const definitions = this.definitions.get(name);
        if (definitions.length === 1 && !definitions[0].conditional) {
            return definitions[0];
        }
        // each definition is placed when it's assembled
        const current = definitions.find(
            (d) => this.pass.placements[d.index] !== undefined
        );
        if (current) {
            return current;
        }
        if (this.previous) {
            const previous = definitions.find(
                (d) => this.previous.placements[d.index] !== undefined
            );
            if (previous && (previous.kind !== 'label' || allowForward)) {
                return previous;
            }
        } else if (allowForward) {
            this.unknowns++;
            return undefined;
        }
        this.missing++;
        return undefined;
    }

    private lookup(
        variable: string,
        prefix: string,
        allowForward: boolean,
        evaluating: string[],
        location: els.Location
    ): Value | undefined {
        const name = this.resolve(prefix, variable);
        if (name === undefined) {
            if (REGISTERS.has(variable.toLowerCase())) {
                // most likely an instruction which doesn't exist,
                // e.g. ld hl,(ix), which is parsed as ld hl,(nn)
                this.error(
                    `Register '${variable}' can't be used here`,
                    location
                );
            } else {
                this.error(`Symbol '${variable}' not found`, location);
            }
            return undefined;
        }
        const missing = this.missing;
        const value = this.symbolValue(name, allowForward, evaluating);
        if (this.missing > missing) {
            // e.g. a label which hasn't been reached yet
            this.error(`Symbol '${variable}' not found`, location);
        }
        return value;
    }

    /**
     * Finds the full name of a symbol, looking in the current block, then
     * the blocks containing it
     */
    public resolve(prefix: string, variable: string): string | undefined {
        while (true) {
            if (this.definitions.has(prefix + variable)) {
                return prefix + variable;
            }
            if (prefix === '') {
                return undefined;
            }
            prefix = getReducedPrefix(prefix);
        }
    }

    private circularError(cycle: string[]) {
        // start the cycle with the first definition, so it's reported the
        // same way whichever symbol it was found from
        let first = 0;
        for (let i = 1; i < cycle.length; i++) {
            if (
                this.definitions.get(cycle[i])[0].index <
                this.definitions.get(cycle[first])[0].index
            ) {
                first = i;
            }
        }
        const ordered = [...cycle.slice(first), ...cycle.slice(0, first)];
        this.cycles++;
        this.error(
            `Circular definition: ${[...ordered, ordered[0]]
                .map(displayName)
                .join(' -> ')}`,
            this.definitions.get(ordered[0])[0].location
        );
    }
}

export class Programme {
    public ast: els.Element[];
    // the final values of the symbols, not including ones local to blocks
    public symbols: { [symbol: string]: Value } = {};
    public sources: Source[] = [];
    public macros = {};
    public errors = [];
    private fileResolver: FileResolver;
    // the libraries which have been loaded, by real filename
    private libraries = new Set<string>();
    // a symbol can have more than one definition, if they are in
    // different branches of an .if which uses symbols
    private definitions = new Map<string, SymbolDefinition[]>();
    // the final values of all the symbols
    private values = new Map<string, Value | undefined>();
    private finalPass: Pass | undefined;
    // routines in libraries which are used, so are assembled. Until this
    // is worked out, all routines are treated as being used.
    private usedRoutines: Set<string> | undefined;
    // errors found while this pass is running are kept with it
    private currentPass: Pass | undefined;

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

    /**
     * Calls func for each element in the ast, keeping track of the block
     * prefix, macros, and .if. Elements in code which isn't assembled
     * because of an .if are skipped, unless ignoreIf is true.
     *
     * An .if whose condition uses symbols is decided by evaluateIf, when
     * assembling. Before that (with no evaluateIf), both its branches are
     * treated as being assembled, and func is told they are conditional.
     */
    private iterateAst(
        func: (
            el: els.Element,
            index: number,
            prefix: string,
            inMacroDef: boolean,
            ifTrue: boolean,
            inMacroCall: boolean,
            conditional: boolean
        ) => void,
        ignoreIf = false,
        evaluateIf?: (el: els.If, index: number, prefix: string) => boolean
    ) {
        let inMacroDef = false;
        let inMacroCall = false;
        const prefixes = [];
        // state is whether the code is assembled, or 'both' if that isn't
        // known yet. condition is the .if's own condition.
        type IfState = boolean | 'both';
        const combine = (parent: IfState, condition: IfState): IfState =>
            parent === false || condition === false
                ? false
                : parent === 'both' || condition === 'both'
                ? 'both'
                : true;
        const ifStack: {
            state: IfState;
            condition: IfState;
            routine?: boolean;
        }[] = [{ state: true, condition: true }];
        // whether each routine being iterated has pushed a prefix
        const routinePrefixes: boolean[] = [];
        for (let i = 0; i < this.ast.length; i++) {
            const el = this.ast[i];
            const prefix = prefixes[prefixes.length - 1] || '';
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
                const parent = ifStack[ifStack.length - 1].state;
                let condition: IfState;
                if (parent === false) {
                    // an .if inside code which isn't being assembled is
                    // false, and isn't evaluated
                    condition = false;
                } else if (!els.isExpression(el.if)) {
                    condition = el.if !== 0;
                } else if (evaluateIf) {
                    condition = evaluateIf(el, i, prefix);
                } else {
                    condition = 'both';
                }
                ifStack.push({ state: combine(parent, condition), condition });
            }
            if (els.isElse(el) && ifStack.length > 1) {
                const { condition } = ifStack.pop();
                const parent = ifStack[ifStack.length - 1].state;
                const elseCondition =
                    condition === 'both' ? 'both' : !condition;
                ifStack.push({
                    state: combine(parent, elseCondition),
                    condition: elseCondition,
                });
            }
            if (els.isEndIf(el) && ifStack.length > 1) {
                ifStack.pop();
            }
            // a routine which isn't used isn't assembled, like a false .if
            if (els.isRoutine(el)) {
                const parent = ifStack[ifStack.length - 1].state;
                const used =
                    !this.usedRoutines || this.usedRoutines.has(el.routine);
                ifStack.push({
                    state: combine(parent, used),
                    condition: used,
                    routine: true,
                });
                routinePrefixes.push(els.isPrefixed(el));
            }
            if (els.isEndRoutine(el) && ifStack[ifStack.length - 1].routine) {
                ifStack.pop();
            }

            const state = ifStack[ifStack.length - 1].state;
            if (ignoreIf || state !== false) {
                func(
                    el,
                    i,
                    prefixes[prefixes.length - 1] || '',
                    inMacroDef,
                    state !== false,
                    inMacroCall,
                    state === 'both'
                );
            }

            if (els.isEndMacro(el)) {
                inMacroDef = false;
            }
            if (els.isEndMacroCall(el)) {
                inMacroCall = false;
            }
            if (els.isEndRoutine(el) && routinePrefixes.pop()) {
                prefixes.pop();
            }
        }
    }

    /**
     * Like iterateAst, but using the conditions of .ifs from the final
     * pass of assembling
     */
    private iterateAssembled(
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
        this.iterateAst(func, ignoreIf, (el, index) =>
            this.finalPass
                ? this.finalPass.conditions.get(index) === true
                : false
        );
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

        this.iterateAst(
            (el, i, prefix, inMacroDef, ifTrue, inMacroCall, conditional) => {
                if (
                    (els.isInclude(el) ||
                        els.isIncbin(el) ||
                        els.isLibrary(el)) &&
                    !el.included &&
                    conditional
                ) {
                    // files are included before .ifs which use symbols are
                    // evaluated
                    this.error(
                        `${
                            els.isInclude(el)
                                ? '.include'
                                : els.isIncbin(el)
                                ? '.incbin'
                                : '.library'
                        } can't be used inside an .if which uses symbols`,
                        el.location
                    );
                    el.included = true;
                    return;
                }
                if ((els.isInclude(el) || els.isLibrary(el)) && !el.included) {
                    const filename = els.isInclude(el)
                        ? el.include
                        : el.library;
                    if (!this.fileResolver.fileExists(filename)) {
                        this.error(
                            'File does not exist: ' +
                                this.fileResolver.getRealFilename(filename),
                            el.location
                        );
                        el.included = true;
                        return;
                    }
                    if (els.isLibrary(el)) {
                        // a library is only loaded once, and its routines
                        // are assembled where it's first used
                        const realFilename =
                            this.fileResolver.getRealFilename(filename);
                        el.included = true;
                        if (this.libraries.has(realFilename)) {
                            return;
                        }
                        this.libraries.add(realFilename);
                    }
                    const source = this.readSource(filename);
                    sourceIndices.push(sourceIndex);
                    sourceIndex = this.sources.length - 1;
                    const includeAst = this.parseLines(source, sourceIndex);
                    this.ast.splice(i + 1, 0, ...includeAst);
                    this.ast.splice(i + 1 + includeAst.length, 0, {
                        endinclude: sourceIndex,
                        location: {
                            // the line after the end of the file, not
                            // counting the empty string after a final newline
                            line:
                                source.length -
                                (source[source.length - 1] === '' ? 1 : 0) +
                                1,
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
            }
        );
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
        this.iterateAst(
            (el, i, prefix, inMacroDef, ifTrue, inMacroCall, conditional) => {
                if (els.isMacroDef(el)) {
                    if (macro) {
                        this.error('Cannot nest macros', el.location);
                        return;
                    }
                    if (conditional) {
                        // macros are expanded before .ifs which use symbols are
                        // evaluated
                        this.error(
                            "Macros can't be defined inside an .if which uses symbols",
                            el.location
                        );
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
            }
        );
        if (macro) {
            this.error(`Macro '${macroName}' doesn't finish`, macroLocation);
        }
        return this.macros;
    }

    /**
     * Works out which routines in libraries are used. A routine is used if
     * its name is in an expression which is assembled: outside a routine,
     * or in a routine which is used. Also checks that libraries only
     * contain routines, equs, macro definitions and other libraries
     * outside their routines, and that routines are only in libraries.
     */
    public selectRoutines() {
        // the names used in expressions in each routine, and outside them
        const routines = new Map<string, Set<string>>();
        const used = new Set<string>();
        let routine: Set<string> | undefined;
        // whether each file being included is a library
        const inLibrary: boolean[] = [false];
        this.iterateAst((el, i, prefix, inMacroDef) => {
            const library = inLibrary[inLibrary.length - 1];
            if (els.isInclude(el) && el.included) {
                // an included file is part of whatever included it
                inLibrary.push(library);
            } else if (els.isLibrary(el) && el.included) {
                if (routine) {
                    this.error(
                        ".library can't be used inside a .routine",
                        el.location
                    );
                }
                inLibrary.push(true);
            } else if (els.isEndInclude(el)) {
                inLibrary.pop();
            }
            if (inMacroDef) {
                // macro definitions are expanded where they're called
                return;
            }
            if (els.isRoutine(el)) {
                if (!library) {
                    this.error(
                        '.routine can only be used in a library',
                        el.location
                    );
                } else if (routine) {
                    this.error("Routines can't be nested", el.location);
                }
                routine = new Set<string>();
                if (routines.has(el.routine)) {
                    this.error(
                        `Routine '${el.routine}' already defined`,
                        el.location
                    );
                } else {
                    routines.set(el.routine, routine);
                }
                return;
            }
            if (els.isEndRoutine(el)) {
                if (!routine) {
                    this.error('.endroutine without .routine', el.location);
                }
                routine = undefined;
                return;
            }
            if (library && !routine && !this.allowedInLibrary(el, i)) {
                this.error(
                    'Code in a library must be inside a .routine',
                    el.location
                );
            }
            // the names this element uses
            for (const name of expressionVars(el)) {
                (routine || used).add(name);
            }
        });
        if (routine) {
            this.error('.routine without .endroutine');
        }

        // follow the routines which are used to the ones they use
        this.usedRoutines = new Set<string>();
        const names = [...used];
        while (names.length > 0) {
            const name = names.pop();
            if (routines.has(name) && !this.usedRoutines.has(name)) {
                this.usedRoutines.add(name);
                names.push(...routines.get(name));
            }
        }
    }

    /**
     * Whether an element can be outside a routine in a library
     */
    private allowedInLibrary(el: els.Element, index: number) {
        if (els.isLabel(el)) {
            // only if it's the label of an equ
            let next = index + 1;
            while (next < this.ast.length && els.isLabel(this.ast[next])) {
                next++;
            }
            return next < this.ast.length && els.isEqu(this.ast[next]);
        }
        return (
            els.isEqu(el) ||
            els.isComment(el) ||
            els.isError(el) ||
            els.isMacroDef(el) ||
            els.isEndMacro(el) ||
            els.isLibrary(el) ||
            els.isInclude(el) ||
            els.isEndInclude(el) ||
            els.isIf(el) ||
            els.isElse(el) ||
            els.isEndIf(el)
        );
    }

    /**
     * Records where each symbol is defined, and updates the parsed objects
     * so the block and endblock objects have prefixes
     *
     * Labels
     *  - don't allow label to redefined in the same block
     *  - relabel labels in blocks with %n_n_n... for blocks, unless they
     *    are public
     * Blocks / EndBlocks
     *  - count the block depth
     * Macrocall
     *  - add prefixes to parameter names, and define them as whatever
     *    they are being called with
     * Equ
     *  - must have a label
     *  - the labels are defined as the equ's expression
     */
    public getSymbols() {
        let nextBlock = 0;
        let blocks = [];
        const define = (name: string, definition: SymbolDefinition) => {
            if (!this.definitions.has(name)) {
                this.definitions.set(name, []);
            }
            this.definitions.get(name).push(definition);
        };
        this.iterateAst(
            (el, i, prefix, inMacroDef, ifTrue, inMacroCall, conditional) => {
                if (els.isLabel(el) && !inMacroDef) {
                    let name = el.label;
                    if (blocks.length > 0 && !el.public) {
                        name = labelName(blocks, el.label);
                    }
                    // a symbol can be defined more than once in .ifs which use
                    // symbols, and it's an error if more than one is assembled
                    const existing = this.definitions.get(name);
                    if (
                        existing &&
                        !(conditional && existing.every((d) => d.conditional))
                    ) {
                        this.error(
                            blocks.length > 0 && !el.public
                                ? `Label '${el.label}' already defined at in this block`
                                : `Label '${el.label}' already defined`,
                            el.location
                        );
                        return;
                    }
                    el.label = name;
                    define(name, {
                        kind: 'label',
                        index: i,
                        location: el.location,
                        conditional,
                    });
                } else if (els.isRoutine(el) && !inMacroDef) {
                    // a routine's name is a label, and it's a block, so
                    // labels in it are local to it
                    if (this.definitions.has(el.routine)) {
                        this.error(
                            `Routine '${el.routine}' has the same name as another symbol`,
                            el.location
                        );
                    } else {
                        define(el.routine, {
                            kind: 'label',
                            index: i,
                            location: el.location,
                            conditional,
                        });
                    }
                    blocks.push(nextBlock);
                    el.prefix = labelPrefix(blocks);
                    nextBlock++;
                } else if (els.isEndRoutine(el) && !inMacroDef) {
                    blocks.pop();
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
                        const param = labelName(blocks, el.params[j]);
                        el.params[j] = param;
                        if (el.args && el.args[j] !== undefined) {
                            define(param, {
                                kind: 'arg',
                                index: i,
                                value: el.args[j],
                                location: el.location,
                                conditional,
                            });
                        }
                    }
                } else if (els.isEqu(el)) {
                    if (i > 0 && els.isLabel(this.ast[i - 1])) {
                        let ii = i - 1;
                        let el2;
                        while ((el2 = this.ast[ii]) && els.isLabel(el2)) {
                            // the label is defined by the equ instead
                            const definitions = this.definitions.get(el2.label);
                            const index = definitions
                                ? definitions.findIndex((d) => d.index === ii)
                                : -1;
                            if (index !== -1) {
                                definitions[index] = {
                                    kind: 'equ',
                                    index: i,
                                    value: el.equ,
                                    location: el.location,
                                    conditional,
                                    labelIndex: ii,
                                };
                            }
                            ii--;
                        }
                    } else {
                        this.error('EQU has no label', el.location);
                        return;
                    }
                }
            }
        );
        if (blocks.length !== 0) {
            this.error('Mismatch between .block and .endblock statements');
        }
        return this.definitions;
    }

    private error(message, location?) {
        let error: els.Error;
        if (location !== undefined) {
            error = {
                error: message,
                location: location,
                source: this.sources[location.source].source[location.line - 1],
                filename: this.sources[location.source].name,
            };
        } else {
            error = {
                error: message,
                location: undefined,
                source: undefined,
                filename: undefined,
            };
        }
        if (this.currentPass) {
            this.currentPass.addError(error);
        } else {
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
     * Assigns addresses to labels and assembles the bytes. The size of
     * some elements (e.g. defw cat(label, "x")) can depend on the value of
     * labels defined later, so this is repeated, using the label values
     * from the previous pass for forward references, until the addresses
     * stop changing. Only errors from the last pass are reported, as
     * earlier passes may not have known the values of all the labels.
     */
    public assemble() {
        let previous: Pass | undefined;
        let pass: Pass;
        let settled = false;
        for (let n = 0; n < MAX_PASSES; n++) {
            pass = this.layoutPass(previous);
            if (previous && pass.sameAs(previous)) {
                settled = true;
                break;
            }
            previous = pass;
        }

        // work out the final values of all the symbols, which reports
        // errors in any which aren't used
        this.currentPass = pass;
        const evaluator = this.evaluator(pass, previous);
        for (const name of this.definitions.keys()) {
            const missing = evaluator.missing;
            const value = evaluator.symbolValue(name, true);
            // not including symbols which are only defined in code which
            // isn't assembled
            if (evaluator.missing === missing) {
                this.values.set(name, value);
            }
        }
        if (!settled) {
            const changed = [...pass.labels.keys()].filter(
                (label) =>
                    !Object.is(
                        pass.labels.get(label),
                        previous.labels.get(label)
                    )
            );
            this.error(
                changed.length > 0
                    ? `Could not resolve address of '${displayName(
                          changed[0]
                      )}' - forward references keep changing the size of the code`
                    : 'Could not resolve addresses - forward references keep changing the size of the code'
            );
        }
        this.currentPass = undefined;
        this.finalPass = pass;

        for (const error of pass.errors) {
            this.logError(error);
        }
        this.symbols = {};
        for (const [name, value] of this.values) {
            if (!name.startsWith('%') && value !== undefined) {
                this.symbols[name] = value;
            }
        }
    }

    private evaluator(pass: Pass, previous: Pass | undefined) {
        return new Evaluator(
            this.definitions,
            pass,
            previous,
            (message, location) => this.error(message, location)
        );
    }

    /**
     * One pass of assigning addresses and assembling bytes
     */
    private layoutPass(previous: Pass | undefined): Pass {
        const pass = new Pass();
        this.currentPass = pass;
        const evaluator = this.evaluator(pass, previous);
        // things which change the pc can't use forward references
        const pcValue = (value, prefix: string, pc: number) => {
            let result = evaluator.evaluate(value, prefix, pc, false);
            if (typeof result === 'string') {
                result = toUtf8(result).charCodeAt(0); // TODO test this
            }
            return result;
        };
        // pc starts at 0 unless org or phase changes it
        let pc = 0;
        let out = 0;
        let origin: number | undefined;
        // .ifs which use symbols can't use forward references either
        const evaluateIf = (el: els.If, i: number, prefix: string) => {
            const value = evaluator.evaluate(el.if, prefix, pc, false);
            const condition = value !== undefined && value !== 0;
            pass.conditions.set(i, condition);
            return condition;
        };
        // symbols defined so far in this pass
        const defined = new Set<string>();
        this.iterateAst(
            (el, i, prefix, inMacroDef) => {
                if (inMacroDef) {
                    // macro definitions are assembled where they're called
                    return;
                }
                if (els.isLabel(el) || els.isRoutine(el)) {
                    // a routine's name is a label
                    const name = els.isLabel(el) ? el.label : el.routine;
                    const definition = this.definitions
                        .get(name)
                        ?.find(
                            (d) =>
                                (d.kind === 'equ' ? d.labelIndex : d.index) ===
                                i
                        );
                    if (!definition) {
                        // an error was reported when getting the symbols
                        return;
                    }
                    if (defined.has(name)) {
                        // defined in more than one .if branch which is assembled
                        this.error(
                            `Label '${displayName(name)}' already defined`,
                            el.location
                        );
                        return;
                    }
                    defined.add(name);
                    if (definition.kind === 'label') {
                        pass.labels.set(name, pc);
                        pass.placements[i] = { address: pc, out };
                    }
                } else if (els.isEqu(el) || els.isMacroCall(el)) {
                    // so $ can be evaluated in the equ or macro arguments
                    pass.placements[i] = { address: pc, out };
                } else if (els.isDefs(el)) {
                    const size = pcValue(el.defs, prefix, pc);
                    // TODO what if size can't be evaluated
                    pass.placements[i] = { address: pc, out, size };
                    pc += size;
                    out += size;
                } else if (els.isOrg(el)) {
                    pc = pcValue(el.org, prefix, pc);
                    out = pc;
                } else if (els.isPhase(el)) {
                    pc = pcValue(el.phase, prefix, pc);
                } else if (els.isEndPhase(el)) {
                    pc = out;
                } else if (els.isAlign(el)) {
                    const align = pcValue(el.align, prefix, pc);
                    const add = align - (pc % align);
                    if (add !== align) {
                        pc += add;
                        out += add;
                    }
                } else if (els.isBytes(el)) {
                    const bytes = this.encode(evaluator, el, prefix, pc);
                    if (bytes.length > 0) {
                        if (origin === undefined) {
                            origin = out;
                        } else if (out < origin) {
                            this.error(
                                'Cannot ORG to earlier address than first ORG',
                                el.location
                            );
                        }
                    }
                    pass.placements[i] = { address: pc, out, bytes };
                    pc += bytes.length;
                    out += bytes.length;
                }
            },
            false,
            evaluateIf
        );
        this.currentPass = undefined;
        return pass;
    }

    /**
     * Works out the bytes for an instruction, db or dw
     */
    private encode(
        evaluator: Evaluator,
        el: els.Bytes,
        prefix: string,
        address: number
    ): number[] {
        if (!el.references) {
            return el.bytes as number[];
        }
        const bytes: number[] = [];
        for (let i = 0; i < el.bytes.length; i++) {
            const byte = el.bytes[i];
            if (byte && els.isRelative(byte)) {
                let value = evaluator.evaluate(
                    byte.relative,
                    prefix,
                    address,
                    true
                );
                if (typeof value === 'string') {
                    const utf8 = toUtf8(value);
                    value = utf8.charCodeAt(0); // TODO test this - treat as signed value??
                }
                const relative = value - (address + 2);
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
                bytes.push(relative & 0xff);
            } else if (byte && els.isExpression(byte)) {
                // a 16 bit value is followed by a null for its high byte
                const word = el.bytes[i + 1] === null;
                if (word) {
                    i++;
                }
                const value = evaluator.evaluate(byte, prefix, address, true);
                if (typeof value === 'string') {
                    const utf8 = toUtf8(value);
                    if (els.isDefb(el) || els.isDefw(el)) {
                        for (let j = 0; j < utf8.length; j++) {
                            bytes.push(utf8.charCodeAt(j));
                        }
                        if (els.isDefw(el) && utf8.length % 2 === 1) {
                            bytes.push(0);
                        }
                    } else {
                        bytes.push(utf8.charCodeAt(0));
                        if (word) {
                            bytes.push(utf8.charCodeAt(1));
                        }
                    }
                } else if (els.isDefb(el) || els.isDefw(el)) {
                    // db and dw just use the low byte or word, but
                    // division by zero is still an error
                    if (value !== undefined && !Number.isFinite(value)) {
                        this.error(
                            `Invalid value ${value} in ${
                                els.isDefb(el) ? 'db' : 'dw'
                            }`,
                            byte.location || el.location
                        );
                    }
                    bytes.push(value & 0xff);
                    if (els.isDefw(el)) {
                        bytes.push((value >> 8) & 0xff);
                    }
                } else {
                    this.checkRange(
                        value,
                        byte.offset ? 'offset' : word ? 'word' : 'byte',
                        byte.location || el.location
                    );
                    bytes.push(value & 0xff);
                    if (word) {
                        bytes.push((value >> 8) & 0xff);
                    }
                }
            } else {
                bytes.push(byte as number);
            }
        }
        return bytes;
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

    /**
     * Groups the elements into source lines for the listing, with the
     * addresses and bytes from the final pass
     */
    public collectAst() {
        const collectedAst = [];
        const placements = this.finalPass ? this.finalPass.placements : [];
        let line = 0;
        let source = 0;
        let ast: any = {};
        this.iterateAssembled(
            (el, i, prefix, inMacroDef, ifTrue, inMacroCall) => {
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
                    ast.location = el.location;
                }
                for (const key of [
                    'macrocall',
                    'endinclude',
                    'endmacrocall',
                    'undoc',
                    'error',
                ]) {
                    if (key in el) {
                        ast[key] = el[key];
                    }
                }
                const placement = placements[i];
                if (els.isBytes(el)) {
                    ast.bytes = placement ? placement.bytes : el.bytes;
                }
                if ((els.isBytes(el) || els.isDefs(el)) && placement) {
                    ast.address = placement.address;
                    ast.out = placement.out;
                }
                if (inMacroDef) {
                    ast.inMacroDef = true;
                }
                if (inMacroCall) {
                    ast.inMacroCall = true;
                }
                ast.ifTrue = ifTrue;
                ast.prefix = prefix;
            },
            true
        );
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

            // the end of an include is after the last line of the file,
            // so it isn't a line of source
            if (!el.endinclude) {
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
            }

            // if (el.macrocall && !el.inMacroDef) {
            //     list.push('           ' + ' '.repeat(BYTELEN * 2) + '  *UNROLL MACRO')
            // }

            if (el.endinclude) {
                list.push(
                    ` ${pad(
                        el.location.line,
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

        for (const [symbol, value] of this.values) {
            if (!symbol.startsWith('%')) {
                if (value === undefined) {
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
        this.iterateAssembled((el) => {
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

    /**
     * The assembled bytes, from the first byte output to the last. Gaps
     * (e.g. from org or ds) are filled with zeros.
     */
    public getBytes() {
        const bytes = [];
        const segments = this.getSegments();
        if (segments.length === 0) {
            return bytes;
        }
        const origin = segments[0].address;
        for (const segment of segments) {
            while (origin + bytes.length < segment.address) {
                bytes.push(0);
            }
            // not using concat or push(...), as they are slow or
            // can overflow the stack with large arrays
            for (const byte of segment.bytes) {
                bytes.push(byte);
            }
        }
        return bytes;
    }

    /**
     * The assembled bytes, as contiguous blocks with the address they are
     * output at. ds doesn't output any bytes, so it separates blocks.
     */
    public getSegments(): Segment[] {
        // bytes by output address. Later bytes overwrite earlier ones,
        // when org goes back to an earlier address.
        const memory = new Map<number, number>();
        let origin: number | undefined;
        this.forEachPlacement((el, placement) => {
            if (!placement.bytes || placement.bytes.length === 0) {
                return;
            }
            if (origin === undefined) {
                origin = placement.out;
            } else if (placement.out < origin) {
                // reported as an error when assembling
                return;
            }
            for (let i = 0; i < placement.bytes.length; i++) {
                memory.set(placement.out + i, placement.bytes[i]);
            }
        });
        const addresses = [...memory.keys()].sort((a, b) => a - b);
        const segments: Segment[] = [];
        let segment: Segment | undefined;
        for (const address of addresses) {
            if (
                !segment ||
                address !== segment.address + segment.bytes.length
            ) {
                segment = { address, bytes: [] };
                segments.push(segment);
            }
            segment.bytes.push(memory.get(address));
        }
        return segments;
    }

    /**
     * The source lines which produced bytes, in the order they were
     * assembled
     */
    public getLines(): Line[] {
        const lines: Line[] = [];
        // bytes from a macro are counted as coming from the line which
        // called it (the outermost one, if macros call macros)
        let macroCall: els.Location | undefined;
        let macroDepth = 0;
        let last: Line | undefined;
        let lastLocation: els.Location | undefined;
        this.forEachPlacement((el, placement) => {
            if (els.isMacroCall(el)) {
                if (macroDepth === 0) {
                    macroCall = el.location;
                }
                macroDepth++;
                return;
            }
            if (els.isEndMacroCall(el)) {
                macroDepth--;
                return;
            }
            const length = placement.bytes
                ? placement.bytes.length
                : placement.size;
            if (!(length > 0)) {
                return;
            }
            const location = macroDepth > 0 ? macroCall : el.location;
            const data = els.isDefb(el) || els.isDefw(el) || els.isDefs(el);
            if (
                last &&
                lastLocation.source === location.source &&
                lastLocation.line === location.line
            ) {
                last.length += length;
                last.data = last.data && data;
                return;
            }
            last = {
                file: this.sources[location.source].name,
                line: location.line,
                address: placement.address,
                out: placement.out,
                length,
                source: this.sources[location.source].source[location.line - 1],
                data,
            };
            lastLocation = location;
            lines.push(last);
        });
        return lines;
    }

    /**
     * Calls func for each element which was assembled, with where it was
     * placed in the final pass. Macro calls and their ends are included,
     * with an empty placement for the ends.
     */
    private forEachPlacement(
        func: (el: els.Element, placement: Placement) => void
    ) {
        if (!this.finalPass) {
            return;
        }
        const placements = this.finalPass.placements;
        this.iterateAssembled((el, i, prefix, inMacroDef) => {
            if (inMacroDef) {
                return;
            }
            if (placements[i]) {
                func(el, placements[i]);
            } else if (els.isEndMacroCall(el)) {
                func(el, { address: undefined, out: undefined });
            }
        });
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

/**
 * The names of all the symbols used in expressions in an element
 */
function expressionVars(value: any, names = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
        for (const item of value) {
            expressionVars(item, names);
        }
    } else if (value && typeof value === 'object') {
        if (els.isExpression(value) && Array.isArray(value.vars)) {
            for (const name of value.vars) {
                names.add(name);
            }
        }
        for (const key of Object.keys(value)) {
            if (key !== 'location' && key !== 'vars') {
                expressionVars(value[key], names);
            }
        }
    }
    return names;
}

/**
 * The name of a symbol without the prefix for the block it's in
 */
function displayName(symbol: string) {
    return symbol.replace(/^(%[0-9]+_)+/, '');
}

function toUtf8(s) {
    return unescape(encodeURIComponent(s));
}
