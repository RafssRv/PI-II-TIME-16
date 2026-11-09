/*
Autora: Sophia Franco de Godoy
Descrição: Script de validação do formulário de login utilizando funções padronizadas e regras de Regex.
*/

const formulario = document.querySelector("#form-login");

const campoEmail = document.querySelector("#email");
const campoSenha = document.querySelector("#senha");

const erroEmail = document.querySelector("#erro-email");
const erroSenha = document.querySelector("#erro-senha");

const camposComErro = [campoEmail, campoSenha];
const mensagensDeErro = [erroEmail, erroSenha];

// Função auxiliar para exibir erro seguindo o padrão da aula
function mostrarErro(campo, elementoErro, mensagem) {
    campo.classList.add("is-invalid");
    elementoErro.innerText = mensagem;
}

// Função para limpar os erros antes de uma nova validação
function limparErros() {
    camposComErro.forEach(function (campo) {
        campo.classList.remove("is-invalid");
    });

    mensagensDeErro.forEach(function (elementoErro) {
        elementoErro.innerText = "";
    });
}

formulario.addEventListener("submit", function (event) {
    // Impede o envio padrão do formulário
    event.preventDefault();
    limparErros();

    const email = campoEmail.value.trim().toLowerCase();
    const senha = campoSenha.value;

    let formValido = true;

    // Validação de E-mail
    if (email === "") {
        mostrarErro(campoEmail, erroEmail, "O campo e-mail é obrigatório.");
        formValido = false;
    } else if (campoEmail.validity.typeMismatch) {
        mostrarErro(campoEmail, erroEmail, "Informe um endereço de e-mail válido.");
        formValido = false;
    }

    // Validação de Senha (Critérios: mínimo de 6 caracteres, com letra maiúscula, minúscula e número)
    const possuiMaiuscula = /[A-Z]/.test(senha);
    const possuiMinuscula = /[a-z]/.test(senha);
    const possuiNumero = /[0-9]/.test(senha);

    if (senha === "") {
        mostrarErro(campoSenha, erroSenha, "O campo senha é obrigatório.");
        formValido = false;
    } else if (senha.length < 6 || !possuiMaiuscula || !possuiMinuscula || !possuiNumero) {
        mostrarErro(campoSenha, erroSenha, "A senha deve ter pelo menos 6 caracteres, contendo letra maiúscula, minúscula e número.");
        formValido = false;
    }

    if (formValido) {
        console.log(`Login autorizado para o e-mail: ${email}`);
        alert("Login realizado com sucesso!");
    }
});