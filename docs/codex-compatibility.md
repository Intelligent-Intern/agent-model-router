# Codex integration verification

Verified on 2026-11-01.

## Evidence and scope

- The live collaboration tool schema in the implementation session exposed
  `spawn_agent` with `task_name`, `message`, `fork_turns`, `model` and
  `reasoning_effort`. An explicit model/effort pair requires `fork_turns: "none"`;
  full-history forks inherit both settings.
- That session exposed `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6.1-terra`, `gpt-6-sol`
  and `gpt-6-luna`. The example registry uses four of these IDs. Supported efforts
  were low, medium, high, xhigh, max and ultra, except Luna stopped at max.
- Local `codex --version` reported **codex-cli 0.136.0**. `codex --help` and
  `codex app-server --help` were inspected. This establishes the installed CLI
  version, not that every CLI session exposes the same collaboration tool schema.
- No real subagent was started for verification. The MCP integration is tested
  with an actual stdio client/server exchange. Model availability is not checked
  through an account API, and no task is sent to an inference provider.

[Official Codex subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents)
explains inherited settings and model/effort configuration through agent defaults,
custom agent files, and explicit spawn requests. A custom agent's settings can
supersede spawn values. The documented configuration names include
`agents.default_subagent_model`, `agents.default_subagent_reasoning_effort`, and
`model_reasoning_effort` in custom agent files. These are configuration keys;
they are not necessarily the names of parameters in a live tool call.

## Integration strategy

Use [the example instructions](../examples/codex/AGENTS.md) and
[MCP configuration](../examples/codex/config.toml). Inspect the current tool schema
and use direct overrides only when supported. Otherwise use a preconfigured role
or the inherited default. Do not modify the user's Codex config automatically.

The example registry captures a host observation, not a provider's universal
catalog. Its capability ratings and cost/speed figures are illustrative operator
weights, not published prices, measured latency or benchmark results. Replace the
model list with the list actually available in the target environment.
