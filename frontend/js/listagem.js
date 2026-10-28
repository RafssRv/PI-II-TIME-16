// Integração: Vinicius Panutti Salgado — R.A. 25007329.
// Consulta a API; títulos e descrições recebidos são inseridos como texto.
const grid = document.querySelector('#demandas-grid');
let consultaAtual = 0;

if (exigirUsuario()) document.addEventListener('DOMContentLoaded', async () => {
  document.querySelector('#filtros').addEventListener('submit', (event) => {
    event.preventDefault();
    carregarDemandas();
  });
  await carregarDemandas();
  try {
    const [projetos, usuarios] = await Promise.all([api('/projetos'), api('/usuarios')]);
    for (const [id, items] of [['filtro-projeto', projetos], ['filtro-responsavel', usuarios]]) {
      const select = document.getElementById(id);
      items.forEach((item) => select.add(new Option(item.nome, item.id)));
    }
  } catch (error) {
    const aviso = document.createElement('p'); aviso.role = 'alert';
    aviso.textContent = `Não foi possível carregar as opções dos filtros: ${error.message}`;
    document.querySelector('#filtros').after(aviso);
  }
});

async function carregarDemandas() {
  const consulta = ++consultaAtual;
  const params = new URLSearchParams();
  const campos = { busca: 'busca', status: 'status', prioridade: 'prioridade', tipo: 'tipo', projeto: 'projeto_id', responsavel: 'responsavel_id', ordenacao: 'ordenacao' };
  for (const [id, campo] of Object.entries(campos)) {
    const value = document.querySelector(`#filtro-${id}`).value.trim();
    if (!['', 'todos', 'selecione'].includes(value)) params.set(campo, normalizar(value));
  }
  grid.textContent = 'Carregando demandas...';
  grid.setAttribute('aria-busy', 'true');
  try {
    const demandas = await api(`/demandas?${params}`);
    if (consulta !== consultaAtual) return;
    grid.replaceChildren(...demandas.map(criarCard));
    if (!demandas.length) grid.textContent = 'Nenhuma demanda encontrada.';
  } catch (error) {
    if (consulta === consultaAtual) grid.textContent = error.message;
  } finally {
    if (consulta === consultaAtual) grid.setAttribute('aria-busy', 'false');
  }
}

function normalizar(value) {
  return ({ aberta: 'ABERTA', andamento: 'EM_ANDAMENTO', revisao: 'EM_REVISAO', concluida: 'CONCLUIDA', cancelada: 'CANCELADA', critica: 'CRITICA', alta: 'ALTA', media: 'MEDIA', baixa: 'BAIXA' })[value] || value;
}
function criarCard(demanda) {
  const card = document.createElement('article'); card.className = 'content-card card-demanda';
  const header = document.createElement('div'); header.className = 'card-header';
  const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = demanda.titulo;
  const badges = document.createElement('div'); badges.className = 'card-badges';
  for (const [campo, classe] of [['status', ({ ABERTA: 'aberta', EM_ANDAMENTO: 'andamento', EM_REVISAO: 'revisao', CONCLUIDA: 'concluida', CANCELADA: 'cancelada' })[demanda.status]], ['prioridade', demanda.prioridade.toLowerCase()]]) {
    const badge = document.createElement('span'); badge.className = `badge-custom badge-${campo}-${classe}`; badge.textContent = rotulos[demanda[campo]];
    badges.append(badge);
  }
  header.append(title, badges);
  const info = document.createElement('div'); info.className = 'card-body';
  info.append(paragrafo('Tipo', rotulos[demanda.tipo]), paragrafo('Projeto', demanda.projeto_nome), paragrafo('Responsável', demanda.responsavel_nome || 'Não definido'));
  const footer = document.createElement('div'); footer.className = 'card-footer';
  footer.append(paragrafo('Criado', dataListagem(demanda.criado_em)), paragrafo('Prazo', dataListagem(demanda.prazo)));
  const button = document.createElement('button'); button.className = 'btn-secondary-custom btn-detalhes'; button.textContent = 'Ver detalhes';
  button.onclick = () => { window.location.href = `detalhes.html?id=${demanda.id}`; };
  card.append(header, info, footer, button); return card;
}
function paragrafo(label, value) {
  const p = document.createElement('p'); const strong = document.createElement('strong');
  strong.textContent = `${label}: `; p.append(strong, value || '—'); return p;
}
function dataListagem(value) {
  if (!value) return 'Não definido';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
