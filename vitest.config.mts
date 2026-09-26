import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.spec.ts'],
        // the compiler logs errors, which isn't interesting unless a test fails
        silent: 'passed-only',
        coverage: {
            include: ['src/**/*.ts'],
        },
    },
});
