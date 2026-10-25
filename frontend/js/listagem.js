exigirUsuario();
const grid = document.querySelector('#demandas-grid');

document.addEventListener('DOMContentLoaded', carregarDemandas);
document.querySelector('#btn-filtrar').onclick = carregarDemandas;

async function carregarDemandas() {
  const params = new URLSearchParams();
  const busca = document.querySelector('#filtro-busca').value.trim();
  const status = document.querySelector('#filtro-status').value;
  const prioridade = document.querySelector('#filtro-prioridade').value;
  if (busca) params.set('busca', busca);
  if (!['', 'todos', 'selecione'].includes(status)) params.set('status', normalizar(status));
  if (!['', 'todos', 'selecione'].includes(prioridade)) params.set('prioridade', normalizar(prioridade));
  grid.textContent = 'Carregando demandas...';
  try {
    const demandas = await api(`/demandas?${params}`);
    grid.replaceChildren(...demandas.map(criarCard));
    if (!demandas.length) grid.textContent = 'Nenhuma demanda encontrada.';
  } catch (error) { grid.textContent = error.message; }
}

function normalizar(value) {
  const map = { aberta: 'ABERTA', andamento: 'EM_ANDAMENTO', revisao: 'EM_REVISAO', concluida: 'CONCLUIDA', cancelada: 'CANCELADA', critica: 'CRITICA', alta: 'ALTA', media: 'MEDIA', baixa: 'BAIXA' };
  return map[value] || value;
}
function criarCard(demanda) {
  const card = document.createElement('div');
  card.className = 'content-card card-demanda';
  const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = demanda.titulo;
  const info = document.createElement('div'); info.className = 'card-body';
  info.append(paragrafo('Tipo', rotulos[demanda.tipo]), paragrafo('Projeto', demanda.projeto_nome), paragrafo('Responsável', demanda.responsavel_nome || 'Não definido'), paragrafo('Status', rotulos[demanda.status]), paragrafo('Prioridade', rotulos[demanda.prioridade]));
  const button = document.createElement('button'); button.className = 'btn-secondary-custom btn-detalhes'; button.textContent = 'Ver detalhes'; button.onclick = () => { window.location.href = `detalhes.html?id=${demanda.id}`; };
  card.append(title, info, button);
  return card;
}
function paragrafo(label, value) { const p = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = `${label}: `; p.append(strong, value || '—'); return p; }
