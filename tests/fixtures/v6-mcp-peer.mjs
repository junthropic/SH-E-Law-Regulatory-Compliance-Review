import {createInterface} from "node:readline";
import {writeFileSync} from "node:fs";
// Isolated external JSON-RPC peer. It has no API key and performs no network requests.
const input=createInterface({input:process.stdin});input.on("line",line=>{const m=JSON.parse(line);if(m.id===undefined)return;
  let result=m.method==="initialize"?{protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"synthetic-v6",version:"1"}}:m.method==="tools/call"?{content:[{type:"text",text:"가상 법령 탐색 결과이며 실제 법령 원문이 아닙니다."}]}:{};
  if(m.method==="tools/call"&&process.env.V6_SYNTHETIC_MARKER){writeFileSync(process.env.V6_SYNTHETIC_MARKER,"synthetic-call-started");setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:m.id,result})+"\n"),2000);}
  else process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:m.id,result})+"\n");});input.on("close",()=>process.exit(0));
