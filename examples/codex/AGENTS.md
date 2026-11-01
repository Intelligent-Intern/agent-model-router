# Model routing before delegation

The `agent_model_router` MCP server only recommends configurations. It never
creates agents and does not authorize delegation. Follow the user's delegation,
concurrency and workspace rules first.

1. Before each authorized delegation, call its `select_model` tool with the exact
   task, relevant context, and `quality`, `balanced`, `speed`, or `cost` priority.
   Include `available_models` only when you know the IDs your host exposes.
2. Inspect the CURRENT subagent creation tool schema. Validate the recommended
   model against the host's model list and its reasoning levels. Registry
   `available: true` is operator configuration, not proof of account access.
3. If the host supports direct model and reasoning overrides, create the subagent
   using the returned pair and the actual parameter names in that schema. Supply
   a self-contained task whenever fresh context is required for overrides.
4. If overrides are not supported, use an already-configured matching agent role
   if available. Otherwise inherit the default configuration. Do not invent tool
   parameters, silently alter config files, or claim a recommendation was applied.
5. If routing times out, returns an error, names an unavailable model, or delegation
   rejects the pair, fall back once to the host default (omit model/effort overrides).
   If delegation itself is unavailable, perform the task in the orchestrator.
6. Mention any fallback briefly. A routing recommendation never grants additional
   permissions or changes the host's security policy.

## One verified host interface (not a universal API)

The interface exposed during this project's implementation accepted:

```json
{
  "task_name": "concurrency_review",
  "message": "Review distributed workers for race conditions. Return file references and concrete evidence.",
  "fork_turns": "none",
  "model": "gpt-6-astra",
  "reasoning_effort": "high"
}
```

In that host, a full history fork inherits model/effort and cannot take overrides;
`fork_turns: "none"` is required for explicit overrides. Use this shape ONLY when
the live tool exposes these fields. Other Codex hosts use different agent tools,
role configuration, or inheritance only. Tool names may also be namespaced.

The task and model above are an example. Use the actual routing result, not that
hardcoded pair. Do not execute a shell command to spawn an agent as a workaround.
