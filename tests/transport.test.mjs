import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {HeuristicRouter,loadConfig,recommendationSchema} from '../dist/index.js';
const cli=new URL('../dist/cli.js',import.meta.url).pathname;
const run=(args,input)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',input,timeout:10000});
test('CLI handles JSON stdin and structured output',()=>{
  const result=run(['select'],JSON.stringify({task:'Fix a typo in README',priority:'cost'}));assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.equal(recommendationSchema.parse(JSON.parse(result.stdout)).model,'gpt-6-luna');
});
test('CLI exposes explanations and validates registry',()=>{
  assert.equal(JSON.parse(run(['validate']).stdout).valid,true);
  assert.ok(JSON.parse(run(['select','--task','Review security','--explain']).stdout).analysis);
});
test('CLI rejects invalid flags, config, input and missing availability without stdout noise',()=>{
  for(const [args,input] of [[['select'],'not-json'],[['select','--task','x','--priority','invalid']], [['serve','--task','x']], [['select','--unknown']], [['validate','--config','/no-such-config']], [['select','--task','x','--available-models','none']]]){
    const result=run(args,input);assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/agent-model-router:/);
  }
});
test('real MCP stdio initialization, schema, calls, validation and fallback errors', {timeout:15000},async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[cli,'serve'],stderr:'pipe'});
  let stderr='';transport.stderr?.on('data',chunk=>stderr+=String(chunk));
  const client=new Client({name:'router-test',version:'1.0.0'});
  try{
    await client.connect(transport);
    const {tools}=await client.listTools();assert.equal(tools.length,1);assert.equal(tools[0].name,'select_model');assert.equal(tools[0].annotations.readOnlyHint,true);assert.ok(tools[0].outputSchema);
    const input={task:'Find race conditions across distributed workers',priority:'quality'};
    const response=await client.callTool({name:'select_model',arguments:input});assert.ok(!response.isError);
    const expected=new HeuristicRouter(await loadConfig()).select(input);assert.deepEqual(response.structuredContent,expected);assert.deepEqual(JSON.parse(response.content[0].text),expected);
    const empty=await client.callTool({name:'select_model',arguments:{task:'x',available_models:[]}});assert.equal(empty.isError,true);assert.match(empty.content[0].text,/No available model/);
    // MCP hosts may surface bad arguments as a tool error or a protocol error.
    let rejected=false;
    try{const invalid=await client.callTool({name:'select_model',arguments:{task:'',priority:'invalid'}});rejected=invalid.isError===true;}catch{rejected=true;}
    assert.equal(rejected,true);assert.equal(stderr,'');
  }finally{await client.close();await transport.close();}
});
