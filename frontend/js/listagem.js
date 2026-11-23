/*
Autora: Heloisa L Marinho - RA: 25893868
Tela: Listagem de Demandas
  - Busca demandas conforme os filtros escolhidos e transforma os dados recebidos em cartões visuais

Descrição: 
Monta a consulta de demandas a partir da pesquisa, dos filtros e da ordenação escolhidos. Envia os critérios à API,
exibe os resultados em cartões e oferece acesso aos detalhes de cada registro
*/

// Guarda a área onde os cartões das demandas serão exibidos
const grid = document.querySelector('#demandas-grid');

// Associa cada status à classe visual usada no selo
const classesStatus = {
  ABERTA: 'aberta',
  EM_ANDAMENTO: 'andamento',
  EM_REVISAO: 'revisao',
  CONCLUIDA: 'concluida',
  CANCELADA: 'cancelada'
};

// Aguarda o HTML carregar e inicia a tela de demandas
document.addEventListener('DOMContentLoaded', async () => {

  // Confere se existe um usuário autenticado
  const usuario = await exigirUsuario();
  if (!usuario) {
    return;
  }

  // Atualiza a lista quando o formulário de filtros é enviado
  document.querySelector('#filtros').addEventListener('submit', (event) => {

    // Impede que o navegador recarregue a página
    event.preventDefault();
    carregarDemandas();
  });

  // Busca e mostra a lista inicial de demandas
  await carregarDemandas();

  // Carrega as opções dos filtros de projeto e responsável
  await carregarOpcoesFiltros();
});

// Busca projetos e usuários e adiciona suas opções aos filtros
async function carregarOpcoesFiltros() {

  try {
    // Consulta os projetos disponíveis para o usuário autenticado
    const projetos = await api('/projetos');

    // Consulta os usuários disponíveis para o filtro de responsável
    const usuarios = await api('/usuarios');

    // Insere os projetos e usuários nos respectivos campos de seleção
    preencherSelect('filtro-projeto', projetos);
    preencherSelect('filtro-responsavel', usuarios);

  } catch (error) {
    // Cria um aviso abaixo do formulário caso as opções não carreguem
    const aviso = document.createElement('p');
    aviso.setAttribute('role', 'alert');
    aviso.textContent = 'Não foi possível carregar as opções dos filtros: ' + error.message;
    document.querySelector('#filtros').after(aviso);
  }
}

// Adiciona cada item da lista como uma opção em um campo select
function preencherSelect(idSelect, lista) {

  // Localiza o campo select pelo identificador usado no HTML
  const select = document.getElementById(idSelect);

  // Percorre os itens recebidos e cria uma opção para cada um
  for (const item of lista) {

    // Define o texto exibido e o valor enviado pelo filtro
    const opcao = new Option(item.nome, item.id);
    select.add(opcao);
  }
}

// Obtém o texto digitado ou selecionado em um filtro
function pegarValor(idCampo) {

  // Remove espaços extras e devolve o valor escolhido ou digitado
  return document.getElementById(idCampo).value.trim();
}

// Adiciona ao endereço da consulta somente os filtros preenchidos
function adicionarFiltro(params, idCampo, nomeParametro) {

  // Obtém o valor atual do campo informado
  const valor = pegarValor(idCampo);

  // Inclui o filtro na consulta somente quando tiver sido preenchido
  if (valor !== '') {
    params.set(nomeParametro, valor);
  }
}

// Monta os filtros, consulta a API e desenha os cartões
async function carregarDemandas() {

  // Guarda os parâmetros que serão enviados à API
  const params = new URLSearchParams();

  // Adiciona à consulta o texto digitado na busca
  adicionarFiltro(params, 'filtro-busca', 'busca');

  // Adiciona o status escolhido
  adicionarFiltro(params, 'filtro-status', 'status');

  // Adiciona a prioridade escolhida
  adicionarFiltro(params, 'filtro-prioridade', 'prioridade');

  // Adiciona o tipo escolhido
  adicionarFiltro(params, 'filtro-tipo', 'tipo');

  // Adiciona o projeto escolhido
  adicionarFiltro(params, 'filtro-projeto', 'projeto_id');

  // Adiciona a pessoa responsável escolhida
  adicionarFiltro(params, 'filtro-responsavel', 'responsavel_id');

  // Adiciona o critério de ordenação escolhido
  adicionarFiltro(params, 'filtro-ordenacao', 'ordenacao');

  // Mostra a mensagem de carregamento e informa o estado ao leitor de tela
  grid.textContent = 'Carregando demandas...';
  grid.setAttribute('aria-busy', 'true');

  try {
    // Solicita as demandas aplicando os filtros escolhidos
    const demandas = await api('/demandas?' + params);

    // Remove o carregamento e cria um cartão para cada demanda
    grid.innerHTML = '';
    for (const demanda of demandas) {
      grid.append(criarCard(demanda));
    }

    // Informa quando nenhum resultado foi encontrado
    if (demandas.length === 0) {
      grid.textContent = 'Nenhuma demanda encontrada.';
    }
  } catch (error) {
    // Exibe a mensagem devolvida pela API
    grid.textContent = error.message;
  }

  // Informa que o carregamento foi concluído
  grid.setAttribute('aria-busy', 'false');
}

// Cria o cartão de uma demanda usando dados da API
function criarCard(demanda) {

  // Cria o elemento principal do cartão
  const card = document.createElement('article');
  card.className = 'content-card card-demanda';

  // Cria o cabeçalho que contém título e selos
  const header = document.createElement('div');
  header.className = 'card-header';

  // Cria um elemento HTML do tipo título de nível 3
  const titulo = document.createElement('h3');
  titulo.className = 'card-title';
  titulo.textContent = demanda.titulo;

  // Cria um elemento que agrupa os selos de status e prioridade
  const badges = document.createElement('div');
  badges.className = 'card-badges';

  // Cria o selo do status atual
  const badgeStatus = document.createElement('span');

  // Forma a classe visual combinando badge e status
  badgeStatus.className = 'badge-custom badge-status-' + classesStatus[demanda.status];

  // Traduz o status para um texto exibido ao usuário
  badgeStatus.textContent = rotulos[demanda.status];

  // Cria o selo da prioridade
  const badgePrioridade = document.createElement('span');

  // Forma a classe visual usando a prioridade em letras minúsculas
  badgePrioridade.className = 'badge-custom badge-prioridade-' + demanda.prioridade.toLowerCase();
  
  // Traduz a prioridade para um texto exibido ao usuário
  badgePrioridade.textContent = rotulos[demanda.prioridade];

  // Junta os selos no grupo de badges
  badges.append(badgeStatus, badgePrioridade);

  // Junta o título e os selos no cabeçalho
  header.append(titulo, badges);

  // Cria o corpo com tipo, projeto e responsável
  const corpo = document.createElement('div');
  corpo.className = 'card-body';

  // Adiciona tipo, projeto e responsável ao corpo do cartão
  corpo.append(
    criarParagrafo('Tipo', rotulos[demanda.tipo]),
    criarParagrafo('Projeto', demanda.projeto_nome),
    criarParagrafo('Responsável', demanda.responsavel_nome || 'Não definido')
  );

  // Cria o rodapé com as datas de criação e prazo
  const rodape = document.createElement('div');
  rodape.className = 'card-footer';

  // Adiciona as datas de criação e prazo ao rodapé
  rodape.append(
    criarParagrafo('Criado', formatarData(demanda.criado_em)),
    criarParagrafo('Prazo', formatarData(demanda.prazo))
  );

  // Cria o botão que abre os detalhes da demanda
  const botao = document.createElement('button');
  botao.className = 'btn-secondary-custom btn-detalhes';
  botao.textContent = 'Ver detalhes';

  // Abre a página de detalhes enviando o identificador da demanda
  botao.addEventListener('click', () => {
    window.location.href = 'detalhes.html?id=' + demanda.id;
  });

  // Junta todas as partes no cartão
  card.append(header, corpo, rodape, botao);
  return card;
}

// Cria um parágrafo com um rótulo em destaque e seu valor
function criarParagrafo(rotulo, valor) {

  // Cria o parágrafo que receberá o rótulo e o valor
  const p = document.createElement('p');

  // Cria o texto em negrito usado como rótulo
  const negrito = document.createElement('strong');
  negrito.textContent = rotulo + ': ';

  // Junta o rótulo ao valor ou mostra um traço quando não existir valor
  p.append(negrito, valor || '—');
  return p;
}

// Converte a data recebida para o padrão brasileiro
function formatarData(valor) {

  // Considera uma data ausente como não definida
  if (!valor) {
    return 'Não definido';
  }

  // Separa uma data no formato ano-mês-dia e inverte suas partes
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor.split('-').reverse().join('/');
  }

  // Converte uma data completa para o horário de São Paulo
  return new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}