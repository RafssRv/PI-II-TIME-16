const user = exigirUsuario();
const demandId = Number(new URLSearchParams(window.location.search).get('id'));

document.addEventListener('DOMContentLoaded', carregar);
document.querySelector('#btn-comentar').addEventListener('click', comentar);
const actionButtons = document.querySelectorAll('.demand-actions button');
actionButtons[0].addEventListener('click', editar);
actionButtons[1].addEventListener('click', atualizarStatus);
const deleteButton = document.createElement('button');
deleteButton.className = 'btn-secondary-custom';
deleteButton.textContent = 'Excluir';
deleteButton.addEventListener('click', excluir);
document.querySelector('.demand-actions').append(deleteButton);

async function carregar() {
  if (!demandId) return alert('Demanda inválida.');
  try {
    const demanda = await api(`/demandas/${demandId}`);
    document.querySelector('.demand-id').textContent = `DEM-${String(demanda.id).padStart(3, '0')}`;
    document.querySelector('.demand-title').textContent = demanda.titulo;
    const badges = document.querySelectorAll('.badges span');
    badges[0].textContent = rotulos[demanda.tipo]; badges[1].textContent = rotulos[demanda.prioridade]; badges[2].textContent = rotulos[demanda.status];
    const descriptions = document.querySelectorAll('.description'); descriptions[0].textContent = demanda.descricao; descriptions[1].remove();
    const values = document.querySelectorAll('.info-value');
    [demanda.projeto_nome, demanda.responsavel_nome || 'Não definido', formatarData(demanda.criado_em), formatarData(demanda.atualizado_em), formatarData(demanda.prazo)].forEach((value, index) => { values[index].textContent = value; });
    const commentForm = document.querySelector('.comment-form');
    document.querySelectorAll('.comment').forEach((item) => item.remove());
    demanda.comentarios.forEach((item) => commentForm.parentNode.insertBefore(criarComentario(item), commentForm));
    const history = document.querySelector('.history'); history.replaceChildren(...demanda.historico.map(criarHistorico));
  } catch (error) { alert(error.message); }
}

async function comentar() {
  const input = document.querySelector('#comentario-input');
  const texto = input.value.trim();
  const erro = document.querySelector('#comentario-erro');
  if (texto.length < 3 || texto.length > 500) { erro.textContent = 'O comentário deve ter entre 3 e 500 caracteres.'; erro.style.display = 'block'; return; }
  try { await api(`/demandas/${demandId}/comentarios`, { method: 'POST', body: JSON.stringify({ autor_id: user.id, texto }) }); input.value = ''; erro.style.display = 'none'; await carregar(); }
  catch (error) { erro.textContent = error.message; erro.style.display = 'block'; }
}
async function editar() {
  const tituloAtual = document.querySelector('.demand-title').textContent;
  const descricaoAtual = document.querySelector('.description').textContent;
  const titulo = prompt('Novo título:', tituloAtual);
  if (titulo === null) return;
  const descricao = prompt('Nova descrição:', descricaoAtual);
  if (descricao === null) return;
  try {
    await api(`/demandas/${demandId}`, { method: 'PATCH', body: JSON.stringify({ autor_id: user.id, titulo, descricao }) });
    await carregar();
  } catch (error) { alert(error.message); }
}
async function atualizarStatus() {
  const status = prompt('Status: ABERTA, EM_ANDAMENTO, EM_REVISAO, CONCLUIDA ou CANCELADA');
  if (!status) return;
  try {
    await api(`/demandas/${demandId}`, { method: 'PATCH', body: JSON.stringify({ autor_id: user.id, status: status.trim().toUpperCase() }) });
    await carregar();
  } catch (error) { alert(error.message); }
}
async function excluir() {
  if (!confirm('Excluir esta demanda e seus comentários e histórico?')) return;
  try {
    await api(`/demandas/${demandId}`, { method: 'DELETE' });
    window.location.href = 'listagemDemandas.html';
  } catch (error) { alert(error.message); }
}
function criarComentario(item) { const div = document.createElement('div'); div.className = 'comment'; const header = document.createElement('div'); header.className = 'comment-header'; const author = document.createElement('span'); author.className = 'comment-author'; author.textContent = item.autor_nome; const date = document.createElement('span'); date.className = 'comment-date'; date.textContent = new Date(item.criado_em).toLocaleString('pt-BR'); const text = document.createElement('p'); text.className = 'comment-text'; text.textContent = item.texto; header.append(author, date); div.append(header, text); return div; }
function criarHistorico(item) { const div = document.createElement('div'); div.className = 'history-item'; const text = document.createElement('p'); text.className = 'history-text'; text.textContent = item.acao === 'CRIACAO' ? `${item.autor_nome} criou a demanda.` : `${item.autor_nome} alterou ${item.campo}: ${item.valor_anterior || 'vazio'} → ${item.valor_novo || 'vazio'}.`; const date = document.createElement('span'); date.className = 'history-date'; date.textContent = new Date(item.criado_em).toLocaleString('pt-BR'); div.append(text, date); return div; }
