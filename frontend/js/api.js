// Autor: Vinícius Panutti Salgado — R.A. 25007329
// Descrição: Cliente compartilhado da API usado por todas as telas: envia o token da sessão,
// trata erros, guarda o usuário logado e traz rótulos e funções de apoio comuns ao frontend.
 
const API_BASE = '/api';

async function api(path, options = {}) {
  const token = sessionStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token && path !== '/login') headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      sessionStorage.removeItem('usuario');
      sessionStorage.removeItem('token');
      if (!window.location.pathname.endsWith('/login.html')) window.location.href = 'login.html';
    }
    throw new Error(body.error || 'Não foi possível concluir a operação.');
  }
  return body;
}

function usuarioAtual() {
  try {
    const value = sessionStorage.getItem('usuario');
    return value ? JSON.parse(value) : null;
  } catch {
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('token');
    return null;
  }
}

function exigirUsuario() {
  const user = usuarioAtual();
  if (!user || !sessionStorage.getItem('token')) {
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('token');
    window.location.replace('login.html');
    return null;
  }
  return user;
}

// Encerra a sessão desta aba e volta ao login sem manter a tela atual no histórico.
function encerrarSessao() {
  sessionStorage.removeItem('usuario');
  sessionStorage.removeItem('token');
  window.location.replace('login.html');
}

// Revalida a sessão quando o navegador restaura uma tela interna pelo botão Voltar.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && document.querySelector('.sidebar-menu')) exigirUsuario();
});

const rotulos = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', EM_REVISAO: 'Em revisão',
  CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
  CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa',
  TAREFA: 'Tarefa', DEFEITO: 'Defeito', MELHORIA: 'Melhoria', DOCUMENTACAO: 'Documentação'
};

function formatarData(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : 'Não definido';
}

// Para o ADMIN, o item "Projetos" do menu lateral abre a tela de consulta de projetos e usuários.
// Os demais perfis mantêm o atalho original para o filtro de projeto da listagem.
document.addEventListener('DOMContentLoaded', () => {
  const botaoSair = document.querySelector('#btn-sair');
  if (botaoSair) botaoSair.addEventListener('click', encerrarSessao);

  if (usuarioAtual()?.perfil !== 'ADMIN') return;
  const link = document.querySelector('.sidebar-menu a[href$="projetos.html"]');
  if (!link) return;
  link.setAttribute('href', 'administracao.html');
  link.textContent = 'Projetos e usuários';
});
