import js from "@eslint/js";
import next from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

const config = [
    js.configs.recommended,
    ...next,
    ...nextTypescript,
];

export default config;
