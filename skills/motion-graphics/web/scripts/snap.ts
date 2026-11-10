#!/usr/bin/env bun
// Screenshot any local HTML file or URL: bun scripts/snap.ts <file|url> <out.png> [--w 1280] [--h 800] [--full] [--dpr 1]
import { chromium } from 'playwright-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [src, out = 'out/snap.png'] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const opt = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1]! : d; };
if (!src) throw new Error('usage: bun scripts/snap.ts <file|url> <out.png>');
const url = /^https?:/.test(src) ? src : pathToFileURL(path.resolve(src)).href;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +opt('w', '1280'), height: +opt('h', '800') }, deviceScaleFactor: +opt('dpr', '1') });
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, fullPage: process.argv.includes('--full') });
await browser.close();
console.log(out);
