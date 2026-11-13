export const CHAT_TYPES=['Venda','Upgrade','Regularização','Renovação'];
export function isChat(segment){return String(segment||'').trim().replace(/\s+/g,' ').toUpperCase()==='VENDAS CHAT';}
export function composeObservation(segment,type,note){const text=String(note||'').trim();return isChat(segment)?type+(text?' — '+text:''):text;}
export function validEndpoint(value){return value==='/.netlify/functions/tabulador';}
export function validateSale(sale, agents) {
  const errors = {};
  if(isChat(sale.segment)&&!CHAT_TYPES.includes(sale.saleType))errors.saleType='Selecione o tipo de venda do Chat.';
  const agent = agents.find(a => a.name === sale.agent);
  if (!agents.some(a => a.segments.includes(sale.segment))) errors.segment = 'Selecione um segmento disponível.';
  if (!agent || !agent.segments.includes(sale.segment)) errors.agent = 'Selecione seu nome entre os agentes deste segmento.';
  if (!/^\d+$/.test(sale.member)) errors.member = 'Informe somente os dígitos do número de membro.';
  if (!['1.000', '2.000', '5.000', '7.000', '10.000', '20.000'].includes(sale.plan)) errors.plan = 'Selecione um dos seis planos disponíveis.';
  if (!['ANUAL','MENSAL'].includes(sale.billing)) errors.billing = 'Selecione Anual ou Mensal.';
  if ((sale.observation || '').length > 50000) errors.observation = 'A observação excede o limite de uma célula do Sheets.';
  return errors;
}
export async function request(endpoint, accessKey, action, payload = {}) {
  const response = await fetch('/.netlify/functions/tabulador', { method: 'POST', redirect: 'follow', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(30000) });
  
  let data;
  try { data = await response.json(); } catch { throw new Error('O serviço não respondeu como esperado. Confira o endereço /exec e a publicação para “Qualquer pessoa”.'); }
  if (data.service !== 'smiles-sales-v1' || typeof data.ok !== 'boolean') throw new Error('Endereço incompatível com o tabulador. Confira a configuração.');
  return data;
}
