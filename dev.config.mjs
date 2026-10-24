import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import { sveltePreprocess } from "svelte-preprocess";


const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: ['obsidian'],
    format: 'cjs',
    minify: true,
    logLevel: "info",
    plugins: [sveltePlugin({
        compilerOptions: {
            css: 'injected',
            dev: true,
        },
        preprocess: sveltePreprocess(),
    })],
    outfile: 'main.js',
});

await ctx.watch();