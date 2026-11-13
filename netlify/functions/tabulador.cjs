const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({service:'smiles-sales-v1',...data})});
exports.handler=async event=>{
 if(event.httpMethod!=='POST')return reply(405,{ok:false,error:'Método não permitido.'});
 const endpoint=process.env.SMILES_SCRIPT_URL,key=process.env.SMILES_ACCESS_KEY;
 if(!endpoint||!key||!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(endpoint))return reply(503,{ok:false,error:'Conexão não configurada. Confira as variáveis do Netlify e publique novamente.'});
 let body;try{const text=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body||'';if(Buffer.byteLength(text)>220000)return reply(413,{ok:false,definitive:true,error:'Registro excede o tamanho permitido.'});body=JSON.parse(text);}catch{return reply(400,{ok:false,definitive:true,error:'Solicitação inválida.'});}
 if(!body||!['catalog','sale'].includes(body.action))return reply(400,{ok:false,definitive:true,error:'Ação não permitida.'});
 let sale;if(body.action==='sale'){
 const s=body.sale;if(!s||typeof s.id!=='string'||!s.id||s.id.length>100||!/^\d+$/.test(s.member||'')||!['1.000','2.000','5.000','7.000','10.000','20.000'].includes(s.plan)||!['ANUAL','MENSAL'].includes(s.billing)||typeof s.agent!=='string'||!s.agent.trim()||typeof s.segment!=='string'||!s.segment.trim()||typeof s.observation!=='string'||s.observation.length>50000)return reply(400,{ok:false,definitive:true,error:'Confira os campos obrigatórios do registro.'});
 sale={id:s.id,member:s.member,agent:s.agent,segment:s.segment,plan:s.plan,billing:s.billing,observation:s.observation};
 }
 try{const response=await fetch(endpoint,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:body.action,accessKey:key,...(sale?{sale}:{})}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();const data=await response.json();if(data.service!=='smiles-sales-v1'||typeof data.ok!=='boolean')throw Error();return reply(200,data);}catch{return reply(502,{ok:false,error:body.action==='sale'?'Não foi possível confirmar a gravação. Use Confirmar envio pendente para reutilizar o protocolo.':'Não foi possível consultar o cadastro. Tente conectar novamente.'});}
};
