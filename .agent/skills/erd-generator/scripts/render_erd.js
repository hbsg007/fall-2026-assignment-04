#!/usr/bin/env node
/**
 * render_erd.js
 *
 * Validates a Mermaid ERD file and compiles it to an SVG using the
 * project's @mermaid-js/mermaid-cli (`npx mmdc`).
 *
 * Usage (run from the repository root):
 *   node .agent/skills/erd-generator/scripts/render_erd.js docs/architecture/schema.mmd
 *
 * Success: writes docs/architecture/erd.svg, prints "SUCCESS", exits 0.
 * Failure: prints "SYNTAX_ERROR:" followed by the mmdc stderr trace, exits 1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const inputArg = process.argv[2] ?? 'docs/architecture/schema.mmd';
const inputPath = path.resolve(process.cwd(), inputArg);
const outputPath = path.join(path.dirname(inputPath), 'erd.svg');

if (!existsSync(inputPath)) {
  console.error(`ERROR: Input file not found: ${inputArg}`);
  process.exit(1);
}

const args = ['mmdc', '-i', inputPath, '-o', outputPath];

// Headless Chrome refuses to start as root (e.g. inside Docker/CI) unless
// its sandbox is disabled, so pass a puppeteer config only in that case.
let tempDir;
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  tempDir = mkdtempSync(path.join(tmpdir(), 'render-erd-'));
  const configPath = path.join(tempDir, 'puppeteer.json');
  writeFileSync(configPath, JSON.stringify({ args: ['--no-sandbox'] }));
  args.push('-p', configPath);
}

// Remove any stale render so a failed run can never leave an old SVG behind.
rmSync(outputPath, { force: true });

const result = spawnSync('npx', args, {
  encoding: 'utf8',
  shell: process.platform === 'win32', // npx is npx.cmd on Windows
});

if (tempDir) rmSync(tempDir, { recursive: true, force: true });

const failed =
  result.error || result.status !== 0 || !existsSync(outputPath);

if (failed) {
  const trace = (
    result.stderr ||
    result.error?.message ||
    result.stdout ||
    'mmdc failed without producing an SVG'
  ).trim();
  rmSync(outputPath, { force: true });
  console.error(`SYNTAX_ERROR:\n${trace}`);
  process.exit(1);
}

console.log('SUCCESS');
console.log(`SVG written to ${path.relative(process.cwd(), outputPath)}`);
process.exit(0);
