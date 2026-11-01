import {readFile} from 'node:fs/promises';
import {HeuristicRouter, loadConfig} from '../dist/index.js';
const router = new HeuristicRouter(await loadConfig());
const tasks = JSON.parse(await readFile(new URL('./tasks.json', import.meta.url), 'utf8'));
const results = tasks.map(task => ({task:task.task, priority:task.priority, ...router.select(task)}));
console.log(JSON.stringify(results, null, 2));
