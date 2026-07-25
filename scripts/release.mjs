#!/usr/bin/env bun
/**
 * changesets/action runs publish on every main push without pending changesets.
 * Skip cleanly when package.json version is already on npm (avoids red CI).
 */
import { $ } from 'bun';
import { readFileSync } from 'node:fs';

const { version, name } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const published = (await $`npm view ${ name } version`.nothrow().quiet()).text().trim();

if (published === version) {
    console.log(`${ name }@${ version } is already on npm — nothing to publish`);
    process.exit(0);
}

console.log(`Publishing ${ name }@${ version } (npm has ${ published || 'nothing' })`);
await $`changeset publish`;
