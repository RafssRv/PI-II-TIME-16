/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Login (controla o formulário de login) 
  - Valida os dados, tenta autenticar e controla o resultado do login

Descrição: 
Faz a conferência do e-mail e da senha antes de solicitar o acesso ao sistema. Mostra as mensagens de erro
no formulário e encaminha o usuário ao dashboard quando o login é autorizado ou já existe uma sessão válida
*/

// Guarda os elementos usados pelo formulário de login
const formulario = document.querySelector('#form-login');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');

// Guarda o botão que envia o formulário
const botaoEntrar = formulario.querySelector('[type="submit"]');

// Guarda os elementos que exibem mensagens de erro
const erroEmail = document.querySelector('#erro-email');
const erroSenha = document.querySelector('#erro-senha');

// Organiza os campos e suas mensagens para facilitar a limpeza dos erros
const camposComErro = [campoEmail, campoSenha];
const mensagensDeErro = [erroEmail, erroSenha];

// Marca um campo como inválido e mostra sua mensagem de erro
function mostrarErro(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

// Remove os erros antes de validar uma nova tentativa
function limparErros() {

  // Remove a marcação de todos os campos
  camposComErro.forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });

  // Apaga todas as mensagens de erro
  mensagensDeErro.forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
}

// Valida os dados e envia o login ao servidor
formulario.addEventListener('submit', async function (event) {

  // Impede o navegador de recarregar a página ao enviar o formulário
  event.preventDefault();
  limparErros();

  // Padroniza o e-mail e lê a senha digitada
  const email = campoEmail.value.trim().toLowerCase();
  const senha = campoSenha.value;

  // Define como válida até encontrar algum dado incorreto
  let formularioValido = true;

  // Exige o preenchimento do e-mail
  if (email === '') {
    mostrarErro(campoEmail, erroEmail, 'E-mail é obrigatório.');
    formularioValido = false;

  // Confere o formato de e-mail reconhecido pelo navegador
  } else if (campoEmail.validity.typeMismatch) {
    mostrarErro(campoEmail, erroEmail, 'Informe um e-mail válido.');
    formularioValido = false;
  }

  // Exige o preenchimento da senha
  if (senha.trim() === '') {
    mostrarErro(campoSenha, erroSenha, 'Senha é obrigatória.');
    formularioValido = false;
  }

  // Interrompe o envio caso algum dado seja inválido
  if (!formularioValido) return;

  // Impede novos envios enquanto aguarda o servidor
  botaoEntrar.disabled = true;

  try {
    // Solicita o login com os dados informados
    await entrarApi(email, senha);

    // Envia o usuário para o dashboard após entrar
    window.location.replace('dashboard.html');

  } catch (error) {
    mostrarErro(campoSenha, erroSenha, error.message);

    // Apaga a senha para uma nova tentativa
    campoSenha.value = '';
  } finally {

    // Reativa o botão depois da tentativa
    botaoEntrar.disabled = false;
  }
});

// Verifica se existe uma sessão ativa ao abrir a página
document.addEventListener('DOMContentLoaded', async function () {

  try {
    // Consulta o servidor sobre a sessão atual
    await buscarSessaoApi();
    
    // Abre o dashboard quando a sessão já estiver válida
    window.location.replace('dashboard.html');
    
  } catch {
    // Mantém a tela de login aberta se não houver sessão válida
  }
});
