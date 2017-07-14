import * as compiler from './compiler';
import * as commandLineArgs from 'command-line-args';
import * as fs from 'fs';

const optionDefinitions = [
    { name: 'src', type: String, multiple: false, defaultOption: true },
    { name: 'out', type: String, multiple: false }
];
const options = commandLineArgs(optionDefinitions);

console.log("MAZ v0.1.0");

console.log(JSON.stringify(options));

const source = fs.readFileSync(options.src).toString();

let [ast, symbols] = compiler.compile(source);
console.log(JSON.stringify(ast, undefined, 2));
console.log(JSON.stringify(symbols, undefined, 2));
const bytes = compiler.getBytes(ast);
console.log(JSON.stringify(bytes, undefined, 2));

fs.writeFileSync(options.out, Buffer.from(bytes));

