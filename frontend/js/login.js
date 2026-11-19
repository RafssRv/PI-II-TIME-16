/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Login

Descrição: 
Faz a conferência do e-mail e da senha antes de solicitar o acesso ao sistema. Mostra as mensagens de erro
no formulário e encaminha o usuário ao dashboard quando o login é autorizado ou já existe uma sessão válida
*/

// Encontrar os elementos da tela de login no HTML e guardá-los em variáveis
// Encontrar o formulário e os campos
const formulario = document.querySelector('#form-login');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');

// Procura dentro do formulário o botão que tem type="submit", usado para enviá-lo
const botaoEntrar = formulario.querySelector('[type="submit"]');

// Seleciona os espaços do HTML onde serão exibidas as mensagens de erro
const erroEmail = document.querySelector('#erro-email');
const erroSenha = document.querySelector('#erro-senha');

// Cria duas listas: uma com os campos e outra com os espaços das mensagens
// Isso permite percorrer todos eles ao limpar os erros da tentativa anterior
const camposComErro = [campoEmail, campoSenha];
const mensagensDeErro = [erroEmail, erroSenha];

// Mostrar uma mensagem de erro na tela e destacar o campo que está com problema
function mostrarErro(campo, elementoErro, mensagem) {

  // Adiciona a classe is-invalid, que destaca o campo usando o estilo da página
  campo.classList.add('is-invalid');

  // Coloca a mensagem como texto no espaço de erro correspondente
  elementoErro.innerText = mensagem;
}

// Limpa os erros exibidos anteriormente, para começar uma nova tentativa
function limparErros() {

  // forEach passa por cada campo da lista e remove seu destaque de erro
  camposComErro.forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });

  // Passa por cada espaço de mensagem e troca o texto por uma string vazia
  // Limpa as mensagens de erro 
  mensagensDeErro.forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
}

// Verifica o que a pessoa digitou no formulário de login e, se estiver tudo preenchido corretamente, enviar o e-mail e a senha para o servidor
// addEventListener espera o evento submit, quando isso acontece, executa a função abaixo
// async permite usar await para esperar a resposta do servidor sem travar a página enquanto ela chega
formulario.addEventListener('submit', async function (event) {

  // event representa o envio
  // preventDefault impede o comportamento padrão do navegador, que enviaria o formulário e recarregaria a página
  event.preventDefault();

  limparErros();

  // Lê o que o usuário digitou 
  const email = campoEmail.value.trim().toLowerCase();
  const senha = campoSenha.value;

  // Acompanha o resultado das verificações
  let formularioValido = true;

  if (email === '') {
    mostrarErro(campoEmail, erroEmail, 'E-mail é obrigatório.');
    formularioValido = false;

  // Caso não esteja vazio, consulta a verificação de formato do navegador
  // typeMismatch indica que o conteúdo não tem um formato de e-mail aceito
  } else if (campoEmail.validity.typeMismatch) {
    mostrarErro(campoEmail, erroEmail, 'Informe um e-mail válido.');
    formularioValido = false;
  }

  if (senha.trim() === '') {
    mostrarErro(campoSenha, erroSenha, 'Senha é obrigatória.');
    formularioValido = false;
  }

  // Se alguma verificação falhou, não envia o formulário
  if (!formularioValido) return;

  // Desativa o botão enquanto a solicitação está em andamento
  botaoEntrar.disabled = true;

  try {

    // Envia o e-mail e a senha ao servidor
    await entrarApi(email, senha);

    // Se o login der certo, abre o dashboard 
    // replace substitui a página atual no histórico de navegação por essa página
    window.location.replace('dashboard.html');

  } catch (error) {
    mostrarErro(campoSenha, erroSenha, error.message);

    // Apaga a senha digitada, deixando o campo pronto para uma nova tentativa
    campoSenha.value = '';
  } finally {
    // Reativa o botão ao final da tentativa
    botaoEntrar.disabled = false;
  }
});

// Verifica se a pessoa já está logada quando abre a página de login
// Se ela já tiver uma sessão válida, o sistema a encaminha diretamente para o dashboard, sem precisar digitar o e-mail e a senha novamente
document.addEventListener('DOMContentLoaded', async function () {
  try {
    // Verifica se a pessoa já possui uma sessão ativa no servidor
    await buscarSessaoApi();
    
    // Se a consulta funcionar, abre o dashboard sem pedir o login novamente
    window.location.replace('dashboard.html');
  } catch {
    // Se a consulta falhar, mantém a tela de login aberta
  }
});
