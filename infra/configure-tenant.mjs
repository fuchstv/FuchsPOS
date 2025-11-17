#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const HELP = `Usage: pnpm run configure-tenant -- --id <name> [options]\n\nOptions:\n  --id <name>            Required tenant identifier (e.g. demo, staging).\n  --from <file>          Source env template (defaults to .env.example).\n  --force                Overwrite the target file if it already exists.\n  --set KEY=value        Override or add variables. Repeatable.\n  --help                 Show this message.\n`;

function parseArgs(argv) {
  const args = { overrides: new Map() };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    switch (value) {
      case '--':
        // pnpm forwards a standalone `--` separator that should be ignored
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--id':
        args.id = argv[++i];
        break;
      case '--from':
        args.from = argv[++i];
        break;
      case '--force':
        args.force = true;
        break;
      case '--set':
        {
          const pair = argv[++i];
          if (!pair || !pair.includes('=')) {
            throw new Error('Expected --set KEY=value');
          }
          const [key, ...rest] = pair.split('=');
          const val = rest.join('=');
          args.overrides.set(key.trim(), val.trim());
        }
        break;
      default:
        if (value.startsWith('--set')) {
          const [, pair] = value.split('=');
          const key = value.slice('--set'.length);
          if (!pair) {
            throw new Error(`Unknown argument: ${value}`);
          }
        } else if (value.startsWith('--')) {
          throw new Error(`Unknown argument: ${value}`);
        }
    }
  }
  return args;
}

function applyOverrides(content, overrides) {
  if (!overrides.size) return { content, appended: [] };
  const lines = content.split(/\r?\n/);
  const remaining = new Map(overrides);
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z0-9_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });

  const appended = [];
  for (const [key, value] of remaining.entries()) {
    appended.push(`${key}=${value}`);
  }
  if (appended.length) {
    updatedLines.push('', ...appended);
  }

  return { content: updatedLines.join('\n'), appended };
}

async function ensureWritable(targetPath, force) {
  try {
    await access(targetPath, constants.F_OK);
    if (!force) {
      throw new Error(`Target ${path.basename(targetPath)} already exists. Use --force to overwrite.`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  if (!args.id) {
    throw new Error('Missing required --id <name> argument.');
  }

  const sourceFile = path.resolve(repoRoot, args.from ?? '.env.example');
  const targetFile = path.resolve(repoRoot, `.env.${args.id}`);

  const template = await readFile(sourceFile, 'utf8');
  await ensureWritable(targetFile, args.force);

  const { content, appended } = applyOverrides(template, args.overrides);
  await writeFile(targetFile, content, 'utf8');

  console.log(`Created ${path.basename(targetFile)} from ${path.relative(repoRoot, sourceFile)}.`);
  if (appended.length) {
    console.log('Added variables:');
    appended.forEach((line) => console.log(`  - ${line}`));
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
