import type { ModelDefinition, ParsedTask, Recommendation, RouterConfig } from './schema.js';
export type { TaskInput, Recommendation, RouterConfig, ModelDefinition } from './schema.js';
export interface TaskAnalysis {
  category: string;
  description: string;
  complexity: number;
  category_scores: Record<string, number>;
  signals: string[];
  recognized: boolean;
}
export interface ScoredModel {
  model: string;
  quality: number;
  score: number;
  eligible: boolean;
}
export interface RoutingDecision {
  recommendation: Recommendation;
  registry_version: string;
  analysis: TaskAnalysis;
  candidates: ScoredModel[];
  fallback: boolean;
  warnings: string[];
}
/** A future local classifier can implement this without depending on MCP. */
export interface TaskAnalyzer { analyze(input: ParsedTask, config: RouterConfig): TaskAnalysis }
/** Ranking can later use benchmark scores, with an injected registry snapshot. */
export interface ModelRanker {
  rank(input: ParsedTask, analysis: TaskAnalysis, models: readonly ModelDefinition[], config: RouterConfig): ScoredModel[];
}
/** Async permits a future remote implementation; v1 remains entirely local. */
export interface ModelRouter { select(input: unknown): Recommendation | Promise<Recommendation> }
