#!/usr/bin/env node
/*
 * CLI to fetch APL files, read first line for Upstream reference, fetch upstream, emit JSON.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseUpstream(firstLine) {
  // Example: ## Upstream: https://github.com/.../path/file.simc
  const prefix = '## Upstream:';
  if (!firstLine.startsWith(prefix)) return null;
  const url = firstLine.slice(prefix.length).trim();
  if (!/^https?:\/\//.test(url)) return null;
  // Convert to raw if it's a GitHub web URL not already raw
  if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
    // Transform https://github.com/owner/repo/blob/branch/path -> https://raw.githubusercontent.com/owner/repo/branch/path
    const m = url.match(/https:\/\/github.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
    if (m) {
      return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
    }
  }
  return url;
}

async function run() {
  let files = process.argv.slice(2);
  if (!files.length) {
    // Attempt to read default list from apl-files.txt (one raw URL per line, # for comments)
    const listPath = path.join(__dirname, 'apl-files.txt');
    try {
      const listRaw = await fs.readFile(listPath, 'utf8');
      files = listRaw
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    } catch (e) {
      console.error('No URLs provided and failed to read apl-files.txt:', e.message);
    }
  }
  if (!files.length) {
    console.error('Usage: fetch-apls <raw_url1> <raw_url2> ...');
    console.error('Or create scripts/apl-files.txt with one raw URL per line.');
    process.exit(1);
  }
  const results = [];
  for (const url of files) {
    try {
      const baseContent = await fetchText(url);
      const firstLine = baseContent.split(/\r?\n/)[0];
      const upstreamUrl = parseUpstream(firstLine);
      let upstreamContent = null;
      if (upstreamUrl) {
        try {
          upstreamContent = await fetchText(upstreamUrl);
        } catch (e) {
          console.warn(`Warning: failed to fetch upstream ${upstreamUrl}: ${e.message}`);
        }
      }
      results.push({
        sourceUrl: url,
        upstreamUrl,
        firstLine,
        sourceContent: baseContent,
        upstreamContent
      });
    } catch (e) {
      console.error(`Error processing ${url}:`, e.message);
      results.push({ sourceUrl: url, error: e.message });
    }
  }
  const outDir = path.join(__dirname, '..', 'public');
  const outFile = path.join(outDir, 'apl-data.json');
  await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), items: results }, null, 2));
  console.log(`Wrote ${outFile}`);
}

run().catch(e => { console.error(e); process.exit(1); });
