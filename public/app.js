const webStorage={async get(keys){const result={};for(const key of typeof keys==='string'?[keys]:keys){const raw=localStorage.getItem('smiles-web-'+key);if(raw!==null)result[key]=JSON.parse(raw);}return result;},async set(items){for(const [key,value] of Object.entries(items))localStorage.setItem('smiles-web-'+key,JSON.stringify(value));},async remove(key){localStorage.removeItem('smiles-web-'+key);}};
import { validEndpoint, validateSale, request, isChat, composeObservation } from './core.js';
const $ = id => document.getElementById(id);
const fields = ['segment','agent','member','plan','billing','saleType','observation'];
let config, endpoint = '', agents = [], pending = null, busy = false, connected = false;
const input = id => $(id === 'billing' ? 'annual' : id);
function message(text, tone = '') { $('feedback').textContent = text; $('feedback').dataset.tone = tone; }
function setBusy(value) {
  busy = value;
  $('sale-fields').disabled = value || !connected || !!pending;
  $('submit').disabled = value || !connected;
  $('submit').textContent = value ? 'Aguarde…' : pending ? 'Confirmar envio pendente' : 'Registrar venda ↗';
  $('submit').setAttribute('aria-busy',String(value));
  $('clear').disabled = value || !!pending;
  $('retry').disabled = value;
  $('billing-group').disabled = !$('plan').value;
}
function options(el, list, placeholder) { el.replaceChildren(new Option(placeholder,''),...list.map(value => new Option(value,value))); }
function filterAgents(selected = '') {
  const list = agents.filter(a=>a.segments.includes($('segment').value)).map(a=>a.name);
  options($('agent'),list,$('segment').value?'Selecione seu nome':'Selecione o segmento primeiro');
  $('agent').disabled = !list.length;
  if (list.includes(selected)) $('agent').value = selected;
}
function toggleChat(){const chat=isChat($('segment').value);$('chat-type-field').hidden=!chat;$('saleType').disabled=!chat;$('saleType').required=chat;if(!chat)$('saleType').value='';}
function values() { return {segment:$('segment').value,agent:$('agent').value,member:$('member').value,plan:$('plan').value,billing:document.querySelector('input[name=billing]:checked')?.value || '',saleType:isChat($('segment').value)?$('saleType').value:'',observationNote:$('observation').value.trim(),observation:composeObservation($('segment').value,$('saleType').value,$('observation').value)}; }
function errors(items = {}) {
  for (const id of fields) { input(id).setAttribute('aria-invalid',String(!!items[id])); $(id+'-error').textContent = items[id] || ''; }
  if (Object.keys(items).length) input(Object.keys(items)[0]).focus();
}
function populate(sale = {}) {
  const segments = [...new Set(agents.flatMap(a=>a.segments))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  options($('segment'),segments,'Selecione o segmento');
  if (segments.includes(sale.segment)) $('segment').value = sale.segment;
  filterAgents(sale.agent);
  for (const id of ['member','plan']) $(id).value = sale[id] || '';
  $('observation').value=sale.observationNote??sale.observation??'';
  $('saleType').value=sale.saleType||'';toggleChat();
  $('annual').checked = sale.billing === 'ANUAL'; $('monthly').checked = sale.billing === 'MENSAL';
  $('billing-group').disabled = !$('plan').value;
}
function showPending() {
  populate(pending);
  for (const id of ['segment','agent']) { options($(id),[pending[id]],''); $(id).value = pending[id]; }
  toggleChat();$('connection').textContent = 'Envio pendente de confirmação.';
  message('Confirme o envio para recuperar o resultado, sem duplicar a venda.');
}
async function catalog() {
  if (busy) return;
  const previous = values(); connected = false; setBusy(true); $('retry').hidden = true;
  $('connection').textContent = 'Carregando cadastro…';
  try {
    const result = await request(endpoint,config.accessKey,'catalog');
    if (!result.ok) throw new Error(result.error);
    if (result.schemaVersion !== 2) throw new Error('O Apps Script publicado ainda é da versão anterior. O responsável deve publicar a versão 2.0.0 na mesma implantação.');
    if (!Array.isArray(result.agents) || !result.agents.every(a=>typeof a.name==='string' && Array.isArray(a.segments) && a.segments.every(s=>typeof s==='string'))) throw new Error('Confira o cadastro na aba LOGINS.');
    agents = result.agents; connected = agents.length > 0;
    populate(previous);
    $('connection').textContent = connected ? '' : 'Nenhum agente com segmento cadastrado em LOGINS.';
    message('');
    if (result.writeReady === false) { connected=false; throw new Error(result.writeError || 'O serviço de gravação ainda não está habilitado.'); }
    if (pending) { connected=true; showPending(); }
  } catch(error) { connected=false; $('connection').textContent='Conexão indisponível'; message(error.message,'error'); $('retry').hidden=false; }
  finally { setBusy(false); }
}
async function save() {
  if (busy || !connected) return;
  if (!pending) {
    const sale = values(), issues = validateSale(sale,agents); errors(issues);
    if (Object.keys(issues).length) return;
    pending = {id:crypto.randomUUID(),endpoint,...sale};
    try { await webStorage.set({pending}); }
    catch { pending=null; message('Não foi possível preservar o envio. Nenhuma venda foi enviada.','error'); return; }
  }
  setBusy(true); message('Enviando venda…');
  let restore = null, resultText = '', resultTone = '';
  try {
    const result = await request(pending.endpoint || endpoint,config.accessKey,'sale',{sale:pending});
    if (!result.ok) {
      if (result.definitive === true) { restore={...pending}; await webStorage.remove('pending'); pending=null; }
      throw new Error(result.error);
    }
    if (result.id !== pending.id) throw new Error('A confirmação não corresponde ao protocolo enviado.');
    await webStorage.remove('pending'); pending=null;
    populate(); errors(); $('connection').textContent='';
    resultText='Venda registrada às '+result.time+'. Protocolo: '+result.id; resultTone='success';
  } catch(error) { resultText=error.message+(pending?' Protocolo preservado: '+pending.id:''); resultTone='error'; }
  finally { setBusy(false); if (restore) populate(restore); message(resultText,resultTone); if (!pending) $('segment').focus(); }
}
$('sale-form').addEventListener('submit',e=>{
  e.preventDefault();
  void navigator.locks.request('smiles-sale',{ifAvailable:true},async lock=>{
    if (!lock) { message('Há um envio em andamento em outra janela. Aguarde.','error'); return; }
    const stored=await webStorage.get('pending');
    if (stored.pending && (!pending || stored.pending.id!==pending.id)) { pending=stored.pending; showPending(); setBusy(false); return; }
    await save();
  }).catch(()=>message('Não foi possível iniciar o envio. Recarregue a página.','error'));
});
$('segment').addEventListener('change',()=>{filterAgents();toggleChat();errors();});
$('plan').addEventListener('change',()=>{ $('annual').checked=false; $('monthly').checked=false; $('billing-group').disabled=!$('plan').value; errors(); });
$('member').addEventListener('input',()=>{const clean=$('member').value.replace(/[^0-9]/g,''); if(clean!==$('member').value){$('member').value=clean; $('member-error').textContent='Use somente números; os demais caracteres foram removidos.';}else $('member-error').textContent=''; $('member').removeAttribute('aria-invalid');});
for(const id of ['agent','plan','saleType','observation','annual','monthly']) $(id).addEventListener('input',()=>{const field=['annual','monthly'].includes(id)?'billing':id; input(field).removeAttribute('aria-invalid'); $(field+'-error').textContent='';});
$('clear').addEventListener('click',()=>{if(busy||pending)return;populate();errors();message('');$('segment').focus();});
$('retry').addEventListener('click',()=>{if(validEndpoint(endpoint))void catalog();});
window.addEventListener('beforeunload',e=>{if(busy||(!pending&&Object.values(values()).some(Boolean))){e.preventDefault();e.returnValue='';}});
async function init(){
  config=await(await fetch('config.json')).json();
  const stored=await webStorage.get(['endpoint','pending']);endpoint=config.endpoint||stored.endpoint||'';pending=stored.pending||null;
  if(validEndpoint(endpoint))await catalog();
  else {setBusy(false);$('connection').textContent='Serviço ainda não ativado.';message('Solicite o pacote ativado ao responsável.','error');}
}
init().catch(()=>{setBusy(false);message('Não foi possível iniciar o tabulador. Feche e abra novamente.','error');});
