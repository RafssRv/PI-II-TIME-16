/*
Autora: Sophia Franco de Godoy / RA: 24000833
Descrição: Controla o envio do formulário de login
Implementação: Intercepta o envio para evitar a navegação padrão, limpa mensagens
de erro anteriores e envia o e-mail e a senha à API. Se o login for bem-sucedido,
armazena os dados da sessão no sessionStorage e direciona o usuário ao dashboard
Se a API retornar um erro, exibe a mensagem no formulário
*/

const formulario = document.querySelector('#form-login');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');
const erroEmail = document.querySelector('#erro-email');
const erroSenha = document.querySelector('#erro-senha');

formulario.addEventListener('submit', async (event) => {
  event.preventDefault();
  erroEmail.textContent = '';
  erroSenha.textContent = '';
  try {
    const sessao = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email: campoEmail.value.trim(), senha: campoSenha.value })
    });
    sessionStorage.setItem('usuario', JSON.stringify(sessao.usuario));
    sessionStorage.setItem('token', sessao.token);
    window.location.href = 'dashboard.html';
  } catch (error) {
    erroSenha.textContent = error.message;
    erroSenha.style.display = 'block';
  }
});
