// Autor: Priscila Amorim
// Descrição: Consulta detalhes, comentários e histórico; permite editar e acompanhar o ciclo da demanda.
// As validações da edição seguem a Aula 05: ler, validar, mostrar os erros e só então enviar.

let usuario = null;
const demandaId = Number(new URLSearchParams(window.location.search).get('id'));
const dialogoEdicao = document.querySelector('#dialog-edicao');
const formularioEdicao = document.querySelector('#form-edicao');
const mensagemErro = document.querySelector('#mensagem-erro');
const rotulosHistorico = {
  titulo: 'o título', descricao: 'a descrição', tipo: 'o tipo', prioridade: 'a prioridade',
  status: 'o status', prazo: 'o prazo', responsavel_id: 'o responsável', projeto_id: 'o projeto'
};
let demandaAtual = null;
let membrosProjeto = [];
let projetosDisponiveis = [];
let projetoEdicaoAtual = '';
let consultaMembrosEdicao = 0;
let carregandoMembrosEdicao = false;
let salvandoEdicao = false;

const opcoesStatus = {
  ABERTA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['EM_REVISAO'],
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA'],
  CONCLUIDA: [],
  CANCELADA: ['ABERTA']
};

document.addEventListener('DOMContentLoaded', async function () {
  usuario = await exigirUsuario();
  if (usuario) await carregar();
});
document.querySelector('#btn-comentar').addEventListener('click', comentar);
document.querySelector('#btn-editar').addEventListener('click', abrirEdicao);
document.querySelector('#btn-atualizar-status').addEventListener('click', atualizarStatus);
document.querySelector('#btn-cancelar-demanda').addEventListener('click', cancelarDemanda);
document.querySelector('#fechar-edicao').addEventListener('click', fecharEdicao);
document.querySelector('#cancelar-edicao').addEventListener('click', fecharEdicao);
formularioEdicao.addEventListener('submit', salvarEdicao);
dialogoEdicao.addEventListener('cancel', function (event) {
  if (salvandoEdicao) event.preventDefault();
});
document.querySelector('#edicao-projeto').addEventListener('change', trocarProjetoEdicao);

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

function ocultarConteudoDemanda() {
  document.querySelectorAll(
    '.main-content > .content-card, .main-content > .details-grid'
  ).forEach((elemento) => {
    elemento.hidden = true;
  });
}

function preencherDetalhes(demanda) {
  document.querySelector('.demand-id').textContent = `DEM-${String(demanda.id).padStart(3, '0')}`;
  document.querySelector('.demand-title').textContent = demanda.titulo;
  document.querySelector('#descricao-demanda').textContent = demanda.descricao;

  const badges = document.querySelectorAll('.badges span');
  badges[0].textContent = rotulos[demanda.tipo] || demanda.tipo;
  badges[1].textContent = rotulos[demanda.prioridade] || demanda.prioridade;
  badges[1].className = `badge-custom badge-prioridade-${String(demanda.prioridade).toLowerCase()}`;
  badges[2].textContent = rotulos[demanda.status] || demanda.status;
  badges[2].className = `badge-custom badge-status-${classeStatus(demanda.status)}`;

  const valores = document.querySelectorAll('.info-value');
  [
    demanda.projeto_nome,
    demanda.responsavel_nome || 'Não definido',
    formatarData(demanda.criado_em),
    formatarData(demanda.atualizado_em),
    formatarData(demanda.prazo)
  ].forEach((valor, indice) => { valores[indice].textContent = valor; });

  const podeGerenciar = ['ADMIN', 'LIDER'].includes(usuario.perfil);
  document.querySelector('#btn-editar').hidden = !podeGerenciar;
  document.querySelector('#btn-editar').disabled = true;
  document.querySelector('#btn-cancelar-demanda').hidden = !podeGerenciar || ['CONCLUIDA', 'CANCELADA'].includes(demanda.status);
  preencherTransicoes(demanda);
}

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
  const consulta = ++consultaMembrosEdicao;
  const projeto = document.querySelector('#edicao-projeto');
  const responsavel = document.querySelector('#edicao-responsavel');
  const submit = formularioEdicao.querySelector('[type="submit"]');
  const aviso = document.querySelector('#edicao-projeto-aviso');
  const anterior = projetoEdicaoAtual;
  const responsavelAnterior = responsavel.value;
  const projetoId = projeto.value;
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

function fecharEdicao() {
  if (!salvandoEdicao) dialogoEdicao.close();
}

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

  // Apresenta todos os erros da tentativa, como no Exemplo 03 da Aula 05.
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

  const responsavelAtual = demandaAtual.responsavel_id == null ? '' : String(demandaAtual.responsavel_id);
  if (responsavelAtual !== responsavelNovo) payload.responsavel_id = responsavelNovo ? Number(responsavelNovo) : null;

  const prazoAtual = demandaAtual.prazo || '';
  const prazoNovo = document.querySelector('#edicao-prazo').value;
  if (prazoAtual !== prazoNovo) payload.prazo = prazoNovo || null;
  if (Object.keys(payload).length === 0) return fecharEdicao();

  const submit = formularioEdicao.querySelector('[type="submit"]');
  salvandoEdicao = true;
  submit.disabled = true;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    dialogoEdicao.close();
    await carregar();
  } catch (error) {
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

function mostrarErroCampo(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

function limparErrosEdicao() {
  formularioEdicao.querySelectorAll('.is-invalid').forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });
  formularioEdicao.querySelectorAll('.erro-campo').forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
  mostrarErroEdicao('');
}

function incluirSeAlterado(payload, campo, novo, atual) {
  if (novo !== atual) payload[campo] = novo;
}

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

async function cancelarDemanda() {
  if (!demandaAtual || !confirm('Cancelar esta demanda? O registro e o histórico serão mantidos.')) return;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELADA' }) });
    await carregar();
  } catch (error) {
    exibirErro(error.message);
  }
}

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

function classeStatus(status) {
  return ({ ABERTA: 'aberta', EM_ANDAMENTO: 'andamento', EM_REVISAO: 'revisao', CONCLUIDA: 'concluida', CANCELADA: 'cancelada' })[status] || '';
}

function formatarData(value) {
  if (!value) return 'Não definido';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [ano, mes, dia] = value.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarDataHora(value) {
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function mostrarErroEdicao(mensagem) {
  const elemento = document.querySelector('#edicao-erro');
  elemento.textContent = mensagem;
  elemento.hidden = !mensagem;
}

function exibirErro(mensagem) {
  mensagemErro.textContent = mensagem;
  mensagemErro.hidden = false;
}
