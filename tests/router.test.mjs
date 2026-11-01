import test from 'node:test';
import assert from 'node:assert/strict';
import {HeuristicRouter, loadConfig, routerConfigSchema, NoModelAvailableError, taskInputSchema} from '../dist/index.js';
const config = await loadConfig();
const router = new HeuristicRouter(config);
const race = {task:'Find potential race conditions in this codebase',context:'TypeScript backend, distributed workers'};
test('deterministic for repeated and concurrent requests', async()=>{
  const expected=router.select(race);
  for(const result of await Promise.all(Array.from({length:100},()=>Promise.resolve(router.select(race))))) assert.deepEqual(result,expected);
});
test('recognizes concurrency and raises complexity with cross-cutting context',()=>{
  const result=router.explain(race);assert.equal(result.analysis.category,'concurrency');assert.ok(result.analysis.complexity>=.7);assert.equal(result.recommendation.reasoning_effort,'high');assert.equal(result.fallback,false);
});
test('priority changes model choice without code changes',()=>{
  const input={task:'Update the README documentation'};
  assert.equal(router.select({...input,priority:'cost'}).model,'gpt-6-luna');
  assert.notEqual(router.select({...input,priority:'quality'}).model,'gpt-6-luna');
});
test('config controls model rankings and accepts other providers',()=>{
  const custom=structuredClone(config);const model=custom.models[0];model.id='local/coder';model.provider='local';
  custom.models=custom.models.map(m=>({...m,available:m===model}));custom.fallback.model=model.id;
  assert.equal(new HeuristicRouter(custom).select({task:'Fix typo in README'}).model,'local/coder');
});
test('unavailable models never selected',()=>{
  const custom=structuredClone(config);custom.models.find(m=>m.id==='gpt-6-astra').available=false;
  assert.notEqual(new HeuristicRouter(custom).select({...race,priority:'quality'}).model,'gpt-6-astra');
});
test('caller availability restricts models and cannot enable a disabled model',()=>{
  assert.equal(router.select({...race,available_models:['gpt-6-luna']}).model,'gpt-6-luna');
  const custom=structuredClone(config);custom.models[0].available=false;
  assert.throws(()=>new HeuristicRouter(custom).select({...race,available_models:[custom.models[0].id]}),NoModelAvailableError);
});
test('empty or unknown availability fails explicitly',()=>{
  for(const available_models of [[],['not-installed']])assert.throws(()=>router.select({...race,available_models}),NoModelAvailableError);
});
test('unknown task uses declared fallback with low confidence',()=>{
  const r=router.explain({task:'Please help with this'});assert.equal(r.fallback,true);assert.equal(r.recommendation.model,config.fallback.model);assert.equal(r.recommendation.confidence,.3);
});
test('fallback unavailable uses ranked available model',()=>{
  const custom=structuredClone(config);custom.models.find(m=>m.id===custom.fallback.model).available=false;
  const result=new HeuristicRouter(custom).explain({task:'Unrecognized request'});
  assert.notEqual(result.recommendation.model,custom.fallback.model);assert.match(result.warnings.join(' '),/fallback unavailable/i);
});
test('no eligible model returns explicit degraded fallback, never fabricated capacity',()=>{
  const result=router.explain({...race,available_models:['gpt-6-luna']});assert.equal(result.fallback,true);assert.match(result.recommendation.reason,/degraded/);assert.ok(result.recommendation.confidence<.5);
});
test('effort maps to a supported level including restricted registries',()=>{
  const custom=structuredClone(config);custom.models.forEach(m=>m.reasoning_levels=['medium']);custom.fallback.effort='medium';
  const result=new HeuristicRouter(custom).select({...race,priority:'quality'});assert.equal(result.reasoning_effort,'medium');
});
test('Unicode normalization and word boundaries avoid substring matches',()=>{
  assert.equal(router.explain({task:'ＲＥＡＤＭＥ typo'}).analysis.category,'documentation');
  assert.equal(router.explain({task:'Discuss an anatomical featureless object'}).analysis.recognized,false);
});
test('registry snapshot cannot be mutated through caller config or explanations',()=>{
  const custom=structuredClone(config);const instance=new HeuristicRouter(custom);const result=instance.select(race);
  custom.models.forEach(m=>m.available=false);instance.explain(race).candidates[0].score=999;
  assert.deepEqual(instance.select(race),result);
});
test('invalid, whitespace, oversized and unrecognized inputs rejected',()=>{
  for(const input of [null,{}, {task:' '}, {task:3}, {task:'x',priority:'cheapest'}, {task:'x'.repeat(20001)}, {task:'x',context:'x'.repeat(40001)}, {task:'x',secret:'ignored?'}])assert.throws(()=>router.select(input));
  assert.equal(taskInputSchema.parse({task:' x '}).priority,'balanced');
});
test('registry rejects duplicates, missing capabilities, unsupported efforts and broken thresholds',()=>{
  const mutations=[c=>c.models.push(c.models[0]),c=>c.models[0].relative_cost=-1,c=>c.models[0].capabilities.concurrency=2,c=>delete c.models[0].capabilities.general,c=>c.models[0].reasoning_levels=['impossible'],c=>c.fallback.model='unknown',c=>c.policies.speed.efforts.reverse(),c=>c.policies.speed.efforts.at(-1).through=.9,c=>c.classification.default_category='missing'];
  for(const mutate of mutations){const c=structuredClone(config);mutate(c);assert.equal(routerConfigSchema.safeParse(c).success,false);}
});
test('equal model scores tie-break by ID, independent of array order',()=>{
  const c=structuredClone(config),a=structuredClone(c.models[1]);a.id='a-model';const b={...structuredClone(a),id:'z-model'};
  c.models=[b,a];c.fallback.model='a-model';const one=new HeuristicRouter(c).select(race);c.models.reverse();assert.equal(one.model,'a-model');assert.deepEqual(new HeuristicRouter(c).select(race),one);
});
test('extension interface accepts a separate task analyzer',()=>{
  const base=router.explain(race).analysis;
  const custom=new HeuristicRouter(config,{analyzer:{analyze:()=>({...base,category:'security',description:'Injected security classification'})}});
  assert.equal(custom.explain({task:'opaque task'}).analysis.category,'security');
});
