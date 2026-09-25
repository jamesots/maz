import * as compiler from '../lib/compiler';
import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
const expect = chai.expect;

// Assembles each example and compares the output, errors and listing with
// a saved snapshot. Run with UPDATE_SNAPSHOTS=1 to save new snapshots, after
// checking that any differences are expected.

const examples = [
    { file: 'all.z80' },
    { file: 'broke.z80' },
    { file: 'broke2.z80' },
    { file: 'incbin.z80' },
    {
        file: 'search.z80',
        searchPaths: ['examples/another_dir', 'examples/search_dir_2'],
    },
    { file: 'test.z80' },
    { file: 'z80monitor.z80' },
];

function hexLines(bytes: number[]) {
    const lines = [];
    for (let i = 0; i < bytes.length; i += 32) {
        lines.push(
            bytes
                .slice(i, i + 32)
                .map((byte) => (byte & 0xff).toString(16).padStart(2, '0'))
                .join('')
        );
    }
    return lines;
}

function assemble(file: string, searchPaths?: string[]) {
    // errors are logged to the console as they are found
    const log = console.log;
    console.log = () => {};
    try {
        const prog = compiler.compile(path.join('examples', file), {
            searchPaths,
        });
        const bytes = prog.getBytes();
        return {
            errors: prog.errors.map((e) =>
                e.location
                    ? `${e.filename}:${e.location.line}: ${e.error}`
                    : `${e.error}`
            ),
            bytes: hexLines(bytes),
            list: prog.getList(true),
        };
    } finally {
        console.log = log;
    }
}

describe('examples', function () {
    for (const example of examples) {
        it(`should assemble ${example.file} the same as before`, function () {
            const snapshotFile = path.join(
                'test',
                'snapshots',
                example.file.replace(/\.z80$/, '.json')
            );
            const actual = assemble(example.file, example.searchPaths);
            if (process.env.UPDATE_SNAPSHOTS) {
                fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
                fs.writeFileSync(
                    snapshotFile,
                    JSON.stringify(actual, undefined, 2) + '\n'
                );
            }
            const expected = JSON.parse(
                fs.readFileSync(snapshotFile).toString()
            );
            expect(actual).to.eql(expected);
        });
    }
});
