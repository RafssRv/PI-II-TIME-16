// Autor: Equipe PI-II-TIME-16
// Descrição: Cliente HTTP compartilhado com mensagens de erro e sessão autenticada.

const API_BASE = '/api';

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith('/login')) {
    sessionStorage.removeItem('usuario');
    if (!window.location.pathname.endsWith('/login.html')) window.location.href = 'login.html';
  }
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

function usuarioAtual() {
  const value = sessionStorage.getItem('usuario');
  if (!value) return null;
  try { return JSON.parse(value); } catch { sessionStorage.removeItem('usuario'); return null; }
}

function exigirUsuario() {
  const user = usuarioAtual();
  if (!user) window.location.href = 'login.html';
  return user;
}

const rotulos = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', EM_REVISAO: 'Em revisão',
  CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
  CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa',
  TAREFA: 'Tarefa', DEFEITO: 'Defeito', MELHORIA: 'Melhoria', DOCUMENTACAO: 'Documentação'
};

function formatarData(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : 'Não definido';
}
