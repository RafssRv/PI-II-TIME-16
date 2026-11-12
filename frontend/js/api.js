// Autor: Vinícius Panutti Salgado — R.A. 25007329
// Descrição: Cliente compartilhado da API: envia o cookie de sessão, trata erros
// e reúne as chamadas de login, consulta da sessão e logout da Aula 11.
 
const API_BASE = '/api';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !window.location.pathname.endsWith('/login.html')) {
      window.location.replace('login.html');
    }
    const erro = new Error(body.error || body.mensagem || 'Não foi possível concluir a operação.');
    erro.status = response.status;
    throw erro;
  }
  return body;
}

async function entrarApi(email, senha) {
  return await api('/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha })
  });
}

async function buscarSessaoApi() {
  return await api('/sessao');
}

async function sairApi() {
  return await api('/logout', { method: 'POST' });
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
