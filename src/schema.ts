import { z } from 'zod';

const id = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
const unit = z.number().finite().min(0).max(1);
const phrases = z.array(z.string().trim().min(1).max(100)).min(1).max(100);
export const priorities = ['quality', 'balanced', 'speed', 'cost'] as const;
export const taskInputSchema = z.strictObject({
  task: z.string().trim().min(1).max(20_000),
  context: z.string().trim().max(40_000).default(''),
  priority: z.enum(priorities).default('balanced'),
  available_models: z.array(id).max(200).optional(),
});
export const recommendationSchema = z.strictObject({
  model: id,
  reasoning_effort: id,
  confidence: unit,
  reason: z.string().min(1),
});
const weights = z.strictObject({ quality: unit, speed: unit, cost: unit })
  .refine(w => w.quality + w.speed + w.cost > 0, 'At least one weight must be positive');
const policy = z.strictObject({
  weights,
  min_quality: unit,
  complexity_quality_bonus: unit,
  complexity_weight_bonus: unit,
  efforts: z.array(z.strictObject({ through: unit, effort: id })).min(1).max(20),
});
export const routerConfigSchema = z.strictObject({
  schema_version: z.literal(1),
  registry_version: id,
  effort_order: z.array(id).min(1).max(20),
  models: z.array(z.strictObject({
    id,
    provider: id,
    available: z.boolean(),
    reasoning_levels: z.array(id).min(1).max(20),
    relative_cost: z.number().finite().positive(),
    relative_speed: unit,
    max_complexity: unit,
    capabilities: z.record(id, unit),
  })).min(1).max(200),
  classification: z.strictObject({
    default_category: id,
    categories: z.array(z.strictObject({
      id, description: z.string().trim().min(1).max(240),
      signals: z.array(z.strictObject({ phrases, weight: z.number().finite().positive().max(10) })).max(30),
    })).min(1).max(40),
  }),
  complexity: z.strictObject({
    baseline: unit,
    signals: z.array(z.strictObject({ id, phrases, weight: z.number().finite().min(-1).max(1) })).max(60),
  }),
  policies: z.strictObject({ quality: policy, balanced: policy, speed: policy, cost: policy }),
  fallback: z.strictObject({ model: id, effort: id }),
}).superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (items: string[], label: string) => { if (new Set(items).size !== items.length) fail(`Duplicate ${label}`); };
  unique(c.effort_order, 'effort');
  unique(c.models.map(m => m.id), 'model');
  unique(c.classification.categories.map(t => t.id), 'category');
  unique(c.complexity.signals.map(s => s.id), 'complexity signal');
  const categories = new Set(c.classification.categories.map(t => t.id));
  if (!categories.has(c.classification.default_category)) fail('Unknown default category');
  for (const model of c.models) {
    unique(model.reasoning_levels, `reasoning level for ${model.id}`);
    if (model.reasoning_levels.some(e => !c.effort_order.includes(e))) fail(`Unknown effort for ${model.id}`);
    for (const category of categories) if (model.capabilities[category] === undefined) fail(`Missing capability ${category} for ${model.id}`);
    if (Object.keys(model.capabilities).some(key => !categories.has(key))) fail(`Unknown capability for ${model.id}`);
  }
  for (const [name, p] of Object.entries(c.policies)) {
    if (p.efforts.at(-1)?.through !== 1) fail(`${name}: effort thresholds must end at 1`);
    let previous = -1;
    for (const step of p.efforts) {
      if (step.through <= previous) fail(`${name}: effort thresholds must increase`);
      if (!c.effort_order.includes(step.effort)) fail(`${name}: unknown effort`);
      previous = step.through;
    }
  }
  const fallback = c.models.find(m => m.id === c.fallback.model);
  if (!fallback || !fallback.reasoning_levels.includes(c.fallback.effort)) fail('Fallback must reference a registered model and supported effort');
});
export type RouterConfig = z.infer<typeof routerConfigSchema>;
export type TaskInput = z.input<typeof taskInputSchema>;
export type ParsedTask = z.output<typeof taskInputSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type ModelDefinition = RouterConfig['models'][number];
