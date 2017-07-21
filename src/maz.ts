#!/usr/bin/env node
import * as compiler from './compiler';
import * as commandLineArgs from 'command-line-args';
import * as commandLineUsage from 'command-line-usage';
import * as fs from 'fs';
import * as sourceMapSupport from 'source-map-support';

sourceMapSupport.install();

const optionDefinitions = [
    { name: 'src', alias: 's', type: String, multiple: false, defaultOption: true },
    { name: 'out', alias: 'o', type: String, multiple: false },
    { name: 'list', alias: 'l', type: String, multiple: false },
    { name: 'help', alias: 'h', type: Boolean, multiple: false }
];
const options = commandLineArgs(optionDefinitions);

function showUsage() {
    console.log(commandLineUsage([
        {
            header: 'MAZ v0.1.0',
            content: 'Macro Assembler for Z80'
        },
        {
            header: 'Options',
            optionList: optionDefinitions
        }]));
}

if (!options.src || !options.out || options.help) {
    showUsage();
    process.exit(-1);
}

console.log("MAZ v0.1.1");
console.log("WARNING: maz is under development, and likely to break without");
console.log("         warning, and future versions will probably be completely");
console.log("         incompatible.");

const source = fs.readFileSync(options.src).toString();
console.log(`Compiling ${options.src}`);

try {
    let [ast, symbols] = compiler.compile(source, {trace: false});
    // console.log(JSON.stringify(ast, undefined, 2));
    // console.log(JSON.stringify(symbols, undefined, 2));
    const bytes = compiler.getBytes(ast);
    // console.log(JSON.stringify(bytes, undefined, 2));

    fs.writeFileSync(options.out, Buffer.from(bytes));
    console.log(`Written ${bytes.length} ($${bytes.length.toString(16)}) bytes ${options.out}`);
    if (options.list) {
        const list = compiler.getList(source, ast, symbols);
        const file = fs.openSync(options.list, 'w');
        for (const line of list) {
            fs.writeSync(file, line);
            fs.writeSync(file, '\n');
        }
        fs.closeSync(file);
    }
    console.log(`List written to ${options.list}`);

} catch (e) {
    if (e.name === "SyntaxError") {
        console.log(`Syntax error on line ${e.location.start.line} col ${e.location.start.column}`);
        console.log(e.message);
        console.log('> ' + source.split('\n')[e.location.start.line - 1]);
        console.log('> ' + ' '.repeat(e.location.start.column - 1) + '^');
    } else {
        console.log(e);
    }
}
