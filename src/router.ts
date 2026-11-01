import { routerConfigSchema, taskInputSchema, type ModelDefinition, type RouterConfig, type ParsedTask } from './schema.js';
import type { ModelRanker, ModelRouter, RoutingDecision, TaskAnalysis, TaskAnalyzer } from './types.js';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 10_000) / 10_000;
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').replace(/\s+/g, ' ').trim();
// Literal, normalized phrases rather than executable patterns or regex config.
const matches = (text: string, phrases: readonly string[]) => phrases.some(p => text.includes(` ${normalize(p)} `));
const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export class NoModelAvailableError extends Error {
  constructor() { super('No available model matches the registry and caller availability constraints'); this.name = 'NoModelAvailableError'; }
}
export class HeuristicAnalyzer implements TaskAnalyzer {
  analyze(input: ParsedTask, config: RouterConfig): TaskAnalysis {
    const text = ` ${normalize(`${input.task}\n${input.context}`)} `;
    const scores = Object.fromEntries(config.classification.categories.map(category => [category.id,
      category.signals.reduce((sum, signal) => sum + (matches(text, signal.phrases) ? signal.weight : 0), 0),
    ]));
    const categories = [...config.classification.categories].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0) || compareIds(a.id, b.id));
    const best = categories[0];
    const recognized = !!best && (scores[best.id] ?? 0) > 0;
    const category = recognized ? best : config.classification.categories.find(c => c.id === config.classification.default_category);
    if (!category) throw new Error('Validated default category is missing');
    const signals = config.complexity.signals.filter(signal => matches(text, signal.phrases));
    return { category: category.id, description: category.description,
      complexity: round(clamp(config.complexity.baseline + signals.reduce((sum, s) => sum + s.weight, 0))),
      category_scores: scores, signals: signals.map(s => s.id), recognized };
  }
}
export class WeightedRanker implements ModelRanker {
  rank(input: ParsedTask, analysis: TaskAnalysis, models: readonly ModelDefinition[], config: RouterConfig) {
    const policy = config.policies[input.priority];
    const costs = models.map(m => m.relative_cost);
    const min = Math.min(...costs), range = Math.max(...costs) - min;
    const qualityWeight = policy.weights.quality + policy.complexity_weight_bonus * analysis.complexity;
    const totalWeight = qualityWeight + policy.weights.speed + policy.weights.cost;
    const minimumQuality = clamp(policy.min_quality + policy.complexity_quality_bonus * analysis.complexity);
    return models.map(model => {
      const quality = model.capabilities[analysis.category] ?? 0;
      const cost = range === 0 ? 1 : 1 - (model.relative_cost - min) / range;
      const score = (qualityWeight * quality + policy.weights.speed * model.relative_speed + policy.weights.cost * cost) / totalWeight;
      return { model: model.id, quality, score: round(score), eligible: quality >= minimumQuality && model.max_complexity >= analysis.complexity };
    }).sort((a, b) => b.score - a.score || compareIds(a.model, b.model));
  }
}
/** Immutable, in-memory snapshot. No files, transport, network or process spawning. */
export class HeuristicRouter implements ModelRouter {
  private readonly config: RouterConfig;
  private readonly analyzer: TaskAnalyzer;
  private readonly ranker: ModelRanker;
  constructor(config: unknown, extensions: { analyzer?: TaskAnalyzer; ranker?: ModelRanker } = {}) {
    this.config = routerConfigSchema.parse(config);
    this.analyzer = extensions.analyzer ?? new HeuristicAnalyzer();
    this.ranker = extensions.ranker ?? new WeightedRanker();
  }
  select(input: unknown) { return this.explain(input).recommendation; }
  explain(value: unknown): RoutingDecision {
    const input = taskInputSchema.parse(value);
    const config = this.config;
    const models = config.models.filter(m => m.available && (!input.available_models || input.available_models.includes(m.id)));
    if (!models.length) throw new NoModelAvailableError();
    const analysis = this.analyzer.analyze(input, config);
    const candidates = this.ranker.rank(input, analysis, models, config);
    const eligible = candidates.filter(m => m.eligible);
    const fallback = !eligible.length || !analysis.recognized;
    const configuredFallback = models.find(m => m.id === config.fallback.model);
    const winnerId = fallback ? configuredFallback?.id ?? candidates[0]?.model : eligible[0]?.model;
    const model = models.find(m => m.id === winnerId);
    if (!model) throw new Error('Ranker did not return an available model');
    const policy = config.policies[input.priority];
    const requested = fallback ? config.fallback.effort : policy.efforts.find(e => analysis.complexity <= e.through)!.effort;
    const requestedIndex = config.effort_order.indexOf(requested);
    const supported = [...model.reasoning_levels].sort((a, b) => config.effort_order.indexOf(a) - config.effort_order.indexOf(b));
    // Prefer the next supported level up; if none exists, use the highest available.
    const effort = supported.find(e => config.effort_order.indexOf(e) >= requestedIndex) ?? supported.at(-1)!;
    const warnings: string[] = [];
    if (fallback) warnings.push(!analysis.recognized ? 'No task category recognized; fallback policy used.' : 'No model satisfies the quality/complexity floor; recommendation is degraded.');
    if (fallback && !configuredFallback) warnings.push('Configured fallback unavailable; highest-scoring available model used.');
    if (effort !== requested) warnings.push(`Requested effort ${requested} mapped to supported effort ${effort}.`);
    const first = eligible[0], second = eligible[1];
    const margin = first && second ? Math.max(0, first.score - second.score) : 0;
    const confidence = fallback ? 0.3 : round(Math.min(0.95, 0.55 + Math.min(0.2, margin) + Math.min(0.2, (analysis.category_scores[analysis.category] ?? 0) * 0.05)));
    const reason = fallback
      ? `${warnings.join(' ')} Selected ${model.id} with ${effort} effort.`
      : `${analysis.description} Complexity ${analysis.complexity.toFixed(2)}; ${input.priority} policy selects ${model.id} (capability ${candidates.find(c => c.model === model.id)!.quality.toFixed(2)}) with ${effort} effort.${warnings.length ? ` ${warnings.join(' ')}` : ''}`;
    return { recommendation: { model: model.id, reasoning_effort: effort, confidence, reason }, registry_version: config.registry_version, analysis, candidates, fallback, warnings };
  }
}
