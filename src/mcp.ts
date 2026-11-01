import { McpServer } from '@modelcontextprotocol/server';
import { recommendationSchema, taskInputSchema } from './schema.js';
import { NoModelAvailableError } from './router.js';
import type { ModelRouter } from './types.js';
import { VERSION } from './version.js';
export function createMcpServer(router: ModelRouter): McpServer {
  const server = new McpServer({ name: 'agent-model-router', version: VERSION });
  server.registerTool('select_model', {
    description: 'Recommend a model and supported reasoning effort for a delegated task. Local deterministic routing only; never creates agents or calls inference APIs. Confidence is heuristic, not a success probability.',
    inputSchema: taskInputSchema,
    outputSchema: recommendationSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => {
    try {
      const recommendation = recommendationSchema.parse(await router.select(input));
      return { content: [{ type: 'text' as const, text: JSON.stringify(recommendation) }], structuredContent: recommendation };
    } catch (error) {
      const message = error instanceof NoModelAvailableError ? error.message : 'Routing failed; use the orchestrator default configuration.';
      return { isError: true, content: [{ type: 'text' as const, text: message }] };
    }
  });
  return server;
}
