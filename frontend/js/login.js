/*
Autora: Sophia Franco de Godoy / RA: 24000833
Descrição: Controla o envio do formulário de login

Intercepta o envio para evitar a navegação padrão, limpa mensagens
de erro anteriores e envia o e-mail e a senha à API. Se o login for bem-sucedido,
armazena os dados da sessão no sessionStorage e direciona o usuário ao dashboard
Se a API retornar um erro, exibe a mensagem no formulário
*/

/* SELEÇÃO DOS ELEMENTOS HTML */
const formulario = document.querySelector('#form-login');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');
const erroEmail = document.querySelector('#erro-email');
const erroSenha = document.querySelector('#erro-senha');

/* CONTROLE DO ENVIO DO FORMULÁRIO */
formulario.addEventListener('submit', async (event) => {

  // Impede o comportamento padrão de envio do formulário pelo navegador
  event.preventDefault();

  /* LIMPEZA DAS MENSAGENS DE ERRO */
  // Remove a mensagem anterior de erro do e-mail
  erroEmail.textContent = '';

  // Remove a mensagem anterior de erro da senha
  erroSenha.textContent = '';

  /* REQUISIÇÃO DE LOGIN */
  try {

    /* ENVIO DAS CREDENCIAIS */
    const sessao = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email: campoEmail.value.trim(), senha: campoSenha.value })
    });

    /* ARMAZENAMENTO DOS DADOS DA SESSÃO */
    // Armazena os dados do usuário na chave 'usuario'
    sessionStorage.setItem('usuario', JSON.stringify(sessao.usuario));

    // Armazena o token de autenticação na chave 'token'
    sessionStorage.setItem('token', sessao.token);

    /* REDIRECIONAMENTO APÓS O LOGIN */
    // Direciona o usuário para a página principal do sistema
    window.location.href = 'dashboard.html';

  /* TRATAMENTO DE ERROS */
  } catch (error) {

    // Insere a mensagem do erro no elemento destinado aos erros de senha
    erroSenha.textContent = error.message;

    // Torna o elemento de erro visível, utilizando a exibição em bloco
    erroSenha.style.display = 'block';
  }
});
