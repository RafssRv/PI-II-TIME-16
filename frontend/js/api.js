/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Compartilhado entre as telas (comunicação com a API)

Descrição: 
Centraliza as requisições ao servidor e o tratamento das respostas e dos erros. Reúne as chamadas de login, consulta
da sessão e logout, utilizando o cookie de sessão nas solicitações
*/
 
// Define o endereço inicial usado pelas chamadas da API
const API_BASE = '/api';

// Envia uma solicitação ao backend e trata a resposta
async function api(path, options = {}) {

  // Configura o formato JSON e mantém os cabeçalhos personalizados
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  // Faz a requisição usando o mesmo endereço e envia o cookie da sessão
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  // Respostas sem conteúdo são consideradas concluídas com sucesso
  if (response.status === 204) return null;

  // Converte a resposta em JSON ou usa um objeto vazio se não houver JSON
  const body = await response.json().catch(() => ({}));

  // Verifica se a resposta indica uma falha
  if (!response.ok) {

    // Redireciona para o login quando a sessão não estiver válida
    if (response.status === 401 && !window.location.pathname.endsWith('/login.html')) {
      window.location.replace('login.html');
    }

    // Cria um erro com a mensagem e o código HTTP devolvido pelo servidor
    const erro = new Error(body.error || body.mensagem || 'Não foi possível concluir a operação.');
    erro.status = response.status;
    throw erro;
  }
  return body;
}

// Envia o e-mail e a senha para realizar o login
async function entrarApi(email, senha) {
  return await api('/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha })
  });
}

// Consulta os dados da sessão atual
async function buscarSessaoApi() {
  return await api('/sessao');
}

// Solicita ao servidor que encerre a sessão atual
async function sairApi() {
  return await api('/logout', { method: 'POST' });
}

// Converte códigos internos em nomes apresentados ao usuário
const rotulos = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', EM_REVISAO: 'Em revisão',
  CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
  CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa',
  TAREFA: 'Tarefa', DEFEITO: 'Defeito', MELHORIA: 'Melhoria', DOCUMENTACAO: 'Documentação'
};

// Formata uma data no padrão brasileiro ou informa que ela não foi definida
function formatarData(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : 'Não definido';
}
