import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import process from "process";
import { sveltePreprocess } from "svelte-preprocess";


esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: ['obsidian', 'moment'],
    format: 'cjs',
    minify: true,
    logLevel: "info",
    treeShaking: true,
    plugins: [sveltePlugin({
        compilerOptions: {
            css: 'injected',
            dev: false,
        },
        preprocess: sveltePreprocess(),
    })],
    outfile: 'main.js',
}).catch(() => process.exit(1));