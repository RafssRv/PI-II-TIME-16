/*
Autora: Sophia Franco de Godoy / RA: 24000833
Descrição: Validação do formulário e controle do acesso ao DemandasApp

1. Identificar o formulário, os campos e os espaços de mensagens no HTML
2. Limpar as mensagens e os destaques de erro da tentativa anterior
3. Ler os dados informados e padronizar a escrita do e-mail
4. Conferir o preenchimento dos campos e o formato do e-mail, apresentando
   todos os erros encontrados junto aos respectivos campos
5. Enviar os dados válidos ao servidor por meio da função api(), de api.js.
6. Aguardar a criação da sessão no servidor, identificada por um cookie
7. Abrir o dashboard quando o acesso for autorizado ou apresentar a mensagem
   de erro quando alguma etapa da solicitação falhar
*/

// Seleciona o formulário e os campos da tela
const formulario = document.querySelector('#form-login');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');
const botaoEntrar = formulario.querySelector('[type="submit"]');

// Seleciona os espaços das mensagens de erro
const erroEmail = document.querySelector('#erro-email');
const erroSenha = document.querySelector('#erro-senha');

// Agrupa os campos e as mensagens para facilitar a limpeza dos erros
const camposComErro = [campoEmail, campoSenha];
const mensagensDeErro = [erroEmail, erroSenha];

// Destaca o campo com erro e mostra a mensagem abaixo dele
function mostrarErro(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

// Remove as mensagens e os destaques de erro da tentativa anterior
function limparErros() {
  camposComErro.forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });

  mensagensDeErro.forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
}

// Executa ao clicar em Entrar ou pressionar Enter no formulário
formulario.addEventListener('submit', async function (event) {

  // Impede que a página recarregue ao enviar o formulário
  event.preventDefault();

  limparErros();

  // Remove espaços das extremidades do e-mail e deixa as letras minúsculas
  const email = campoEmail.value.trim().toLowerCase();

  // Mantém a senha exatamente como foi digitada
  const senha = campoSenha.value;

  // Começa considerando o formulário válido; qualquer erro muda para false
  let formularioValido = true;

  // Verifica se o e-mail está preenchido e tem um formato válido
  if (email === '') {
    mostrarErro(campoEmail, erroEmail, 'E-mail é obrigatório.');
    formularioValido = false;
  } else if (campoEmail.validity.typeMismatch) {
    mostrarErro(campoEmail, erroEmail, 'Informe um e-mail válido.');
    formularioValido = false;
  }

  // Verifica se a senha está vazia ou contém apenas espaços
  if (senha.trim() === '') {
    mostrarErro(campoSenha, erroSenha, 'Senha é obrigatória.');
    formularioValido = false;
  }

  // Interrompe o envio quando algum campo precisa ser corrigido
  if (!formularioValido) return;

  botaoEntrar.disabled = true;
  try {

    // Envia o e-mail e a senha ao servidor e aguarda a resposta
    await entrarApi(email, senha);

    // Abre o dashboard após o login ser autorizado
    window.location.replace('dashboard.html');

  } catch (error) {

    // Mostra a mensagem de erro caso a solicitação falhe
    mostrarErro(campoSenha, erroSenha, error.message);
    campoSenha.value = '';
  } finally {
    botaoEntrar.disabled = false;
  }
});

// Uma sessão ainda válida permite voltar ao dashboard sem digitar a senha novamente.
document.addEventListener('DOMContentLoaded', async function () {
  try {
    await buscarSessaoApi();
    window.location.replace('dashboard.html');
  } catch {
    // Abrir o login sem uma sessão é uma situação normal.
  }
});
