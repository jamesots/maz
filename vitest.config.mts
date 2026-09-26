import { defineConfig, type Plugin } from 'vitest/config';
import peggy from 'peggy';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generates src/*.js from src/*.pegjs when vitest starts, and again when a
 * grammar changes, so the tests use the latest parsers. The tests import
 * the generated files, so vitest runs them again when they change.
 */
function peggyPlugin(): Plugin {
    const generate = (grammarFile: string) => {
        const outputFile = grammarFile.replace(/\.pegjs$/, '.js');
        try {
            const source = peggy.generate(
                fs.readFileSync(grammarFile).toString(),
                {
                    output: 'source',
                    format: 'commonjs',
                    grammarSource: grammarFile,
                }
            );
            fs.writeFileSync(outputFile, source);
        } catch (e) {
            // the tests which use the parser will fail, as it hasn't changed
            console.error(`Error in ${grammarFile}: ${e}`);
        }
    };
    return {
        name: 'maz-peggy',
        configureServer(server) {
            const grammars = fs
                .readdirSync('src')
                .filter((file) => file.endsWith('.pegjs'))
                .map((file) => path.resolve('src', file));
            grammars.forEach(generate);
            server.watcher.add(grammars);
            server.watcher.on('change', (file) => {
                if (file.endsWith('.pegjs')) {
                    generate(file);
                }
            });
        },
    };
}

export default defineConfig({
    plugins: [peggyPlugin()],
    test: {
        include: ['test/**/*.spec.ts'],
        // the examples are read by the tests, rather than imported, so
        // vitest doesn't know to run the tests again when they change
        forceRerunTriggers: ['**/examples/**/*.z80'],
        // the compiler logs errors, which isn't interesting unless a test fails
        silent: 'passed-only',
        coverage: {
            include: ['src/**/*.ts'],
        },
    },
});
