import * as compiler from './compiler';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import * as fs from 'fs';

// relative to lib/cli.js once compiled, or src/cli.ts
const { version } = require('../package.json');

const optionDefinitions = [
    {
        name: 'src',
        alias: 's',
        type: String,
        multiple: false,
        defaultOption: true,
    },
    { name: 'out', alias: 'o', type: String, multiple: false },
    { name: 'list', alias: 'l', type: String, multiple: false },
    {
        name: 'brief',
        alias: 'b',
        type: Boolean,
        multiple: false,
        description: 'Show brief errors',
    },
    {
        name: 'undoc',
        alias: 'u',
        type: Boolean,
        multiple: false,
        description: 'Warn about undocumented instructions',
    },
    { name: 'help', alias: 'h', type: Boolean, multiple: false },
    {
        name: 'path',
        alias: 'p',
        type: String,
        multiple: true,
        description: 'Search for include files in these paths',
    },
];
function showUsage() {
    console.log(
        commandLineUsage([
            {
                header: `MAZ v${version}`,
                content: 'Macro Assembler for Z80',
            },
            {
                header: 'Options',
                optionList: optionDefinitions,
            },
        ])
    );
}

/**
 * Runs maz with some command line arguments, and returns the exit code
 */
export function main(args: string[]): number {
    const options = commandLineArgs(optionDefinitions, { argv: args });

    if (!options.src || !options.out || options.help) {
        showUsage();
        return -1;
    }

    console.log(`MAZ v${version}`);
    console.log(
        'WARNING: maz is under development, and likely to break without'
    );
    console.log(
        '         warning, and future versions will probably be completely'
    );
    console.log('         incompatible.');

    console.log(`Assembling ${options.src}`);

    const prog = compiler.compile(options.src, {
        trace: false,
        warnUndocumented: options.undoc,
        brief: options.brief,
        searchPaths: options.path,
    });
    let exitCode = 0;
    if (prog.errors.length === 0) {
        const bytes = prog.getBytes();
        fs.writeFileSync(options.out, Buffer.from(bytes));
        console.log(
            `Written ${bytes.length} ($${bytes.length.toString(16)}) bytes ${
                options.out
            }`
        );
    } else {
        console.log(
            `${prog.errors.length} error${
                prog.errors.length > 1 ? 's' : ''
            } found`
        );
        exitCode = 64;
    }
    if (options.list !== undefined) {
        const list = prog.getList(options.undoc);
        fs.writeFileSync(
            options.list,
            list.map((line) => line + '\n').join('')
        );
        console.log(`List written to ${options.list}`);
    }
    return exitCode;
}
