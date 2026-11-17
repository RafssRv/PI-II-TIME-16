// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
// Autoria inicial: Priscila Amorim
// Descrição: Consulta detalhes, comentários e histórico; permite editar e acompanhar o ciclo da demanda.
// As validações da edição seguem: ler, validar, mostrar os erros e só então enviar.

// Estado da tela: usuário logado, demanda carregada e dados usados na janela de edição.
// Reserva o usuário autenticado; null indica que a confirmação da sessão ainda não terminou.
let usuario = null;
// O id da demanda vem da URL (detalhes.html?id=N).
// Lê o parâmetro id da URL e o converte para número antes de validar e consultar a demanda.
const demandaId = Number(new URLSearchParams(window.location.search).get('id'));
// Guarda o elemento dialog usado como janela modal da edição.
const dialogoEdicao = document.querySelector('#dialog-edicao');
// Guarda o formulário cujos campos serão validados antes do PATCH.
const formularioEdicao = document.querySelector('#form-edicao');
// Guarda o alerta geral exibido acima dos detalhes da demanda.
const mensagemErro = document.querySelector('#mensagem-erro');
// Como cada campo aparece na frase do histórico ("alterou o prazo: ...").
// Relaciona os nomes de campos da API a expressões usadas nas frases do histórico.
const rotulosHistorico = {
  // Define os rótulos dos campos descritivos que podem aparecer nas alterações.
  titulo: 'o título', descricao: 'a descrição', tipo: 'o tipo', prioridade: 'a prioridade',
  // Define os rótulos de estado, prazo e relacionamentos da demanda.
  status: 'o status', prazo: 'o prazo', responsavel_id: 'o responsável', projeto_id: 'o projeto'
};
// Mantém a última versão da demanda recebida da API para preencher a tela e comparar edições.
let demandaAtual = null;
// Armazena os membros do projeto para montar o seletor e traduzir ids do histórico.
let membrosProjeto = [];
// Armazena os projetos visíveis ao usuário para oferecer destinos na edição.
let projetosDisponiveis = [];
// Controles contra cliques repetidos e respostas fora de ordem na janela de edição.
// Guarda o projeto efetivamente carregado no editor para restaurá-lo se a troca falhar.
let projetoEdicaoAtual = '';
// Numera consultas de membros e permite descartar respostas que chegaram fora de ordem.
let consultaMembrosEdicao = 0;
// Indica se a equipe de um projeto ainda está sendo carregada.
let carregandoMembrosEdicao = false;
// Impede salvamentos duplicados e o fechamento do editor enquanto o PATCH está pendente.
let salvandoEdicao = false;

// Próximos status permitidos para Administrador e Líder (ciclo de vida do escopo).
// CANCELADA → ABERTA é a reabertura. O Membro tem regras próprias em obterStatusPossiveis.
// Define as transições oferecidas pela interface aos perfis de gestão, com validação final na API.
const opcoesStatus = {
  // Uma demanda aberta pode ser encaminhada para execução.
  ABERTA: ['EM_ANDAMENTO'],
  // Uma demanda em andamento pode seguir para revisão.
  EM_ANDAMENTO: ['EM_REVISAO'],
  // Uma demanda em revisão pode voltar à execução ou ser concluída.
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA'],
  // Não oferece novas transições para uma demanda concluída.
  CONCLUIDA: [],
  // Permite oferecer reabertura de uma demanda cancelada para o estado ABERTA.
  CANCELADA: ['ABERTA']
};

// Ao carregar a página: confirma a sessão e busca a demanda.
// Aguarda o DOM completo antes de iniciar a verificação da sessão e a leitura da demanda.
document.addEventListener('DOMContentLoaded', async function () {
  // Obtém o usuário pelo helper de sessão compartilhado pela interface.
  usuario = await exigirUsuario();
  // Só consulta a demanda quando existe um usuário autenticado.
  if (usuario) await carregar();
});
// Ligação dos botões e eventos da página.
// Liga o botão de comentar à validação e ao envio de um novo comentário.
document.querySelector('#btn-comentar').addEventListener('click', comentar);
// Liga o botão de editar ao preenchimento e à abertura do modal.
document.querySelector('#btn-editar').addEventListener('click', abrirEdicao);
// Liga o botão de status ao fluxo de validação e atualização do ciclo da demanda.
document.querySelector('#btn-atualizar-status').addEventListener('click', atualizarStatus);
// Liga o botão de cancelamento à confirmação e ao PATCH do status CANCELADA.
document.querySelector('#btn-cancelar-demanda').addEventListener('click', cancelarDemanda);
// Faz o controle de fechar respeitar o bloqueio durante o salvamento.
document.querySelector('#fechar-edicao').addEventListener('click', fecharEdicao);
// Aplica o mesmo fechamento seguro ao botão de desistir da edição.
document.querySelector('#cancelar-edicao').addEventListener('click', fecharEdicao);
// Intercepta o envio do formulário para validar e salvar pela API.
formularioEdicao.addEventListener('submit', salvarEdicao);
// Impede que a tecla Esc feche a janela enquanto a edição está sendo salva.
// Intercepta o evento nativo cancel do dialog, disparado pela tecla Esc.
dialogoEdicao.addEventListener('cancel', function (event) {
  // Impede o fechamento por Esc somente enquanto uma edição está sendo enviada.
  if (salvandoEdicao) event.preventDefault();
});
// Recarrega as opções de responsáveis quando o projeto selecionado muda.
document.querySelector('#edicao-projeto').addEventListener('change', trocarProjetoEdicao);

// Busca a demanda (com comentários e histórico) e atualiza a tela.
// Coordena a leitura da demanda, os dados auxiliares e a renderização da página.
async function carregar() {
  // Rejeita ids fracionários, ausentes convertidos em zero ou menores que um antes da consulta.
  if (!Number.isInteger(demandaId) || demandaId < 1) {
    // Esconde os cartões para não deixar conteúdo de exemplo ou de uma leitura anterior visível.
    ocultarConteudoDemanda();
    // Informa que o endereço não contém um identificador aceito.
    exibirErro('Identificador de demanda inválido.');
    // Encerra este carregamento sem enviar uma requisição com id inválido.
    return;
  }

  // Esconde o alerta da tentativa anterior antes de começar uma nova leitura.
  mensagemErro.hidden = true;
  // Captura falhas da consulta e das etapas de preparação da tela.
  try {
    // Busca o registro identificado na URL e guarda a versão retornada pelo servidor.
    demandaAtual = await api(`/demandas/${demandaId}`);
    // Atualiza textos, etiquetas e controles de ação conforme a demanda e o perfil atual.
    preencherDetalhes(demandaAtual);
    // Aguarda os dados de equipe e projetos usados pelo formulário de edição.
    await carregarMembros();
    // Habilita a edição após essa etapa de preparação; a visibilidade continua dependente do perfil.
    document.querySelector('#btn-editar').disabled = false;
    // Renderiza a lista de comentários; ausência da propriedade é tratada como lista vazia.
    renderizarComentarios(demandaAtual.comentarios || []);
    // Renderiza o histórico com a mesma alternativa de lista vazia.
    renderizarHistorico(demandaAtual.historico || []);
  // Recebe a falha de alguma etapa do carregamento.
  } catch (error) {
    // Oculta os cartões quando os detalhes não puderam ser carregados com sucesso.
    ocultarConteudoDemanda();
    // Mostra ao usuário a mensagem entregue pelo erro.
    exibirErro(error.message);
  }
}

// Esconde os cartões quando a demanda não pode ser exibida (id inválido ou erro na busca).
// Agrupa a ocultação das seções de conteúdo quando a demanda não pode ser apresentada.
function ocultarConteudoDemanda() {
  // Seleciona os cartões e a grade que são filhos diretos do conteúdo principal.
  document.querySelectorAll(
    // O seletor cobre o cartão superior e a grade de detalhes, sem atingir a área geral de erro.
    '.main-content > .content-card, .main-content > .details-grid'
  // Percorre cada seção selecionada para ocultá-la individualmente.
  ).forEach((elemento) => {
    // Aplica hidden à seção para removê-la da apresentação.
    elemento.hidden = true;
  });
}

// Escreve os dados da demanda na tela e define quais botões o perfil pode ver.
// Preenche os detalhes com texto literal e ajusta os controles disponíveis na interface.
function preencherDetalhes(demanda) {
  // Formata o identificador com prefixo DEM- e ao menos três algarismos.
  document.querySelector('.demand-id').textContent = `DEM-${String(demanda.id).padStart(3, '0')}`;
  // Escreve o título como texto para não interpretar marcação recebida da API.
  document.querySelector('.demand-title').textContent = demanda.titulo;
  // Escreve a descrição da demanda no espaço reservado a ela.
  document.querySelector('#descricao-demanda').textContent = demanda.descricao;

  // Etiquetas na ordem do HTML: tipo, prioridade e status (a cor vem da classe).
  // Obtém as três etiquetas na ordem usada pelo HTML: tipo, prioridade e status.
  const badges = document.querySelectorAll('.badges span');
  // Exibe o rótulo do tipo ou o código original se ainda não houver tradução.
  badges[0].textContent = rotulos[demanda.tipo] || demanda.tipo;
  // Traduz a prioridade para o texto que será exibido ao usuário.
  badges[1].textContent = rotulos[demanda.prioridade] || demanda.prioridade;
  // Calcula a classe visual da prioridade a partir do código em minúsculas.
  badges[1].className = `badge-custom badge-prioridade-${String(demanda.prioridade).toLowerCase()}`;
  // Traduz o status atual para sua forma legível.
  badges[2].textContent = rotulos[demanda.status] || demanda.status;
  // Aplica a classe visual de status usando o mapa de sufixos CSS.
  badges[2].className = `badge-custom badge-status-${classeStatus(demanda.status)}`;

  // Os valores seguem a mesma ordem dos itens da lista de informações no HTML.
  // Obtém os espaços de informação na ordem em que os valores serão atribuídos.
  const valores = document.querySelectorAll('.info-value');
  // Monta a sequência de valores correspondente aos elementos .info-value.
  [
    // Coloca o nome do projeto na primeira posição dessa sequência.
    demanda.projeto_nome,
    // Mostra um rótulo explícito quando não existe responsável atribuído.
    demanda.responsavel_nome || 'Não definido',
    // Formata a data de criação para o campo correspondente.
    formatarData(demanda.criado_em),
    // Formata a data da última atualização para o campo seguinte.
    formatarData(demanda.atualizado_em),
    // Formata o prazo, preservando o dia civil quando a API retorna apenas uma data.
    formatarData(demanda.prazo)
  // Escreve cada valor no elemento de mesmo índice, sem gerar HTML a partir dos dados.
  ].forEach((valor, indice) => { valores[indice].textContent = valor; });

  // Só Administrador e Líder editam e cancelam. O botão Editar só é habilitado
  // depois que a equipe do projeto termina de carregar (em carregar).
  // Verifica se o perfil pode ver ações de gestão; a API também aplica suas próprias permissões.
  const podeGerenciar = ['ADMIN', 'LIDER'].includes(usuario.perfil);
  // Oculta o botão Editar para usuários sem perfil ADMIN ou LIDER.
  document.querySelector('#btn-editar').hidden = !podeGerenciar;
  // Mantém a edição bloqueada até que carregar() conclua a preparação das opções.
  document.querySelector('#btn-editar').disabled = true;
  // Oculta Cancelar para perfis sem gestão e para demandas já concluídas ou canceladas.
  document.querySelector('#btn-cancelar-demanda').hidden = !podeGerenciar || ['CONCLUIDA', 'CANCELADA'].includes(demanda.status);
  // Recalcula os próximos status e a apresentação do controle de reabertura.
  preencherTransicoes(demanda);
}

// Monta o seletor de próximo status; em demanda cancelada vira o botão "Reabrir demanda".
// Monta as opções de status a partir do estado atual e do usuário autenticado.
function preencherTransicoes(demanda) {
  // Obtém o seletor de próximo status.
  const select = document.querySelector('#novo-status');
  // Obtém o botão que confirma a atualização do status.
  const botao = document.querySelector('#btn-atualizar-status');
  // Calcula as transições que a interface pode oferecer para esta demanda.
  const statusPossiveis = obterStatusPossiveis(demanda);

  // Reinicia as opções com uma instrução adequada à existência ou não de transições.
  select.replaceChildren(new Option(statusPossiveis.length ? 'Escolha o próximo status...' : 'Sem transição disponível', ''));
  // Adiciona cada status permitido com rótulo visível e código enviado à API.
  statusPossiveis.forEach((status) => select.add(new Option(rotulos[status], status)));
  // Reconhece o caso especial em que a demanda cancelada pode voltar para ABERTA.
  const podeReabrir = demanda.status === 'CANCELADA' && statusPossiveis.includes('ABERTA');
  // Preseleciona ABERTA para que o botão de reabertura funcione sem escolha adicional.
  if (podeReabrir) select.value = 'ABERTA';
  // Esconde o seletor quando não há transições ou quando a única ação apresentada é reabrir.
  select.hidden = statusPossiveis.length === 0 || podeReabrir;
  // Esconde o botão se não houver próximo estado disponível.
  botao.hidden = statusPossiveis.length === 0;
  // Ajusta o texto do botão entre reabertura e atualização comum de status.
  botao.textContent = podeReabrir ? 'Reabrir demanda' : 'Salvar status';
}

// Mantém as transições e as permissões definidas no escopo do projeto.
// Consulta as regras de transição conforme o perfil e a atribuição da demanda.
function obterStatusPossiveis(demanda) {
  // Aplica as restrições específicas do perfil MEMBRO.
  if (usuario.perfil === 'MEMBRO') {
    // Não oferece transições ao membro que não é o responsável atual da demanda.
    if (Number(demanda.responsavel_id) !== Number(usuario.id)) return [];
    // Limita o responsável membro a iniciar a execução ou encaminhar para revisão.
    const apenasMembro = { ABERTA: ['EM_ANDAMENTO'], EM_ANDAMENTO: ['EM_REVISAO'] };
    // Devolve as transições do membro ou uma lista vazia para estados sem ação disponível.
    return apenasMembro[demanda.status] || [];
  }
  // Para os demais perfis, usa o mapa geral de transições ou uma lista vazia.
  return opcoesStatus[demanda.status] || [];
}

// Para Administrador e Líder, busca a equipe do projeto e a lista de projetos usadas no formulário de edição.
// Consulta as coleções necessárias à edição sem reutilizar opções de uma demanda anterior.
async function carregarMembros() {
  // Limpa a equipe previamente carregada antes de atualizar os dados auxiliares.
  membrosProjeto = [];
  // Limpa os projetos previamente carregados.
  projetosDisponiveis = [];
  // Evita essas consultas quando a demanda não existe ou o perfil não pode editar.
  if (!demandaAtual || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;
  // Trata as falhas das duas consultas auxiliares.
  try {
    // Aguarda as consultas em paralelo e atribui cada resultado à coleção correspondente.
    [membrosProjeto, projetosDisponiveis] = await Promise.all([
      // Busca a equipe do projeto atual e os projetos que o usuário pode consultar.
      api(`/projetos/${demandaAtual.projeto_id}/membros`), api('/projetos')
    ]);
  } catch (error) {
    // Apresenta a falha das opções auxiliares no alerta geral da tela.
    exibirErro(error.message);
  }
}

// Preenche o formulário com os dados atuais da demanda e abre a janela de edição.
// Prepara uma nova edição usando os valores atuais, sem enviar dados neste momento.
function abrirEdicao() {
  // Impede abrir o editor sem demanda, durante outro salvamento ou sem perfil de gestão.
  if (!demandaAtual || salvandoEdicao || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;
  // Invalida respostas antigas de consultas de equipe ainda pendentes.
  consultaMembrosEdicao += 1;
  // Reinicia o estado de carregamento de membros para esta abertura do editor.
  carregandoMembrosEdicao = false;
  // Habilita o botão de salvar ao iniciar uma nova edição.
  formularioEdicao.querySelector('[type="submit"]').disabled = false;
  // Preenche o título com o valor persistido da demanda.
  document.querySelector('#edicao-titulo').value = demandaAtual.titulo;
  // Preenche a descrição com o texto persistido.
  document.querySelector('#edicao-descricao').value = demandaAtual.descricao;
  // Seleciona o tipo atual da demanda.
  document.querySelector('#edicao-tipo').value = demandaAtual.tipo;
  // Seleciona a prioridade atual da demanda.
  document.querySelector('#edicao-prioridade').value = demandaAtual.prioridade;
  // Preenche o prazo ou deixa o campo vazio quando a demanda não o possui.
  document.querySelector('#edicao-prazo').value = demandaAtual.prazo || '';

  // Obtém o seletor de projeto do editor.
  const projeto = document.querySelector('#edicao-projeto');
  // Reconstrói as opções usando os projetos já carregados para o usuário.
  projeto.replaceChildren(...projetosDisponiveis.map((item) => new Option(item.nome, item.id)));
  // Se o projeto atual não está na lista do usuário, ele aparece desabilitado, só para exibição.
  // Detecta quando o projeto atual não está entre as opções disponíveis para edição.
  if (!projetosDisponiveis.some((item) => Number(item.id) === Number(demandaAtual.projeto_id))) {
    // Cria uma opção que permite identificar visualmente o projeto atual mesmo nessa situação.
    const atual = new Option(demandaAtual.projeto_nome, demandaAtual.projeto_id);
    // Desabilita essa opção para que ela sirva à exibição, sem oferecer um destino indisponível.
    atual.disabled = true;
    // Acrescenta o projeto atual à lista de opções do seletor.
    projeto.add(atual);
  }
  // Seleciona o projeto persistido, convertendo o id para o texto usado pelo elemento select.
  projeto.value = String(demandaAtual.projeto_id);
  // Habilita a escolha de projeto ao abrir o editor.
  projeto.disabled = false;
  // Guarda o valor inicial como referência para uma eventual restauração após falha na troca.
  projetoEdicaoAtual = projeto.value;
  // Esconde o aviso de troca de projeto que possa ter sobrado de uma edição anterior.
  document.querySelector('#edicao-projeto-aviso').hidden = true;

  // Obtém o seletor de responsável do editor.
  const responsavel = document.querySelector('#edicao-responsavel');
  // Habilita a escolha do responsável nesta abertura.
  responsavel.disabled = false;
  // Reinicia as opções com a possibilidade de deixar a demanda sem responsável.
  responsavel.replaceChildren(new Option('Sem responsável definido', ''));
  // Adiciona os membros já carregados da equipe do projeto atual.
  membrosProjeto.forEach((membro) => responsavel.add(new Option(membro.nome, membro.id)));
  // Mantém na lista um responsável que já não está na equipe, para não removê-lo sem querer.
  // Detecta um responsável persistido que já não aparece na equipe carregada.
  if (demandaAtual.responsavel_id && !membrosProjeto.some((membro) => Number(membro.id) === Number(demandaAtual.responsavel_id))) {
    // Preserva sua identificação no seletor, evitando removê-lo apenas por abrir a edição.
    responsavel.add(new Option(demandaAtual.responsavel_nome || `Usuário ${demandaAtual.responsavel_id}`, demandaAtual.responsavel_id));
  }
  // Seleciona o responsável atual ou a opção vazia quando ele não estiver definido.
  responsavel.value = demandaAtual.responsavel_id || '';
  // Limpa marcas e mensagens de validação de uma tentativa anterior.
  limparErrosEdicao();
  // Abre o dialog como modal, concentrando a interação no formulário de edição.
  dialogoEdicao.showModal();
}

// Recarrega a equipe ao trocar de projeto e evita manter um responsável sem vínculo no destino.
// Atualiza a equipe ao mudar o projeto e impede que respostas antigas interfiram na escolha.
async function trocarProjetoEdicao() {
  // Não permite iniciar uma troca de projeto enquanto a edição está sendo salva.
  if (salvandoEdicao) return;
  // Número desta consulta: se o usuário trocar de projeto de novo, a resposta antiga é descartada.
  // Reserva um número exclusivo para identificar a consulta de membros desta troca.
  const consulta = ++consultaMembrosEdicao;
  // Obtém o campo que contém o projeto escolhido.
  const projeto = document.querySelector('#edicao-projeto');
  // Obtém o campo que receberá os membros da equipe de destino.
  const responsavel = document.querySelector('#edicao-responsavel');
  // Obtém o botão que ficará bloqueado enquanto as opções forem consultadas.
  const submit = formularioEdicao.querySelector('[type="submit"]');
  // Obtém o espaço usado para indicar carregamento ou incompatibilidade de responsável.
  const aviso = document.querySelector('#edicao-projeto-aviso');
  // Preserva o projeto anterior para restaurá-lo se a nova consulta falhar.
  const anterior = projetoEdicaoAtual;
  // Preserva a seleção anterior do responsável para verificar sua presença na nova equipe.
  const responsavelAnterior = responsavel.value;
  // Lê o identificador do projeto que acaba de ser selecionado.
  const projetoId = projeto.value;
  // Bloqueia os campos enquanto a equipe do novo projeto carrega.
  // Marca que a consulta de equipe está pendente.
  carregandoMembrosEdicao = true;
  // Bloqueia projeto, responsável e envio enquanto a resposta não chega.
  projeto.disabled = responsavel.disabled = submit.disabled = true;
  // Escreve o aviso de consulta da equipe do novo projeto.
  aviso.textContent = 'Carregando responsáveis do projeto...';
  // Revela esse aviso durante o carregamento.
  aviso.hidden = false;
  // Limpa a mensagem geral de erro da edição antes da nova tentativa.
  mostrarErroEdicao('');
  // Protege a consulta e a atualização dos seletores com tratamento de erro e liberação final.
  try {
    // Consulta somente os membros do projeto recém-escolhido.
    const membros = await api(`/projetos/${projetoId}/membros`);
    // Descarta a resposta se outra consulta a substituiu ou se o modal foi fechado.
    if (consulta !== consultaMembrosEdicao || !dialogoEdicao.open) return;
    // Reconstrói as opções de responsável com a alternativa vazia e os membros da nova equipe.
    responsavel.replaceChildren(new Option('Sem responsável definido', ''), ...membros.map((membro) => new Option(membro.nome, membro.id)));
    // Verifica se o responsável anteriormente selecionado também pertence ao projeto de destino.
    const manterResponsavel = membros.some((membro) => String(membro.id) === responsavelAnterior);
    // Mantém o responsável apenas quando encontrado na nova equipe; caso contrário, limpa a seleção.
    responsavel.value = manterResponsavel ? responsavelAnterior : '';
    // Registra o projeto cuja equipe foi carregada com sucesso.
    projetoEdicaoAtual = projetoId;
    // Prepara a explicação exibida quando o responsável anterior não pode ser mantido.
    aviso.textContent = 'O responsável anterior não pertence ao projeto selecionado. Escolha outro ou mantenha a demanda sem responsável.';
    // Exibe esse aviso somente se havia responsável e ele não pertence à equipe de destino.
    aviso.hidden = !responsavelAnterior || manterResponsavel;
  // Captura erros da busca de membros ou da atualização das opções.
  } catch (error) {
    // Ignora também erros de consultas ultrapassadas ou de um editor já fechado.
    if (consulta !== consultaMembrosEdicao || !dialogoEdicao.open) return;
    // Se a consulta falhou, volta ao projeto anterior.
    // Restaura a seleção do projeto cuja equipe havia sido carregada anteriormente.
    projeto.value = anterior;
    // Oculta o aviso transitório de carregamento ou troca de responsável.
    aviso.hidden = true;
    // Mostra o motivo pelo qual não foi possível concluir a troca de projeto.
    mostrarErroEdicao(error.message);
  // Executa a liberação dos controles ao terminar a tentativa atual.
  } finally {
    // Só altera o estado se esta continua sendo a consulta ativa de um modal aberto.
    if (consulta === consultaMembrosEdicao && dialogoEdicao.open) {
      // Registra que o carregamento da equipe terminou.
      carregandoMembrosEdicao = false;
      // Habilita novamente os seletores e o botão de envio.
      projeto.disabled = responsavel.disabled = submit.disabled = false;
    }
  }
}

// Fecha a janela de edição, exceto enquanto o salvamento está em andamento.
// Centraliza o fechamento do editor para todos os controles que podem solicitá-lo.
function fecharEdicao() {
  // Fecha somente quando não existe uma gravação em andamento.
  if (!salvandoEdicao) dialogoEdicao.close();
}

// Valida o formulário, envia só o que mudou e recarrega a tela.
// Lê o formulário, valida cada campo e envia apenas as diferenças em relação à demanda atual.
async function salvarEdicao(event) {
  // Impede o envio HTML padrão e mantém o usuário na tela de detalhes.
  event.preventDefault();
  // Evita envio sem demanda, com opções pendentes, em duplicidade ou sem perfil de gestão.
  if (!demandaAtual || carregandoMembrosEdicao || salvandoEdicao || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;

  // Remove os erros da tentativa anterior para apresentar apenas a validação atual.
  limparErrosEdicao();
  // Obtém o campo do título para leitura e eventual destaque de erro.
  const campoTitulo = document.querySelector('#edicao-titulo');
  // Obtém o campo da descrição para leitura e validação.
  const campoDescricao = document.querySelector('#edicao-descricao');
  // Obtém o seletor do tipo de demanda.
  const campoTipo = document.querySelector('#edicao-tipo');
  // Obtém o seletor da prioridade de atendimento.
  const campoPrioridade = document.querySelector('#edicao-prioridade');
  // Obtém o seletor do projeto de destino.
  const campoProjeto = document.querySelector('#edicao-projeto');
  // Obtém o seletor do novo responsável.
  const campoResponsavel = document.querySelector('#edicao-responsavel');
  // Remove espaços externos do título antes de validar e comparar com o registro atual.
  const titulo = campoTitulo.value.trim();
  // Remove espaços externos da descrição sem alterar o conteúdo interno do texto.
  const descricao = campoDescricao.value.trim();
  // Lê o código do tipo selecionado.
  const tipo = campoTipo.value;
  // Lê o código da prioridade selecionada.
  const prioridade = campoPrioridade.value;
  // Converte o identificador do projeto para permitir validação numérica.
  const projetoId = Number(campoProjeto.value);
  // Mantém o responsável como texto nesta etapa, preservando a opção vazia.
  const responsavelNovo = campoResponsavel.value;
  // Acumula o resultado das validações para permitir mostrar vários erros de uma vez.
  let formularioValido = true;

  // Apresenta todos os erros da tentativa
  // Detecta a ausência de título depois da remoção dos espaços externos.
  if (titulo === '') {
    // Mostra a obrigatoriedade junto ao campo do título.
    mostrarErroCampo(campoTitulo, document.querySelector('#erro-edicao-titulo'), 'O título é obrigatório.');
    // Marca a tentativa como inválida sem interromper a validação dos outros campos.
    formularioValido = false;
  // Verifica o intervalo de três a cem caracteres para o título preenchido.
  } else if (titulo.length < 3 || titulo.length > 100) {
    // Informa o tamanho aceito junto ao campo do título.
    mostrarErroCampo(campoTitulo, document.querySelector('#erro-edicao-titulo'), 'O título deve ter entre 3 e 100 caracteres.');
    // Mantém o resultado global inválido quando o tamanho do título não é aceito.
    formularioValido = false;
  }

  // Detecta uma descrição vazia depois da normalização.
  if (descricao === '') {
    // Mostra a mensagem de descrição obrigatória junto ao campo.
    mostrarErroCampo(campoDescricao, document.querySelector('#erro-edicao-descricao'), 'A descrição é obrigatória.');
    // Registra que a ausência de descrição impede o salvamento.
    formularioValido = false;
  // Verifica se a descrição preenchida contém entre dez e mil caracteres.
  } else if (descricao.length < 10 || descricao.length > 1000) {
    // Apresenta os limites de tamanho exigidos para a descrição.
    mostrarErroCampo(campoDescricao, document.querySelector('#erro-edicao-descricao'), 'A descrição deve ter entre 10 e 1000 caracteres.');
    // Impede o envio enquanto a descrição estiver fora dos limites.
    formularioValido = false;
  }

  // Aceita somente um dos quatro códigos de tipo reconhecidos pelo contrato da API.
  if (tipo !== 'TAREFA' && tipo !== 'DEFEITO' && tipo !== 'MELHORIA' && tipo !== 'DOCUMENTACAO') {
    // Informa as opções válidas junto ao seletor de tipo.
    mostrarErroCampo(campoTipo, document.querySelector('#erro-edicao-tipo'), 'Selecione Tarefa, Defeito, Melhoria ou Documentação.');
    // Registra a falha dessa seleção no resultado global.
    formularioValido = false;
  }

  // Aceita somente os quatro códigos previstos para prioridade.
  if (prioridade !== 'CRITICA' && prioridade !== 'ALTA' && prioridade !== 'MEDIA' && prioridade !== 'BAIXA') {
    // Mostra as prioridades reconhecidas junto ao campo correspondente.
    mostrarErroCampo(campoPrioridade, document.querySelector('#erro-edicao-prioridade'), 'Selecione Crítica, Alta, Média ou Baixa.');
    // Registra a falha da prioridade no resultado global da validação.
    formularioValido = false;
  }

  // Exige um id inteiro e positivo para o projeto escolhido.
  if (!Number.isInteger(projetoId) || projetoId < 1) {
    // Destaca o projeto quando sua seleção não corresponde a um identificador válido.
    mostrarErroCampo(campoProjeto, document.querySelector('#erro-edicao-projeto'), 'Selecione um projeto válido.');
    // Impede salvar com um projeto inválido.
    formularioValido = false;
  }

  // Permite responsável vazio; quando preenchido, exige um id inteiro e positivo.
  if (responsavelNovo !== '' && (!Number.isInteger(Number(responsavelNovo)) || Number(responsavelNovo) < 1)) {
    // Explica que é preciso escolher um responsável válido ou manter a opção sem responsável.
    mostrarErroCampo(campoResponsavel, document.querySelector('#erro-edicao-responsavel'), 'Selecione um responsável válido ou deixe sem responsável.');
    // Acrescenta a falha do responsável ao resultado geral da validação.
    formularioValido = false;
  }

  // Integra a validação específica de prazo ao resultado acumulado dos demais campos.
  if (!validarPrazoEdicao()) formularioValido = false;
  // Interrompe o salvamento antes de chamar a API se qualquer validação falhou.
  if (!formularioValido) return;

  // Envia somente os campos alterados para preservar os demais dados e o histórico.
  // Inicializa o objeto que conterá somente campos efetivamente alterados.
  const payload = {};
  // Inclui o título apenas se ele diferir do título persistido.
  incluirSeAlterado(payload, 'titulo', titulo, demandaAtual.titulo);
  // Inclui a descrição apenas se seu valor tiver mudado.
  incluirSeAlterado(payload, 'descricao', descricao, demandaAtual.descricao);
  // Inclui o tipo somente quando foi selecionada uma opção diferente.
  incluirSeAlterado(payload, 'tipo', tipo, demandaAtual.tipo);
  // Inclui a prioridade somente quando ela difere do valor atual.
  incluirSeAlterado(payload, 'prioridade', prioridade, demandaAtual.prioridade);
  // Compara os ids de projeto como números antes de registrar a mudança.
  incluirSeAlterado(payload, 'projeto_id', projetoId, Number(demandaAtual.projeto_id));

  // Responsável e prazo podem ficar vazios, então são comparados como texto e enviados como null quando limpos.
  // Normaliza o responsável atual para texto, usando vazio quando não houver atribuição.
  const responsavelAtual = demandaAtual.responsavel_id == null ? '' : String(demandaAtual.responsavel_id);
  // Envia id numérico ou null somente quando a escolha de responsável mudou.
  if (responsavelAtual !== responsavelNovo) payload.responsavel_id = responsavelNovo ? Number(responsavelNovo) : null;

  // Normaliza o prazo persistido para o texto usado pelo input, com vazio para ausência.
  const prazoAtual = demandaAtual.prazo || '';
  // Lê a nova data civil informada no campo de prazo.
  const prazoNovo = document.querySelector('#edicao-prazo').value;
  // Acrescenta o prazo apenas se mudou; um campo limpo vira null para remover a data.
  if (prazoAtual !== prazoNovo) payload.prazo = prazoNovo || null;
  // Nada mudou: apenas fecha a janela, sem chamar a API.
  // Fecha sem requisição quando nenhuma propriedade foi acrescentada ao objeto de diferenças.
  if (Object.keys(payload).length === 0) return fecharEdicao();

  // Obtém o botão de envio para impedir cliques repetidos durante a gravação.
  const submit = formularioEdicao.querySelector('[type="submit"]');
  // Marca a edição como em andamento para bloquear outros fluxos do modal.
  salvandoEdicao = true;
  // Desabilita o botão até o término da tentativa de salvamento.
  submit.disabled = true;
  // Trata a escrita e a releitura da demanda como uma única operação da interface.
  try {
    // Envia um PATCH com as diferenças serializadas em JSON para a demanda atual.
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    // Fecha o modal após o servidor aceitar a alteração.
    dialogoEdicao.close();
    // Reconsulta a demanda para atualizar detalhes, comentários e histórico com os dados persistidos.
    await carregar();
  // Captura as falhas do salvamento ou da atualização posterior da tela.
  } catch (error) {
    // Erros de prazo ou feriado aparecem junto ao campo de prazo; os demais, no topo do formulário.
    // Reconhece mensagens de prazo ou feriado para apontá-las ao campo apropriado.
    if (error.message.toLowerCase().includes('prazo') || error.message.toLowerCase().includes('feriado')) {
      // Mostra a mensagem recebida ao lado do prazo e aplica o destaque de erro.
      mostrarErroCampo(document.querySelector('#edicao-prazo'), document.querySelector('#erro-edicao-prazo'), error.message);
    // Encaminha os demais erros para a mensagem geral da edição.
    } else {
      // Exibe a mensagem geral sem atribuí-la indevidamente a um campo específico.
      mostrarErroEdicao(error.message);
    }
  // Libera o estado de salvamento mesmo quando a requisição falhou.
  } finally {
    // Permite novas tentativas ou fechamento do editor após o término da gravação.
    salvandoEdicao = false;
    // Habilita novamente o botão de envio.
    submit.disabled = false;
  }
}

// Uma data já vencida pode permanecer ao editar outro campo; um prazo novo não pode ser passado.
// Valida a data opcional e permite preservar um prazo antigo vencido quando ele não foi alterado.
function validarPrazoEdicao() {
  // Obtém o input de data a ser verificado.
  const campo = document.querySelector('#edicao-prazo');
  // Obtém o espaço de erro correspondente ao prazo.
  const erro = document.querySelector('#erro-edicao-prazo');
  // Lê a representação textual da data civil informada.
  const valor = campo.value;
  // Rejeita entrada inválida indicada pelo navegador e textos fora do formato AAAA-MM-DD.
  if (campo.validity.badInput || (valor !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(valor))) {
    // Apresenta a mensagem de formato ou entrada inválida junto ao prazo.
    mostrarErroCampo(campo, erro, 'Informe uma data válida.');
    // Retorna falha para impedir o envio de uma data malformada.
    return false;
  }
  // Aceita o campo vazio porque o prazo é opcional e pode ser removido.
  if (valor === '') return true;

  // Confere se a data existe de fato (por exemplo, recusa 31/02).
  // Separa ano, mês e dia para conferir se a data construída corresponde ao texto original.
  const partes = valor.split('-');
  // Constrói a data à meia-noite no fuso local do navegador para a validação civil.
  const prazo = new Date(`${valor}T00:00:00`);
  // Detecta ajustes automáticos de Date, como a conversão de um dia inexistente para outro mês.
  if (prazo.getFullYear() !== Number(partes[0]) || prazo.getMonth() + 1 !== Number(partes[1]) || prazo.getDate() !== Number(partes[2])) {
    // Informa que a combinação de ano, mês e dia não corresponde a uma data válida.
    mostrarErroCampo(campo, erro, 'Informe uma data válida.');
    // Retorna falha quando o calendário não corresponde à entrada.
    return false;
  }
  // Obtém a data e hora locais usadas para determinar o dia atual no navegador.
  const hoje = new Date();
  // Zera o horário de hoje para comparar dias em vez de horas.
  hoje.setHours(0, 0, 0, 0);
  // Rejeita prazo no passado apenas se ele difere do prazo já persistido.
  if (valor !== demandaAtual.prazo && prazo < hoje) {
    // Explica que uma nova data de prazo não pode ficar antes do dia atual.
    mostrarErroCampo(campo, erro, 'O prazo não pode estar no passado.');
    // Interrompe a validação com resultado negativo nesse caso.
    return false;
  }
  // Aceita o prazo quando todas as verificações locais foram satisfeitas.
  return true;
}

// Marca o campo como inválido e mostra a mensagem logo abaixo dele.
// Centraliza o destaque visual e a mensagem de um erro de campo.
function mostrarErroCampo(campo, elementoErro, mensagem) {
  // Acrescenta a classe de invalidação usada pelos estilos do formulário.
  campo.classList.add('is-invalid');
  // Escreve a mensagem de validação no elemento associado ao campo.
  elementoErro.innerText = mensagem;
}

// Remove as marcações e mensagens de erro de uma tentativa anterior.
// Prepara o formulário para uma nova tentativa de validação.
function limparErrosEdicao() {
  // Seleciona todos os campos que ficaram marcados como inválidos na tentativa anterior.
  formularioEdicao.querySelectorAll('.is-invalid').forEach(function (campo) {
    // Remove o destaque de erro de cada campo selecionado.
    campo.classList.remove('is-invalid');
  });
  // Percorre os espaços destinados às mensagens individuais dos campos.
  formularioEdicao.querySelectorAll('.erro-campo').forEach(function (elementoErro) {
    // Apaga cada mensagem anterior sem remover seu elemento do formulário.
    elementoErro.innerText = '';
  });
  // Esvazia também o erro geral, ocultando-o pelo helper correspondente.
  mostrarErroEdicao('');
}

// Adiciona o campo ao envio apenas quando o valor mudou.
// Compara um campo da edição com seu valor persistido antes de acrescentá-lo ao PATCH.
function incluirSeAlterado(payload, campo, novo, atual) {
  // Usa desigualdade estrita para registrar somente mudanças reais no objeto de envio.
  if (novo !== atual) payload[campo] = novo;
}

// Aplica o status escolhido, com confirmação ao reabrir e ao iniciar uma demanda sem prazo.
// Valida a próxima etapa do ciclo e pede as confirmações especiais antes do PATCH.
async function atualizarStatus() {
  // Evita a ação sem demanda carregada ou enquanto o botão já estiver bloqueado.
  if (!demandaAtual || document.querySelector('#btn-atualizar-status').disabled) return;
  // Lê o código do próximo status selecionado na interface.
  const status = document.querySelector('#novo-status').value;
  // Limpa a apresentação de um erro geral da tentativa anterior.
  mensagemErro.hidden = true;
  // Confere se a seleção pertence às transições que este usuário pode solicitar.
  if (!obterStatusPossiveis(demandaAtual).includes(status)) {
    // Mostra uma orientação quando nenhum próximo status válido foi escolhido.
    exibirErro('Selecione um próximo status válido.');
    // Encerra a tentativa sem atualizar o servidor nessa situação.
    return;
  }

  // A reabertura altera somente o status e mantém os dados e o histórico da demanda.
  // Detecta o fluxo de reabertura, que precisa de confirmação explícita do usuário.
  if (demandaAtual.status === 'CANCELADA' && status === 'ABERTA' &&
      // Interrompe a reabertura se o usuário recusar a confirmação que preserva dados e histórico.
      !confirm('Reabrir esta demanda como Aberta? Os dados, comentários e o histórico serão mantidos.')) return;

  // Verifica o caso em que iniciar a execução exige alertar sobre a ausência de prazo.
  if (
    // Exige que a demanda ainda esteja no estado ABERTA para esse aviso específico.
    demandaAtual.status === 'ABERTA' &&
    // Exige que a ação escolhida seja iniciar o andamento.
    status === 'EM_ANDAMENTO' &&
    // Completa a condição verificando que não existe prazo na demanda.
    !demandaAtual.prazo
  ) {
    // Pede uma decisão ao usuário antes de iniciar uma demanda sem prazo previsto.
    const continuar = confirm(
      // Apresenta a pergunta sobre prosseguir sem uma data de finalização.
      'Esta demanda não possui data prevista de finalização. Deseja continuar mesmo assim?'
    );

    // Encerra sem alterar o status quando o usuário decide não continuar.
    if (!continuar) return;
  }

  // Obtém o controle que confirma a transição de status.
  const botao = document.querySelector('#btn-atualizar-status');
  // Bloqueia novas confirmações enquanto o PATCH está pendente.
  botao.disabled = true;
  // Trata a atualização e a releitura da demanda, liberando o controle no final.
  try {
    // Envia apenas o novo status, preservando os demais campos da demanda.
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    // Atualiza a tela com a versão persistida e seu histórico após a transição.
    await carregar();
  // Recebe falhas da alteração ou da releitura dos dados.
  } catch (error) {
    // Apresenta a mensagem da falha no alerta da tela.
    exibirErro(error.message);
  // Executa a liberação do controle em sucesso ou erro.
  } finally {
    // Habilita novamente o botão de atualização de status.
    botao.disabled = false;
  }
}

// Cancela a demanda: só muda o status para Cancelada, nada é apagado.
// Solicita cancelamento lógico, conservando a demanda e suas dependências no servidor.
async function cancelarDemanda() {
  // Exige uma demanda carregada e a confirmação antes de solicitar seu cancelamento.
  if (!demandaAtual || !confirm('Cancelar esta demanda? O registro e o histórico serão mantidos.')) return;
  // Trata as falhas da atualização ou da releitura que se segue.
  try {
    // Envia somente status CANCELADA por PATCH, sem chamar uma operação de exclusão física.
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELADA' }) });
    // Recarrega o registro cancelado e seu histórico para refletir o resultado persistido.
    await carregar();
  // Captura falhas no cancelamento ou na atualização da apresentação.
  } catch (error) {
    // Mostra o motivo disponível no erro para o usuário.
    exibirErro(error.message);
  }
}

// Valida o texto (3 a 500 caracteres) e envia um novo comentário.
// Valida e envia um comentário, protegendo o fluxo contra cliques repetidos.
async function comentar() {
  // Não permite comentar antes de carregar uma demanda válida.
  if (!demandaAtual) return;
  // Obtém o botão que será bloqueado enquanto o comentário é enviado.
  const botao = document.querySelector('#btn-comentar');
  // Ignora um segundo clique quando já existe uma operação em andamento.
  if (botao.disabled) return;
  // Obtém o campo de texto do novo comentário.
  const input = document.querySelector('#comentario-input');
  // Remove os espaços externos antes de verificar o tamanho do comentário.
  const texto = input.value.trim();
  // Obtém o elemento destinado aos erros desse campo.
  const erro = document.querySelector('#comentario-erro');
  // Retira um destaque de invalidação da tentativa anterior.
  input.classList.remove('is-invalid');
  // Limpa a mensagem anterior do comentário.
  erro.innerText = '';
  // Oculta o espaço de erro até que uma nova falha seja detectada.
  erro.style.display = 'none';
  // Exige que o texto normalizado tenha entre três e quinhentos caracteres.
  if (texto.length < 3 || texto.length > 500) {
    // Mostra a regra de tamanho junto ao campo e o marca como inválido.
    mostrarErroCampo(input, erro, 'O comentário deve ter entre 3 e 500 caracteres.');
    // Revela a mensagem específica de tamanho inválido.
    erro.style.display = 'block';
    // Encerra sem enviar o comentário que não atende aos limites.
    return;
  }
  // Bloqueia o botão para impedir o envio duplicado do mesmo texto.
  botao.disabled = true;
  // Protege envio e recarregamento, garantindo a liberação do botão ao terminar.
  try {
    // Cria o comentário com POST na demanda atual, enviando apenas seu texto como JSON.
    await api(`/demandas/${demandaId}/comentarios`, { method: 'POST', body: JSON.stringify({ texto }) });
    // Limpa a entrada depois que o servidor confirma o comentário.
    input.value = '';
    // Oculta o espaço de erro após o envio aceito.
    erro.style.display = 'none';
    // Reconsulta a demanda para incorporar o novo comentário à lista da tela.
    await carregar();
  // Captura erro do envio ou da atualização posterior dos dados.
  } catch (error) {
    // Mostra a mensagem da falha junto ao campo do comentário.
    mostrarErroCampo(input, erro, error.message);
    // Garante que a mensagem de erro fique visível.
    erro.style.display = 'block';
  // Executa a liberação do botão mesmo quando uma etapa falha.
  } finally {
    // Permite um novo envio após a tentativa atual terminar.
    botao.disabled = false;
  }
}

// Desenha os comentários acima do campo de novo comentário (ou avisa que não há nenhum).
// Substitui a apresentação antiga de comentários por uma lista ou um aviso de ausência.
function renderizarComentarios(comentarios) {
  // Obtém a seção em que os comentários e seu formulário estão agrupados.
  const secaoComentarios = document.querySelector('.comments-section');
  // Obtém o formulário que servirá de referência para inserir os comentários antes dele.
  const formulario = document.querySelector('.comment-form');
  // Remove os blocos de comentários da renderização anterior.
  document.querySelectorAll('.comment').forEach((elemento) => elemento.remove());
  // Remove um aviso anterior de lista vazia antes de reconstruir a seção.
  secaoComentarios.querySelectorAll('.empty-state').forEach((elemento) => elemento.remove());
  // Decide se deve mostrar uma mensagem em vez de blocos de comentário.
  if (!comentarios.length) {
    // Cria um parágrafo para explicar a ausência de comentários.
    const vazio = document.createElement('p');
    // Aplica a classe visual reservada às mensagens de ausência de dados.
    vazio.className = 'empty-state';
    // Define o texto que explica que a demanda ainda não recebeu comentários.
    vazio.textContent = 'Ainda não há comentários nesta demanda.';
    // Insere a mensagem imediatamente antes do formulário de novo comentário.
    formulario.parentNode.insertBefore(vazio, formulario);
    // Encerra a renderização depois de apresentar o estado vazio.
    return;
  }
  // Cria cada comentário e o insere antes do formulário, mantendo a ordem recebida da API.
  comentarios.forEach((item) => formulario.parentNode.insertBefore(criarComentario(item), formulario));
}

// Desenha a lista do histórico de alterações (ou avisa que ainda não há registros).
// Atualiza a seção de histórico com eventos ou uma mensagem de ausência de alterações.
function renderizarHistorico(historico) {
  // Obtém o contêiner da lista de eventos de histórico.
  const container = document.querySelector('.history');
  // Detecta a ausência de eventos retornados para a demanda.
  if (!historico.length) {
    // Cria o parágrafo do estado vazio do histórico.
    const vazio = document.createElement('p');
    // Aplica a classe visual das mensagens de ausência de dados.
    vazio.className = 'empty-state';
    // Define a explicação de que ainda não existem alterações registradas.
    vazio.textContent = 'Ainda não há alterações registradas.';
    // Substitui o histórico anterior por essa mensagem.
    container.replaceChildren(vazio);
    // Encerra a renderização do histórico vazio.
    return;
  }
  // Constrói os eventos e substitui todos os filhos antigos pelo resultado atual.
  container.replaceChildren(...historico.map(criarHistorico));
}

// Monta o bloco de um comentário (autor, data e texto). Usa textContent, nunca HTML.
// Monta um bloco DOM de comentário sem interpretar o texto ou o nome do autor como HTML.
function criarComentario(item) {
  // Cria o contêiner externo do comentário.
  const div = document.createElement('div');
  // Aplica a classe pela qual o bloco é estilizado e removido em novas renderizações.
  div.className = 'comment';
  // Cria o agrupamento do nome do autor e da data.
  const header = document.createElement('div');
  // Aplica a classe visual do cabeçalho do comentário.
  header.className = 'comment-header';
  // Cria o elemento que exibirá o nome do autor.
  const autor = document.createElement('span');
  // Aplica o estilo específico para o autor do comentário.
  autor.className = 'comment-author';
  // Insere o nome retornado da API como texto literal.
  autor.textContent = item.autor_nome;
  // Cria o elemento que exibirá a data de criação.
  const data = document.createElement('span');
  // Aplica o estilo de data do comentário.
  data.className = 'comment-date';
  // Formata o instante de criação no fuso de São Paulo antes de apresentá-lo.
  data.textContent = formatarDataHora(item.criado_em);
  // Cria o parágrafo que conterá o conteúdo do comentário.
  const texto = document.createElement('p');
  // Aplica o estilo do corpo textual do comentário.
  texto.className = 'comment-text';
  // Usa textContent para manter a entrada do usuário como texto, sem executar marcação.
  texto.textContent = item.texto;
  // Junta autor e data no cabeçalho.
  header.append(autor, data);
  // Junta o cabeçalho e o texto no bloco externo.
  div.append(header, texto);
  // Devolve o bloco pronto para ser inserido na lista de comentários.
  return div;
}

// Monta a frase do histórico: "Fulano alterou o prazo: antes → depois".
// Monta um evento de histórico com frase descritiva e data da alteração.
function criarHistorico(item) {
  // Cria o bloco externo do evento.
  const div = document.createElement('div');
  // Aplica a classe visual dos itens de histórico.
  div.className = 'history-item';
  // Cria o parágrafo que receberá a descrição do evento.
  const texto = document.createElement('p');
  // Aplica o estilo do texto de histórico.
  texto.className = 'history-text';
  // Escolhe a frase pelo tipo do evento: criação inicial ou alteração de um campo.
  texto.textContent = item.acao === 'CRIACAO'
    // Para CRIACAO, informa quem criou a demanda.
    ? `${item.autor_nome} criou a demanda.`
    // Para alterações, traduz o campo e os valores anterior e novo na mesma frase.
    : `${item.autor_nome} alterou ${rotulosHistorico[item.campo] || item.campo}: ${rotularValor(item.campo, item.valor_anterior)} → ${rotularValor(item.campo, item.valor_novo)}.`;
  // Cria o elemento reservado à data do evento.
  const data = document.createElement('span');
  // Aplica o estilo de data do histórico.
  data.className = 'history-date';
  // Formata o instante registrado no evento para apresentação local em São Paulo.
  data.textContent = formatarDataHora(item.criado_em);
  // Acrescenta a frase e a data ao bloco externo.
  div.append(texto, data);
  // Devolve o evento pronto para a lista de histórico.
  return div;
}

// Troca ids e códigos por nomes legíveis nos valores do histórico.
// Traduz valores persistidos do histórico sem exigir que todos os nomes ainda estejam disponíveis.
function rotularValor(campo, valor) {
  // Representa null, undefined ou texto vazio com a palavra vazio.
  if (valor == null || valor === '') return 'vazio';
  // Aplica a tradução de identificadores quando o campo alterado é o projeto.
  if (campo === 'projeto_id') {
    // Procura o id histórico na coleção de projetos disponíveis, comparando ids como números.
    const projeto = projetosDisponiveis.find((item) => Number(item.id) === Number(valor));
    // Usa o nome do projeto quando ele está na coleção carregada.
    if (projeto) return projeto.nome;
    // Reaproveita o nome da demanda atual quando o id corresponde ao seu projeto.
    if (Number(valor) === Number(demandaAtual?.projeto_id)) return demandaAtual.projeto_nome;
    // Mantém uma referência com id quando não foi possível recuperar o nome do projeto histórico.
    return `projeto #${valor}`;
  }
  // Aplica a tradução de identificadores quando o campo é o responsável.
  if (campo === 'responsavel_id') {
    // Procura o id na equipe atualmente carregada para a demanda.
    const membro = membrosProjeto.find((item) => Number(item.id) === Number(valor));
    // Mostra o nome conhecido ou preserva a identificação numérica do usuário antigo.
    return membro ? membro.nome : `usuário #${valor}`;
  }
  // Para os demais campos, usa o dicionário de rótulos ou o valor original quando não houver tradução.
  return rotulos[valor] || valor;
}

// Sufixo da classe CSS de cada status (cor da etiqueta).
// Obtém o sufixo de classe que corresponde ao código de status persistido.
function classeStatus(status) {
  // Traduz os cinco códigos conhecidos para os nomes das classes; status desconhecido resulta em vazio.
  return ({ ABERTA: 'aberta', EM_ANDAMENTO: 'andamento', EM_REVISAO: 'revisao', CONCLUIDA: 'concluida', CANCELADA: 'cancelada' })[status] || '';
}

// Datas só com dia (como o prazo) são formatadas sem conversão de fuso, para não aparecer um dia a menos.
// Trata datas civis separadamente de instantes completos para preservar o dia exibido.
function formatarData(value) {
  // Apresenta um rótulo explícito quando nenhuma data foi informada.
  if (!value) return 'Não definido';
  // Reconhece texto formado apenas por ano, mês e dia no padrão da API.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Separa as três partes sem converter a data para outro fuso.
    const [ano, mes, dia] = value.split('-');
    // Reordena as partes para o formato brasileiro DD/MM/AAAA.
    return `${dia}/${mes}/${ano}`;
  }
  // Converte os demais valores em Date e apresenta o dia no fuso de São Paulo.
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Data e hora no fuso de São Paulo.
// Formata valores temporais completos para exibir tanto a data quanto a hora.
function formatarDataHora(value) {
  // Usa localização brasileira e fuso de São Paulo ao apresentar o instante recebido.
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Mostra (ou esconde, se vazio) o erro geral do formulário de edição.
// Atualiza o erro geral do formulário de edição e sua visibilidade.
function mostrarErroEdicao(mensagem) {
  // Obtém a área de alerta localizada dentro do editor.
  const elemento = document.querySelector('#edicao-erro');
  // Insere a mensagem como texto, sem interpretar marcação do servidor.
  elemento.textContent = mensagem;
  // Esconde o elemento quando a mensagem está vazia e o revela quando existe texto.
  elemento.hidden = !mensagem;
}

// Mostra o erro geral da tela, acima do conteúdo.
// Atualiza o alerta geral da tela de detalhes.
function exibirErro(mensagem) {
  // Escreve a explicação recebida como texto literal.
  mensagemErro.textContent = mensagem;
  // Revela o alerta acima do conteúdo da demanda.
  mensagemErro.hidden = false;
}