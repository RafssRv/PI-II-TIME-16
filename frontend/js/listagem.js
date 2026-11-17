// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
/* Autoria inicial: Heloisa L Marinho
Descrição: Integração da listagem e validação/ordenação dos filtros de busca */

// Integração: Vinicius Panutti Salgado — R.A. 25007329.
// Consulta a API; títulos e descrições recebidos são inseridos como texto.
// Obtém o contêiner que receberá os cartões ou as mensagens da consulta.
const grid = document.querySelector('#demandas-grid');
// Mantém a sequência das buscas para que uma resposta antiga não substitua a mais recente.
let consultaAtual = 0;
// Aguarda o DOM para configurar o formulário e carregar as opções dos filtros.
document.addEventListener('DOMContentLoaded', async () => {
  // Confirma a sessão antes de consultar dados protegidos.
  const usuarioListagem = await exigirUsuario();
  // Interrompe a inicialização quando não há usuário autenticado.
  if (!usuarioListagem) return;
  // Liga o envio do formulário à busca de demandas com os filtros escolhidos.
  document.querySelector('#filtros').addEventListener('submit', (event) => {
    // Impede o recarregamento de página provocado pelo envio padrão do formulário.
    event.preventDefault();
    // Dispara uma nova consulta com os valores atuais dos campos.
    carregarDemandas();
  });
  // Carrega a primeira listagem antes de buscar as opções auxiliares dos filtros.
  await carregarDemandas();
  // Trata separadamente falhas ao preencher projetos e responsáveis.
  try {
    // Consulta projetos e usuários em paralelo, aguardando os dois resultados.
    const [projetos, usuarios] = await Promise.all([api('/projetos'), api('/usuarios')]);
    // Associa cada coleção ao seletor correspondente da interface.
    for (const [id, items] of [['filtro-projeto', projetos], ['filtro-responsavel', usuarios]]) {
      // Obtém o seletor do projeto ou do responsável desta iteração.
      const select = document.getElementById(id);
      // Cria opções com nome visível e identificador enviado como valor do filtro.
      items.forEach((item) => select.add(new Option(item.nome, item.id)));
    }
  // Captura falhas nas consultas auxiliares ou no preenchimento dos seletores.
  } catch (error) {
    // Cria um parágrafo de alerta para anunciar a falha também a tecnologias assistivas.
    const aviso = document.createElement('p'); aviso.role = 'alert';
    // Junta uma explicação da operação à mensagem recebida do erro, inserindo-a como texto.
    aviso.textContent = `Não foi possível carregar as opções dos filtros: ${error.message}`;
    // Insere o aviso após o formulário sem substituir a listagem já carregada.
    document.querySelector('#filtros').after(aviso);
  }
});

// Converte os campos da interface em uma consulta e redesenha o resultado mais recente.
async function carregarDemandas() {
  // Incrementa o identificador global e guarda o número exclusivo desta requisição.
  const consulta = ++consultaAtual;
  // Cria parâmetros de URL que codificam caracteres especiais dos valores de busca.
  const params = new URLSearchParams();
  // Declara a correspondência entre ids do HTML, nomes da API e transformação de valores.
  const filtros = [
    // Envia a busca textual como foi escrita, após a remoção de espaços nas extremidades.
    ['filtro-busca', 'busca', (valor) => valor],
    // Traduz o status escolhido para o código esperado pela API.
    ['filtro-status', 'status', normalizar],
    // Traduz a prioridade escolhida para o código esperado pela API.
    ['filtro-prioridade', 'prioridade', normalizar],
    // Passa o tipo pelo mesmo normalizador; valores sem tradução são preservados.
    ['filtro-tipo', 'tipo', normalizar],
    // Encaminha o identificador selecionado do projeto sem alterar o texto do valor.
    ['filtro-projeto', 'projeto_id', (valor) => valor],
    // Encaminha o identificador selecionado do responsável.
    ['filtro-responsavel', 'responsavel_id', (valor) => valor],
    // Encaminha o código de ordenação escolhido no formulário.
    ['filtro-ordenacao', 'ordenacao', (valor) => valor],
  ];
  // Percorre as correspondências declaradas para ler cada campo uma única vez.
  for (const [id, parametro, transformar] of filtros) {
    // Lê o valor e remove espaços antes de decidir se ele é um filtro efetivo.
    const valor = document.getElementById(id).value.trim();
    // Ignora valores vazios e opções genéricas como todos e selecione.
    if (valor && !['todos', 'selecione'].includes(valor.toLowerCase())) {
      // Acrescenta apenas os filtros ativos à query string, usando sua transformação.
      params.set(parametro, transformar(valor));
    }
  }
  // Substitui o conteúdo anterior pelo aviso de carregamento.
  grid.textContent = 'Carregando demandas...';
  // Informa aos leitores de tela que o contêiner está sendo atualizado.
  grid.setAttribute('aria-busy', 'true');
  // Agrupa a consulta e a renderização no mesmo tratamento de erro.
  try {
    // Busca no servidor as demandas filtradas e ordenadas.
    const demandas = await api(`/demandas?${params}`);
    // Descarta a resposta se outra consulta tiver sido iniciada enquanto esta aguardava.
    if (consulta !== consultaAtual) return;
    // Substitui o conteúdo pelos cartões criados para os registros recebidos.
    grid.replaceChildren(...demandas.map(criarCard));
    // Apresenta uma mensagem explícita quando a consulta válida não retorna registros.
    if (!demandas.length) grid.textContent = 'Nenhuma demanda encontrada.';
  // Recebe falhas da consulta ou da construção dos cartões.
  } catch (error) {
    // Somente a consulta mais recente pode escrever sua mensagem de erro na tela.
    if (consulta === consultaAtual) grid.textContent = error.message;
  // Finaliza o indicador de atividade mesmo quando a busca falha.
  } finally {
    // Evita que uma consulta antiga retire o estado ocupado de outra ainda em andamento.
    if (consulta === consultaAtual) grid.setAttribute('aria-busy', 'false');
  }
}

// Traduz os valores simplificados do formulário para os códigos usados pelo backend.
function normalizar(value) {
  // Consulta o mapa de status e prioridades; códigos não mapeados continuam com o valor original.
  return ({ aberta: 'ABERTA', andamento: 'EM_ANDAMENTO', revisao: 'EM_REVISAO', concluida: 'CONCLUIDA', cancelada: 'CANCELADA', critica: 'CRITICA', alta: 'ALTA', media: 'MEDIA', baixa: 'BAIXA' })[value] || value;
}
// Monta um cartão completo usando elementos DOM e texto, sem construir HTML com dados da API.
function criarCard(demanda) {
  // Cria o article e aplica as classes de estrutura e aparência do cartão.
  const card = document.createElement('article'); card.className = 'content-card card-demanda';
  // Cria o cabeçalho em que serão agrupados título e etiquetas.
  const header = document.createElement('div'); header.className = 'card-header';
  // Cria o título e insere o nome da demanda como texto literal.
  const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = demanda.titulo;
  // Cria o agrupamento visual das etiquetas de status e prioridade.
  const badges = document.createElement('div'); badges.className = 'card-badges';
  // Calcula os sufixos CSS de status e prioridade e percorre as duas etiquetas.
  for (const [campo, classe] of [['status', ({ ABERTA: 'aberta', EM_ANDAMENTO: 'andamento', EM_REVISAO: 'revisao', CONCLUIDA: 'concluida', CANCELADA: 'cancelada' })[demanda.status]], ['prioridade', demanda.prioridade.toLowerCase()]]) {
    // Cria a etiqueta com a cor correspondente e traduz seu código para o rótulo visível.
    const badge = document.createElement('span'); badge.className = `badge-custom badge-${campo}-${classe}`; badge.textContent = rotulos[demanda[campo]];
    // Acrescenta a etiqueta ao seu agrupamento.
    badges.append(badge);
  }
  // Adiciona o título e o conjunto de etiquetas ao cabeçalho.
  header.append(title, badges);
  // Cria o corpo do cartão para os dados descritivos.
  const info = document.createElement('div'); info.className = 'card-body';
  // Acrescenta tipo, projeto e responsável; a ausência de responsável recebe texto explícito.
  info.append(paragrafo('Tipo', rotulos[demanda.tipo]), paragrafo('Projeto', demanda.projeto_nome), paragrafo('Responsável', demanda.responsavel_nome || 'Não definido'));
  // Cria o rodapé que agrupa as datas da demanda.
  const footer = document.createElement('div'); footer.className = 'card-footer';
  // Formata e acrescenta as datas de criação e de prazo com seus rótulos.
  footer.append(paragrafo('Criado', dataListagem(demanda.criado_em)), paragrafo('Prazo', dataListagem(demanda.prazo)));
  // Cria o botão de navegação para a página de detalhes e define seu texto.
  const button = document.createElement('button'); button.className = 'btn-secondary-custom btn-detalhes'; button.textContent = 'Ver detalhes';
  // Liga o clique ao endereço de detalhes com o identificador desta demanda na URL.
  button.onclick = () => { window.location.href = `detalhes.html?id=${demanda.id}`; };
  // Junta as seções e o botão na ordem de exibição, devolvendo o cartão completo.
  card.append(header, info, footer, button); return card;
}
// Constrói um parágrafo de informação com rótulo destacado e valor textual.
function paragrafo(label, value) {
  // Cria o parágrafo e o elemento strong reservado ao rótulo.
  const p = document.createElement('p'); const strong = document.createElement('strong');
  // Destaca o rótulo, insere o valor ou um travessão quando vazio e devolve o parágrafo.
  strong.textContent = `${label}: `; p.append(strong, value || '—'); return p;
}
// Formata datas sem deslocar prazos civis para o dia anterior por conversão de fuso.
function dataListagem(value) {
  // Mostra um rótulo explícito quando a data não está definida.
  if (!value) return 'Não definido';
  // Reconhece AAAA-MM-DD e inverte suas partes sem criar um objeto Date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  // Para valores temporais completos, apresenta a data em português no fuso de São Paulo.
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
