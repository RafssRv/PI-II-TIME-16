/*
Autora: Heloisa L Marinho - RA: 25893868
Tela: Listagem de Demandas

Descrição: 
Monta a consulta de demandas a partir da pesquisa, dos filtros e da ordenação escolhidos. Envia os critérios à API,
exibe os resultados em cartões e oferece acesso aos detalhes de cada registro
*/

// Pega a área da tela onde os cartões vão aparecer
const grid = document.querySelector('#demandas-grid');

// Converte o status da API para a parte final da classe CSS do selo
// Exemplo: "EM_ANDAMENTO" vira "andamento" (classe: badge-status-andamento)
const classesStatus = {
  ABERTA: 'aberta',
  EM_ANDAMENTO: 'andamento',
  EM_REVISAO: 'revisao',
  CONCLUIDA: 'concluida',
  CANCELADA: 'cancelada'
};

// Quando a página terminar de carregar
document.addEventListener('DOMContentLoaded', async () => {
  // Verifica se existe usuário logado; se não existir, para aqui
  const usuario = await exigirUsuario();
  if (!usuario) {
    return;
  }

  // Quando o formulário de filtros for enviado, busca as demandas de novo
  document.querySelector('#filtros').addEventListener('submit', (event) => {
    event.preventDefault(); // evita recarregar a página
    carregarDemandas();
  });

  // Mostra a lista inicial
  await carregarDemandas();

  // Preenche os selects de projeto e responsável
  await carregarOpcoesFiltros();
});

// Busca projetos e usuários na API e coloca nos selects dos filtros
async function carregarOpcoesFiltros() {
  try {
    const projetos = await api('/projetos');
    const usuarios = await api('/usuarios');

    preencherSelect('filtro-projeto', projetos);
    preencherSelect('filtro-responsavel', usuarios);
  } catch (error) {
    // Se der erro, mostra um aviso embaixo do formulário
    const aviso = document.createElement('p');
    aviso.setAttribute('role', 'alert');
    aviso.textContent = 'Não foi possível carregar as opções dos filtros: ' + error.message;
    document.querySelector('#filtros').after(aviso);
  }
}

// Adiciona uma <option> no select para cada item da lista
function preencherSelect(idSelect, lista) {
  const select = document.getElementById(idSelect);

  for (const item of lista) {
    const opcao = new Option(item.nome, item.id); // texto, valor
    select.add(opcao);
  }
}

// Lê o valor de um filtro (vazio significa "sem filtro")
function pegarValor(idCampo) {
  return document.getElementById(idCampo).value.trim();
}

// Adiciona o filtro na consulta somente se ele foi preenchido
function adicionarFiltro(params, idCampo, nomeParametro) {
  const valor = pegarValor(idCampo);

  if (valor !== '') {
    params.set(nomeParametro, valor);
  }
}

// Monta a consulta, chama a API e mostra os cartões
async function carregarDemandas() {
  // Guarda os filtros que serão enviados (?busca=...&status=...)
  const params = new URLSearchParams();

  adicionarFiltro(params, 'filtro-busca', 'busca');
  adicionarFiltro(params, 'filtro-status', 'status');
  adicionarFiltro(params, 'filtro-prioridade', 'prioridade');
  adicionarFiltro(params, 'filtro-tipo', 'tipo');
  adicionarFiltro(params, 'filtro-projeto', 'projeto_id');
  adicionarFiltro(params, 'filtro-responsavel', 'responsavel_id');
  adicionarFiltro(params, 'filtro-ordenacao', 'ordenacao');

  // Mensagem enquanto carrega (aria-busy avisa leitores de tela)
  grid.textContent = 'Carregando demandas...';
  grid.setAttribute('aria-busy', 'true');

  try {
    // Pede as demandas para a API usando os filtros
    const demandas = await api('/demandas?' + params);

    // Limpa a área e cria um cartão para cada demanda
    grid.innerHTML = '';
    for (const demanda of demandas) {
      grid.append(criarCard(demanda));
    }

    // Se não veio nenhuma demanda, avisa o usuário
    if (demandas.length === 0) {
      grid.textContent = 'Nenhuma demanda encontrada.';
    }
  } catch (error) {
    // Mostra a mensagem de erro na tela
    grid.textContent = error.message;
  }

  // Terminou de carregar
  grid.setAttribute('aria-busy', 'false');
}

// Cria o cartão de uma demanda
// Usa textContent para inserir os textos, assim o conteúdo vindo da API não é interpretado como HTML
function criarCard(demanda) {
  const card = document.createElement('article');
  card.className = 'content-card card-demanda';

  // Cabeçalho: título e selos
  const header = document.createElement('div');
  header.className = 'card-header';

  const titulo = document.createElement('h3');
  titulo.className = 'card-title';
  titulo.textContent = demanda.titulo;

  const badges = document.createElement('div');
  badges.className = 'card-badges';

  // Selo de status
  const badgeStatus = document.createElement('span');
  badgeStatus.className = 'badge-custom badge-status-' + classesStatus[demanda.status];
  badgeStatus.textContent = rotulos[demanda.status];

  // Selo de prioridade
  const badgePrioridade = document.createElement('span');
  badgePrioridade.className = 'badge-custom badge-prioridade-' + demanda.prioridade.toLowerCase();
  badgePrioridade.textContent = rotulos[demanda.prioridade];

  badges.append(badgeStatus, badgePrioridade);
  header.append(titulo, badges);

  // Corpo: tipo, projeto e responsável
  const corpo = document.createElement('div');
  corpo.className = 'card-body';
  corpo.append(
    criarParagrafo('Tipo', rotulos[demanda.tipo]),
    criarParagrafo('Projeto', demanda.projeto_nome),
    criarParagrafo('Responsável', demanda.responsavel_nome || 'Não definido')
  );

  // Rodapé: datas
  const rodape = document.createElement('div');
  rodape.className = 'card-footer';
  rodape.append(
    criarParagrafo('Criado', formatarData(demanda.criado_em)),
    criarParagrafo('Prazo', formatarData(demanda.prazo))
  );

  // Botão que abre a tela de detalhes da demanda
  const botao = document.createElement('button');
  botao.className = 'btn-secondary-custom btn-detalhes';
  botao.textContent = 'Ver detalhes';
  botao.addEventListener('click', () => {
    window.location.href = 'detalhes.html?id=' + demanda.id;
  });

  // Junta tudo no cartão
  card.append(header, corpo, rodape, botao);

  return card;
}

// Cria um parágrafo no formato "Rótulo: valor" (rótulo em negrito)
function criarParagrafo(rotulo, valor) {
  const p = document.createElement('p');

  const negrito = document.createElement('strong');
  negrito.textContent = rotulo + ': ';

  p.append(negrito, valor || '—');

  return p;
}

// Formata a data para dd/mm/aaaa
function formatarData(valor) {
  // Sem data
  if (!valor) {
    return 'Não definido';
  }

  // Formato "aaaa-mm-dd": só inverte as partes
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor.split('-').reverse().join('/');
  }

  // Data com horário: converte para o horário de São Paulo
  return new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}