// Temporary Base44 check config: same build, output redirected so the tracked dist/ stays untouched.
import { defineConfig } from '@rsbuild/core';
import baseConfig from './rsbuild.config';

const base = baseConfig as any;

export default defineConfig({
    ...base,
    output: {
        ...base.output,
        distPath: { ...(base.output?.distPath ?? {}), root: './.tmp-build-dist' },
    },
});
