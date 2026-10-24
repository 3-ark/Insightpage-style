import svelte from "rollup-plugin-svelte";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import { sveltePreprocess } from "svelte-preprocess";
import typescript from "@rollup/plugin-typescript";

export default {
    input: "src/main.ts",
    output: {
        format: "cjs",
        file: "main.js",
        sourcemap: "inline",
        exports: "default",
        // banner
    },
    external: ["obsidian"],
    plugins: [
        svelte({
            emitCss: false,
            preprocess: sveltePreprocess(),
        }),
        typescript(),
        resolve({
            browser: true,
            dedupe: ["svelte"],
        }),
        commonjs(),
    ],
};