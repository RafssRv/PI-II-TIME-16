// Autor: Priscila Amorim
// Descrição: Consulta detalhes, comentários e histórico; permite editar e acompanhar o ciclo da demanda.
// As validações da edição seguem: ler, validar, mostrar os erros e só então enviar.

// Estado da tela: usuário logado, demanda carregada e dados usados na janela de edição.
let usuario = null;
// O id da demanda vem da URL (detalhes.html?id=N).
const demandaId = Number(new URLSearchParams(window.location.search).get('id'));
const dialogoEdicao = document.querySelector('#dialog-edicao');
const formularioEdicao = document.querySelector('#form-edicao');
const mensagemErro = document.querySelector('#mensagem-erro');
// Como cada campo aparece na frase do histórico ("alterou o prazo: ...").
const rotulosHistorico = {
  titulo: 'o título', descricao: 'a descrição', tipo: 'o tipo', prioridade: 'a prioridade',
  status: 'o status', prazo: 'o prazo', responsavel_id: 'o responsável', projeto_id: 'o projeto'
};
let demandaAtual = null;
let membrosProjeto = [];
let projetosDisponiveis = [];
// Controles contra cliques repetidos e respostas fora de ordem na janela de edição.
let projetoEdicaoAtual = '';
let consultaMembrosEdicao = 0;
let carregandoMembrosEdicao = false;
let salvandoEdicao = false;

// Próximos status permitidos para Administrador e Líder (ciclo de vida do escopo).
// CANCELADA → ABERTA é a reabertura. O Membro tem regras próprias em obterStatusPossiveis.
const opcoesStatus = {
  ABERTA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['EM_REVISAO'],
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA'],
  CONCLUIDA: [],
  CANCELADA: ['ABERTA']
};

// Ao carregar a página: confirma a sessão e busca a demanda.
document.addEventListener('DOMContentLoaded', async function () {
  usuario = await exigirUsuario();
  if (usuario) await carregar();
});
// Ligação dos botões e eventos da página.
document.querySelector('#btn-comentar').addEventListener('click', comentar);
document.querySelector('#btn-editar').addEventListener('click', abrirEdicao);
document.querySelector('#btn-atualizar-status').addEventListener('click', atualizarStatus);
document.querySelector('#btn-cancelar-demanda').addEventListener('click', cancelarDemanda);
document.querySelector('#fechar-edicao').addEventListener('click', fecharEdicao);
document.querySelector('#cancelar-edicao').addEventListener('click', fecharEdicao);
formularioEdicao.addEventListener('submit', salvarEdicao);
// Impede que a tecla Esc feche a janela enquanto a edição está sendo salva.
dialogoEdicao.addEventListener('cancel', function (event) {
  if (salvandoEdicao) event.preventDefault();
});
document.querySelector('#edicao-projeto').addEventListener('change', trocarProjetoEdicao);

// Busca a demanda (com comentários e histórico) e atualiza a tela.
async function carregar() {
  if (!Number.isInteger(demandaId) || demandaId < 1) {
    ocultarConteudoDemanda();
    exibirErro('Identificador de demanda inválido.');
    return;
  }

  mensagemErro.hidden = true;
  try {
    demandaAtual = await api(`/demandas/${demandaId}`);
    preencherDetalhes(demandaAtual);
    await carregarMembros();
    document.querySelector('#btn-editar').disabled = false;
    renderizarComentarios(demandaAtual.comentarios || []);
    renderizarHistorico(demandaAtual.historico || []);
  } catch (error) {
    ocultarConteudoDemanda();
    exibirErro(error.message);
  }
}

// Esconde os cartões quando a demanda não pode ser exibida (id inválido ou erro na busca).
function ocultarConteudoDemanda() {
  document.querySelectorAll(
    '.main-content > .content-card, .main-content > .details-grid'
  ).forEach((elemento) => {
    elemento.hidden = true;
  });
}

// Escreve os dados da demanda na tela e define quais botões o perfil pode ver.
function preencherDetalhes(demanda) {
  document.querySelector('.demand-id').textContent = `DEM-${String(demanda.id).padStart(3, '0')}`;
  document.querySelector('.demand-title').textContent = demanda.titulo;
  document.querySelector('#descricao-demanda').textContent = demanda.descricao;

  // Etiquetas na ordem do HTML: tipo, prioridade e status (a cor vem da classe).
  const badges = document.querySelectorAll('.badges span');
  badges[0].textContent = rotulos[demanda.tipo] || demanda.tipo;
  badges[1].textContent = rotulos[demanda.prioridade] || demanda.prioridade;
  badges[1].className = `badge-custom badge-prioridade-${String(demanda.prioridade).toLowerCase()}`;
  badges[2].textContent = rotulos[demanda.status] || demanda.status;
  badges[2].className = `badge-custom badge-status-${classeStatus(demanda.status)}`;

  // Os valores seguem a mesma ordem dos itens da lista de informações no HTML.
  const valores = document.querySelectorAll('.info-value');
  [
    demanda.projeto_nome,
    demanda.responsavel_nome || 'Não definido',
    formatarData(demanda.criado_em),
    formatarData(demanda.atualizado_em),
    formatarData(demanda.prazo)
  ].forEach((valor, indice) => { valores[indice].textContent = valor; });

  // Só Administrador e Líder editam e cancelam. O botão Editar só é habilitado
  // depois que a equipe do projeto termina de carregar (em carregar).
  const podeGerenciar = ['ADMIN', 'LIDER'].includes(usuario.perfil);
  document.querySelector('#btn-editar').hidden = !podeGerenciar;
  document.querySelector('#btn-editar').disabled = true;
  document.querySelector('#btn-cancelar-demanda').hidden = !podeGerenciar || ['CONCLUIDA', 'CANCELADA'].includes(demanda.status);
  preencherTransicoes(demanda);
}

// Monta o seletor de próximo status; em demanda cancelada vira o botão "Reabrir demanda".
function preencherTransicoes(demanda) {
  const select = document.querySelector('#novo-status');
  const botao = document.querySelector('#btn-atualizar-status');
  const statusPossiveis = obterStatusPossiveis(demanda);

  select.replaceChildren(new Option(statusPossiveis.length ? 'Escolha o próximo status...' : 'Sem transição disponível', ''));
  statusPossiveis.forEach((status) => select.add(new Option(rotulos[status], status)));
  const podeReabrir = demanda.status === 'CANCELADA' && statusPossiveis.includes('ABERTA');
  if (podeReabrir) select.value = 'ABERTA';
  select.hidden = statusPossiveis.length === 0 || podeReabrir;
  botao.hidden = statusPossiveis.length === 0;
  botao.textContent = podeReabrir ? 'Reabrir demanda' : 'Salvar status';
}

// Mantém as transições e as permissões definidas no escopo do projeto.
function obterStatusPossiveis(demanda) {
  if (usuario.perfil === 'MEMBRO') {
    if (Number(demanda.responsavel_id) !== Number(usuario.id)) return [];
    const apenasMembro = { ABERTA: ['EM_ANDAMENTO'], EM_ANDAMENTO: ['EM_REVISAO'] };
    return apenasMembro[demanda.status] || [];
  }
  return opcoesStatus[demanda.status] || [];
}

// Para Administrador e Líder, busca a equipe do projeto e a lista de projetos usadas no formulário de edição.
async function carregarMembros() {
  membrosProjeto = [];
  projetosDisponiveis = [];
  if (!demandaAtual || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;
  try {
    [membrosProjeto, projetosDisponiveis] = await Promise.all([
      api(`/projetos/${demandaAtual.projeto_id}/membros`), api('/projetos')
    ]);
  } catch (error) {
    exibirErro(error.message);
  }
}

// Preenche o formulário com os dados atuais da demanda e abre a janela de edição.
function abrirEdicao() {
  if (!demandaAtual || salvandoEdicao || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;
  consultaMembrosEdicao += 1;
  carregandoMembrosEdicao = false;
  formularioEdicao.querySelector('[type="submit"]').disabled = false;
  document.querySelector('#edicao-titulo').value = demandaAtual.titulo;
  document.querySelector('#edicao-descricao').value = demandaAtual.descricao;
  document.querySelector('#edicao-tipo').value = demandaAtual.tipo;
  document.querySelector('#edicao-prioridade').value = demandaAtual.prioridade;
  document.querySelector('#edicao-prazo').value = demandaAtual.prazo || '';

  const projeto = document.querySelector('#edicao-projeto');
  projeto.replaceChildren(...projetosDisponiveis.map((item) => new Option(item.nome, item.id)));
  // Se o projeto atual não está na lista do usuário, ele aparece desabilitado, só para exibição.
  if (!projetosDisponiveis.some((item) => Number(item.id) === Number(demandaAtual.projeto_id))) {
    const atual = new Option(demandaAtual.projeto_nome, demandaAtual.projeto_id);
    atual.disabled = true;
    projeto.add(atual);
  }
  projeto.value = String(demandaAtual.projeto_id);
  projeto.disabled = false;
  projetoEdicaoAtual = projeto.value;
  document.querySelector('#edicao-projeto-aviso').hidden = true;

  const responsavel = document.querySelector('#edicao-responsavel');
  responsavel.disabled = false;
  responsavel.replaceChildren(new Option('Sem responsável definido', ''));
  membrosProjeto.forEach((membro) => responsavel.add(new Option(membro.nome, membro.id)));
  // Mantém na lista um responsável que já não está na equipe, para não removê-lo sem querer.
  if (demandaAtual.responsavel_id && !membrosProjeto.some((membro) => Number(membro.id) === Number(demandaAtual.responsavel_id))) {
    responsavel.add(new Option(demandaAtual.responsavel_nome || `Usuário ${demandaAtual.responsavel_id}`, demandaAtual.responsavel_id));
  }
  responsavel.value = demandaAtual.responsavel_id || '';
  limparErrosEdicao();
  dialogoEdicao.showModal();
}

// Recarrega a equipe ao trocar de projeto e evita manter um responsável sem vínculo no destino.
async function trocarProjetoEdicao() {
  if (salvandoEdicao) return;
  // Número desta consulta: se o usuário trocar de projeto de novo, a resposta antiga é descartada.
  const consulta = ++consultaMembrosEdicao;
  const projeto = document.querySelector('#edicao-projeto');
  const responsavel = document.querySelector('#edicao-responsavel');
  const submit = formularioEdicao.querySelector('[type="submit"]');
  const aviso = document.querySelector('#edicao-projeto-aviso');
  const anterior = projetoEdicaoAtual;
  const responsavelAnterior = responsavel.value;
  const projetoId = projeto.value;
  // Bloqueia os campos enquanto a equipe do novo projeto carrega.
  carregandoMembrosEdicao = true;
  projeto.disabled = responsavel.disabled = submit.disabled = true;
  aviso.textContent = 'Carregando responsáveis do projeto...';
  aviso.hidden = false;
  mostrarErroEdicao('');
  try {
    const membros = await api(`/projetos/${projetoId}/membros`);
    if (consulta !== consultaMembrosEdicao || !dialogoEdicao.open) return;
    responsavel.replaceChildren(new Option('Sem responsável definido', ''), ...membros.map((membro) => new Option(membro.nome, membro.id)));
    const manterResponsavel = membros.some((membro) => String(membro.id) === responsavelAnterior);
    responsavel.value = manterResponsavel ? responsavelAnterior : '';
    projetoEdicaoAtual = projetoId;
    aviso.textContent = 'O responsável anterior não pertence ao projeto selecionado. Escolha outro ou mantenha a demanda sem responsável.';
    aviso.hidden = !responsavelAnterior || manterResponsavel;
  } catch (error) {
    if (consulta !== consultaMembrosEdicao || !dialogoEdicao.open) return;
    // Se a consulta falhou, volta ao projeto anterior.
    projeto.value = anterior;
    aviso.hidden = true;
    mostrarErroEdicao(error.message);
  } finally {
    if (consulta === consultaMembrosEdicao && dialogoEdicao.open) {
      carregandoMembrosEdicao = false;
      projeto.disabled = responsavel.disabled = submit.disabled = false;
    }
  }
}

// Fecha a janela de edição, exceto enquanto o salvamento está em andamento.
function fecharEdicao() {
  if (!salvandoEdicao) dialogoEdicao.close();
}

// Valida o formulário, envia só o que mudou e recarrega a tela.
async function salvarEdicao(event) {
  event.preventDefault();
  if (!demandaAtual || carregandoMembrosEdicao || salvandoEdicao || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;

  limparErrosEdicao();
  const campoTitulo = document.querySelector('#edicao-titulo');
  const campoDescricao = document.querySelector('#edicao-descricao');
  const campoTipo = document.querySelector('#edicao-tipo');
  const campoPrioridade = document.querySelector('#edicao-prioridade');
  const campoProjeto = document.querySelector('#edicao-projeto');
  const campoResponsavel = document.querySelector('#edicao-responsavel');
  const titulo = campoTitulo.value.trim();
  const descricao = campoDescricao.value.trim();
  const tipo = campoTipo.value;
  const prioridade = campoPrioridade.value;
  const projetoId = Number(campoProjeto.value);
  const responsavelNovo = campoResponsavel.value;
  let formularioValido = true;

  // Apresenta todos os erros da tentativa
  if (titulo === '') {
    mostrarErroCampo(campoTitulo, document.querySelector('#erro-edicao-titulo'), 'O título é obrigatório.');
    formularioValido = false;
  } else if (titulo.length < 3 || titulo.length > 100) {
    mostrarErroCampo(campoTitulo, document.querySelector('#erro-edicao-titulo'), 'O título deve ter entre 3 e 100 caracteres.');
    formularioValido = false;
  }

  if (descricao === '') {
    mostrarErroCampo(campoDescricao, document.querySelector('#erro-edicao-descricao'), 'A descrição é obrigatória.');
    formularioValido = false;
  } else if (descricao.length < 10 || descricao.length > 1000) {
    mostrarErroCampo(campoDescricao, document.querySelector('#erro-edicao-descricao'), 'A descrição deve ter entre 10 e 1000 caracteres.');
    formularioValido = false;
  }

  if (tipo !== 'TAREFA' && tipo !== 'DEFEITO' && tipo !== 'MELHORIA' && tipo !== 'DOCUMENTACAO') {
    mostrarErroCampo(campoTipo, document.querySelector('#erro-edicao-tipo'), 'Selecione Tarefa, Defeito, Melhoria ou Documentação.');
    formularioValido = false;
  }

  if (prioridade !== 'CRITICA' && prioridade !== 'ALTA' && prioridade !== 'MEDIA' && prioridade !== 'BAIXA') {
    mostrarErroCampo(campoPrioridade, document.querySelector('#erro-edicao-prioridade'), 'Selecione Crítica, Alta, Média ou Baixa.');
    formularioValido = false;
  }

  if (!Number.isInteger(projetoId) || projetoId < 1) {
    mostrarErroCampo(campoProjeto, document.querySelector('#erro-edicao-projeto'), 'Selecione um projeto válido.');
    formularioValido = false;
  }

  if (responsavelNovo !== '' && (!Number.isInteger(Number(responsavelNovo)) || Number(responsavelNovo) < 1)) {
    mostrarErroCampo(campoResponsavel, document.querySelector('#erro-edicao-responsavel'), 'Selecione um responsável válido ou deixe sem responsável.');
    formularioValido = false;
  }

  if (!validarPrazoEdicao()) formularioValido = false;
  if (!formularioValido) return;

  // Envia somente os campos alterados para preservar os demais dados e o histórico.
  const payload = {};
  incluirSeAlterado(payload, 'titulo', titulo, demandaAtual.titulo);
  incluirSeAlterado(payload, 'descricao', descricao, demandaAtual.descricao);
  incluirSeAlterado(payload, 'tipo', tipo, demandaAtual.tipo);
  incluirSeAlterado(payload, 'prioridade', prioridade, demandaAtual.prioridade);
  incluirSeAlterado(payload, 'projeto_id', projetoId, Number(demandaAtual.projeto_id));

  // Responsável e prazo podem ficar vazios, então são comparados como texto e enviados como null quando limpos.
  const responsavelAtual = demandaAtual.responsavel_id == null ? '' : String(demandaAtual.responsavel_id);
  if (responsavelAtual !== responsavelNovo) payload.responsavel_id = responsavelNovo ? Number(responsavelNovo) : null;

  const prazoAtual = demandaAtual.prazo || '';
  const prazoNovo = document.querySelector('#edicao-prazo').value;
  if (prazoAtual !== prazoNovo) payload.prazo = prazoNovo || null;
  // Nada mudou: apenas fecha a janela, sem chamar a API.
  if (Object.keys(payload).length === 0) return fecharEdicao();

  const submit = formularioEdicao.querySelector('[type="submit"]');
  salvandoEdicao = true;
  submit.disabled = true;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    dialogoEdicao.close();
    await carregar();
  } catch (error) {
    // Erros de prazo ou feriado aparecem junto ao campo de prazo; os demais, no topo do formulário.
    if (error.message.toLowerCase().includes('prazo') || error.message.toLowerCase().includes('feriado')) {
      mostrarErroCampo(document.querySelector('#edicao-prazo'), document.querySelector('#erro-edicao-prazo'), error.message);
    } else {
      mostrarErroEdicao(error.message);
    }
  } finally {
    salvandoEdicao = false;
    submit.disabled = false;
  }
}

// Uma data já vencida pode permanecer ao editar outro campo; um prazo novo não pode ser passado.
function validarPrazoEdicao() {
  const campo = document.querySelector('#edicao-prazo');
  const erro = document.querySelector('#erro-edicao-prazo');
  const valor = campo.value;
  if (campo.validity.badInput || (valor !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(valor))) {
    mostrarErroCampo(campo, erro, 'Informe uma data válida.');
    return false;
  }
  if (valor === '') return true;

  // Confere se a data existe de fato (por exemplo, recusa 31/02).
  const partes = valor.split('-');
  const prazo = new Date(`${valor}T00:00:00`);
  if (prazo.getFullYear() !== Number(partes[0]) || prazo.getMonth() + 1 !== Number(partes[1]) || prazo.getDate() !== Number(partes[2])) {
    mostrarErroCampo(campo, erro, 'Informe uma data válida.');
    return false;
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (valor !== demandaAtual.prazo && prazo < hoje) {
    mostrarErroCampo(campo, erro, 'O prazo não pode estar no passado.');
    return false;
  }
  return true;
}

// Marca o campo como inválido e mostra a mensagem logo abaixo dele.
function mostrarErroCampo(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

// Remove as marcações e mensagens de erro de uma tentativa anterior.
function limparErrosEdicao() {
  formularioEdicao.querySelectorAll('.is-invalid').forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });
  formularioEdicao.querySelectorAll('.erro-campo').forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
  mostrarErroEdicao('');
}

// Adiciona o campo ao envio apenas quando o valor mudou.
function incluirSeAlterado(payload, campo, novo, atual) {
  if (novo !== atual) payload[campo] = novo;
}

// Aplica o status escolhido, com confirmação ao reabrir e ao iniciar uma demanda sem prazo.
async function atualizarStatus() {
  if (!demandaAtual || document.querySelector('#btn-atualizar-status').disabled) return;
  const status = document.querySelector('#novo-status').value;
  mensagemErro.hidden = true;
  if (!obterStatusPossiveis(demandaAtual).includes(status)) {
    exibirErro('Selecione um próximo status válido.');
    return;
  }

  // A reabertura altera somente o status e mantém os dados e o histórico da demanda.
  if (demandaAtual.status === 'CANCELADA' && status === 'ABERTA' &&
      !confirm('Reabrir esta demanda como Aberta? Os dados, comentários e o histórico serão mantidos.')) return;

  if (
    demandaAtual.status === 'ABERTA' &&
    status === 'EM_ANDAMENTO' &&
    !demandaAtual.prazo
  ) {
    const continuar = confirm(
      'Esta demanda não possui data prevista de finalização. Deseja continuar mesmo assim?'
    );

    if (!continuar) return;
  }

  const botao = document.querySelector('#btn-atualizar-status');
  botao.disabled = true;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await carregar();
  } catch (error) {
    exibirErro(error.message);
  } finally {
    botao.disabled = false;
  }
}

// Cancela a demanda: só muda o status para Cancelada, nada é apagado.
async function cancelarDemanda() {
  if (!demandaAtual || !confirm('Cancelar esta demanda? O registro e o histórico serão mantidos.')) return;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELADA' }) });
    await carregar();
  } catch (error) {
    exibirErro(error.message);
  }
}

// Valida o texto (3 a 500 caracteres) e envia um novo comentário.
async function comentar() {
  if (!demandaAtual) return;
  const botao = document.querySelector('#btn-comentar');
  if (botao.disabled) return;
  const input = document.querySelector('#comentario-input');
  const texto = input.value.trim();
  const erro = document.querySelector('#comentario-erro');
  input.classList.remove('is-invalid');
  erro.innerText = '';
  erro.style.display = 'none';
  if (texto.length < 3 || texto.length > 500) {
    mostrarErroCampo(input, erro, 'O comentário deve ter entre 3 e 500 caracteres.');
    erro.style.display = 'block';
    return;
  }
  botao.disabled = true;
  try {
    await api(`/demandas/${demandaId}/comentarios`, { method: 'POST', body: JSON.stringify({ texto }) });
    input.value = '';
    erro.style.display = 'none';
    await carregar();
  } catch (error) {
    mostrarErroCampo(input, erro, error.message);
    erro.style.display = 'block';
  } finally {
    botao.disabled = false;
  }
}

// Desenha os comentários acima do campo de novo comentário (ou avisa que não há nenhum).
function renderizarComentarios(comentarios) {
  const secaoComentarios = document.querySelector('.comments-section');
  const formulario = document.querySelector('.comment-form');
  document.querySelectorAll('.comment').forEach((elemento) => elemento.remove());
  secaoComentarios.querySelectorAll('.empty-state').forEach((elemento) => elemento.remove());
  if (!comentarios.length) {
    const vazio = document.createElement('p');
    vazio.className = 'empty-state';
    vazio.textContent = 'Ainda não há comentários nesta demanda.';
    formulario.parentNode.insertBefore(vazio, formulario);
    return;
  }
  comentarios.forEach((item) => formulario.parentNode.insertBefore(criarComentario(item), formulario));
}

// Desenha a lista do histórico de alterações (ou avisa que ainda não há registros).
function renderizarHistorico(historico) {
  const container = document.querySelector('.history');
  if (!historico.length) {
    const vazio = document.createElement('p');
    vazio.className = 'empty-state';
    vazio.textContent = 'Ainda não há alterações registradas.';
    container.replaceChildren(vazio);
    return;
  }
  container.replaceChildren(...historico.map(criarHistorico));
}

// Monta o bloco de um comentário (autor, data e texto). Usa textContent, nunca HTML.
function criarComentario(item) {
  const div = document.createElement('div');
  div.className = 'comment';
  const header = document.createElement('div');
  header.className = 'comment-header';
  const autor = document.createElement('span');
  autor.className = 'comment-author';
  autor.textContent = item.autor_nome;
  const data = document.createElement('span');
  data.className = 'comment-date';
  data.textContent = formatarDataHora(item.criado_em);
  const texto = document.createElement('p');
  texto.className = 'comment-text';
  texto.textContent = item.texto;
  header.append(autor, data);
  div.append(header, texto);
  return div;
}

// Monta a frase do histórico: "Fulano alterou o prazo: antes → depois".
function criarHistorico(item) {
  const div = document.createElement('div');
  div.className = 'history-item';
  const texto = document.createElement('p');
  texto.className = 'history-text';
  texto.textContent = item.acao === 'CRIACAO'
    ? `${item.autor_nome} criou a demanda.`
    : `${item.autor_nome} alterou ${rotulosHistorico[item.campo] || item.campo}: ${rotularValor(item.campo, item.valor_anterior)} → ${rotularValor(item.campo, item.valor_novo)}.`;
  const data = document.createElement('span');
  data.className = 'history-date';
  data.textContent = formatarDataHora(item.criado_em);
  div.append(texto, data);
  return div;
}

// Troca ids e códigos por nomes legíveis nos valores do histórico.
function rotularValor(campo, valor) {
  if (valor == null || valor === '') return 'vazio';
  if (campo === 'projeto_id') {
    const projeto = projetosDisponiveis.find((item) => Number(item.id) === Number(valor));
    if (projeto) return projeto.nome;
    if (Number(valor) === Number(demandaAtual?.projeto_id)) return demandaAtual.projeto_nome;
    return `projeto #${valor}`;
  }
  if (campo === 'responsavel_id') {
    const membro = membrosProjeto.find((item) => Number(item.id) === Number(valor));
    return membro ? membro.nome : `usuário #${valor}`;
  }
  return rotulos[valor] || valor;
}

// Sufixo da classe CSS de cada status (cor da etiqueta).
function classeStatus(status) {
  return ({ ABERTA: 'aberta', EM_ANDAMENTO: 'andamento', EM_REVISAO: 'revisao', CONCLUIDA: 'concluida', CANCELADA: 'cancelada' })[status] || '';
}

// Datas só com dia (como o prazo) são formatadas sem conversão de fuso, para não aparecer um dia a menos.
function formatarData(value) {
  if (!value) return 'Não definido';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [ano, mes, dia] = value.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Data e hora no fuso de São Paulo.
function formatarDataHora(value) {
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Mostra (ou esconde, se vazio) o erro geral do formulário de edição.
function mostrarErroEdicao(mensagem) {
  const elemento = document.querySelector('#edicao-erro');
  elemento.textContent = mensagem;
  elemento.hidden = !mensagem;
}

// Mostra o erro geral da tela, acima do conteúdo.
function exibirErro(mensagem) {
  mensagemErro.textContent = mensagem;
  mensagemErro.hidden = false;
}