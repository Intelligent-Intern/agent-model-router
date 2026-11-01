#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ZodError } from 'zod';
import { loadConfig } from './config.js';
import { HeuristicRouter } from './router.js';
import { createMcpServer } from './mcp.js';
import { VERSION } from './version.js';
const help = `agent-model-router ${VERSION}

Usage:
  agent-model-router select --task "..." [--context "..."] [--priority balanced]
  echo '{"task":"..."}' | agent-model-router select
  agent-model-router serve [--config registry.json]
  agent-model-router validate [--config registry.json]

Options:
  --config PATH                Explicit complete JSON configuration (no merging)
  --priority VALUE             quality | balanced | speed | cost
  --available-models ID,ID      Restrict to host-reported available model IDs
  --explain                    Include category, scores, fallbacks and warnings
  --help                       Show usage
  --version                    Show package version

Routing is offline. serve reserves stdout for MCP; diagnostics go to stderr.
`;
async function readInput(): Promise<unknown> {
  if (process.stdin.isTTY) throw new Error('Provide --task or a JSON object on stdin');
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (Buffer.byteLength(text, 'utf8') > 262_144) throw new Error('Input exceeds 256 KiB');
  }
  try { return JSON.parse(text) as unknown; } catch { throw new Error('Expected a JSON object on stdin'); }
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    task: { type: 'string' }, context: { type: 'string' }, priority: { type: 'string' },
    config: { type: 'string' }, 'available-models': { type: 'string' },
    explain: { type: 'boolean' }, help: { type: 'boolean' }, version: { type: 'boolean' },
  } });
  if (values.help) { console.log(help); return; }
  if (values.version) { console.log(VERSION); return; }
  const command = positionals[0] ?? 'select';
  if (positionals.length > 1 || !['select', 'serve', 'validate'].includes(command)) throw new Error('Unknown command; use --help');
  if (command !== 'select' && ['task', 'context', 'priority', 'available-models', 'explain'].some(k => values[k as keyof typeof values] !== undefined)) throw new Error('Routing flags require the select command');
  const config = await loadConfig(values.config);
  if (command === 'validate') { console.log(JSON.stringify({ valid: true, registry_version: config.registry_version, models: config.models.length })); return; }
  const router = new HeuristicRouter(config);
  if (command === 'serve') {
    const handle = serveStdio(() => createMcpServer(router));
    const close = () => { void handle.close().catch(() => { process.exitCode = 1; }); };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    return;
  }
  let input: unknown = values.task === undefined ? await readInput() : { task: values.task };
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    input = { ...input,
      ...(values.context === undefined ? {} : { context: values.context }),
      ...(values.priority === undefined ? {} : { priority: values.priority }),
      ...(values['available-models'] === undefined ? {} : { available_models: values['available-models'].split(',').map(s => s.trim()) }),
    };
  }
  console.log(JSON.stringify(values.explain ? router.explain(input) : router.select(input), null, 2));
}
void main().catch((error: unknown) => {
  const message = error instanceof ZodError
    ? error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')
    : error instanceof Error ? error.message : 'Unexpected error';
  console.error(`agent-model-router: ${message}`);
  process.exitCode = 1;
});
