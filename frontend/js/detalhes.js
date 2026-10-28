// Autor: Priscila Amorim
// Descrição: Consulta detalhes, comentários e histórico; permite editar e acompanhar o ciclo da demanda.

const usuario = exigirUsuario();
const demandaId = Number(new URLSearchParams(window.location.search).get('id'));
const dialogoEdicao = document.querySelector('#dialog-edicao');
const formularioEdicao = document.querySelector('#form-edicao');
const mensagemErro = document.querySelector('#mensagem-erro');
const rotulosHistorico = {
  titulo: 'o título', descricao: 'a descrição', tipo: 'o tipo', prioridade: 'a prioridade',
  status: 'o status', prazo: 'o prazo', responsavel_id: 'o responsável'
};
let demandaAtual = null;
let membrosProjeto = [];

const opcoesStatus = {
  ABERTA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['EM_REVISAO'],
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA'],
  CONCLUIDA: [],
  CANCELADA: []
};

document.addEventListener('DOMContentLoaded', carregar);
document.querySelector('#btn-comentar').addEventListener('click', comentar);
document.querySelector('#btn-editar').addEventListener('click', abrirEdicao);
document.querySelector('#btn-atualizar-status').addEventListener('click', atualizarStatus);
document.querySelector('#btn-cancelar-demanda').addEventListener('click', cancelarDemanda);
document.querySelector('#fechar-edicao').addEventListener('click', fecharEdicao);
document.querySelector('#cancelar-edicao').addEventListener('click', fecharEdicao);
formularioEdicao.addEventListener('submit', salvarEdicao);
if (usuario?.perfil === 'MEMBRO') document.querySelector('.sidebar-menu a[href="cadastro.html"]').hidden = true;

async function carregar() {
  if (!Number.isInteger(demandaId) || demandaId < 1) {
    exibirErro('Identificador de demanda inválido.');
    return;
  }

  mensagemErro.hidden = true;
  try {
    demandaAtual = await api(`/demandas/${demandaId}`);
    preencherDetalhes(demandaAtual);
    await carregarMembros();
    renderizarComentarios(demandaAtual.comentarios || []);
    renderizarHistorico(demandaAtual.historico || []);
  } catch (error) {
    exibirErro(error.message);
  }
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
  document.querySelector('#btn-cancelar-demanda').hidden = !podeGerenciar || ['CONCLUIDA', 'CANCELADA'].includes(demanda.status);
  preencherTransicoes(demanda);
}

function preencherTransicoes(demanda) {
  const select = document.querySelector('#novo-status');
  const botao = document.querySelector('#btn-atualizar-status');
  const statusPossiveis = [...(opcoesStatus[demanda.status] || [])];
  if (usuario?.perfil === 'MEMBRO') {
    const apenasMembro = { ABERTA: ['EM_ANDAMENTO'], EM_ANDAMENTO: ['EM_REVISAO'] };
    statusPossiveis.splice(0, statusPossiveis.length, ...(apenasMembro[demanda.status] || []));
    if (Number(demanda.responsavel_id) !== Number(usuario.id)) statusPossiveis.length = 0;
  }

  select.replaceChildren(new Option(statusPossiveis.length ? 'Escolha o próximo status...' : 'Sem transição disponível', ''));
  statusPossiveis.forEach((status) => select.add(new Option(rotulos[status], status)));
  select.hidden = statusPossiveis.length === 0;
  botao.hidden = statusPossiveis.length === 0;
}

async function carregarMembros() {
  membrosProjeto = [];
  if (!demandaAtual || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;
  try {
    membrosProjeto = await api(`/projetos/${demandaAtual.projeto_id}/membros`);
  } catch (error) {
    exibirErro(error.message);
  }
}

function abrirEdicao() {
  if (!demandaAtual || !['ADMIN', 'LIDER'].includes(usuario.perfil)) return;
  document.querySelector('#edicao-titulo').value = demandaAtual.titulo;
  document.querySelector('#edicao-descricao').value = demandaAtual.descricao;
  document.querySelector('#edicao-tipo').value = demandaAtual.tipo;
  document.querySelector('#edicao-prioridade').value = demandaAtual.prioridade;
  document.querySelector('#edicao-prazo').value = demandaAtual.prazo || '';

  const responsavel = document.querySelector('#edicao-responsavel');
  responsavel.replaceChildren(new Option('Sem responsável definido', ''));
  membrosProjeto.forEach((membro) => responsavel.add(new Option(membro.nome, membro.id)));
  if (demandaAtual.responsavel_id && !membrosProjeto.some((membro) => Number(membro.id) === Number(demandaAtual.responsavel_id))) {
    responsavel.add(new Option(demandaAtual.responsavel_nome || `Usuário ${demandaAtual.responsavel_id}`, demandaAtual.responsavel_id));
  }
  responsavel.value = demandaAtual.responsavel_id || '';
  mostrarErroEdicao('');
  dialogoEdicao.showModal();
}

function fecharEdicao() {
  dialogoEdicao.close();
}

async function salvarEdicao(event) {
  event.preventDefault();
  if (!demandaAtual) return;

  const titulo = document.querySelector('#edicao-titulo').value.trim();
  const descricao = document.querySelector('#edicao-descricao').value.trim();
  if (titulo.length < 3 || titulo.length > 100) return mostrarErroEdicao('O título deve ter entre 3 e 100 caracteres.');
  if (descricao.length < 10 || descricao.length > 1000) return mostrarErroEdicao('A descrição deve ter entre 10 e 1000 caracteres.');

  const payload = { autor_id: usuario.id };
  incluirSeAlterado(payload, 'titulo', titulo, demandaAtual.titulo);
  incluirSeAlterado(payload, 'descricao', descricao, demandaAtual.descricao);
  incluirSeAlterado(payload, 'tipo', document.querySelector('#edicao-tipo').value, demandaAtual.tipo);
  incluirSeAlterado(payload, 'prioridade', document.querySelector('#edicao-prioridade').value, demandaAtual.prioridade);

  const responsavelAtual = demandaAtual.responsavel_id == null ? '' : String(demandaAtual.responsavel_id);
  const responsavelNovo = document.querySelector('#edicao-responsavel').value;
  if (responsavelAtual !== responsavelNovo) payload.responsavel_id = responsavelNovo ? Number(responsavelNovo) : null;

  const prazoAtual = demandaAtual.prazo || '';
  const prazoNovo = document.querySelector('#edicao-prazo').value;
  if (prazoAtual !== prazoNovo) payload.prazo = prazoNovo || null;
  if (Object.keys(payload).length === 1) return fecharEdicao();

  mostrarErroEdicao('');
  const submit = formularioEdicao.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    fecharEdicao();
    await carregar();
  } catch (error) {
    mostrarErroEdicao(error.message);
  } finally {
    submit.disabled = false;
  }
}

function incluirSeAlterado(payload, campo, novo, atual) {
  if (novo !== atual) payload[campo] = novo;
}

async function atualizarStatus() {
  const status = document.querySelector('#novo-status').value;
  if (!status) return;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ autor_id: usuario.id, status }) });
    await carregar();
  } catch (error) {
    exibirErro(error.message);
  }
}

async function cancelarDemanda() {
  if (!demandaAtual || !confirm('Cancelar esta demanda? O registro e o histórico serão mantidos.')) return;
  try {
    await api(`/demandas/${demandaId}`, { method: 'PATCH', body: JSON.stringify({ autor_id: usuario.id, status: 'CANCELADA' }) });
    await carregar();
  } catch (error) {
    exibirErro(error.message);
  }
}

async function comentar() {
  const input = document.querySelector('#comentario-input');
  const texto = input.value.trim();
  const erro = document.querySelector('#comentario-erro');
  if (texto.length < 3 || texto.length > 500) {
    erro.textContent = 'O comentário deve ter entre 3 e 500 caracteres.';
    erro.style.display = 'block';
    return;
  }
  try {
    await api(`/demandas/${demandaId}/comentarios`, { method: 'POST', body: JSON.stringify({ autor_id: usuario.id, texto }) });
    input.value = '';
    erro.style.display = 'none';
    await carregar();
  } catch (error) {
    erro.textContent = error.message;
    erro.style.display = 'block';
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
