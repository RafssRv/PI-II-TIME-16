/*
  Autor: Priscila Amorim dos Santos
  Tela: Detalhes da Demanda
  Branch: feature/detalhes
  Descrição: Validação do campo de novo comentário.
  Regras aplicadas:
    - Campo obrigatório (não permite vazio ou só espaços)
    - Mínimo de 3 caracteres
    - Máximo de 500 caracteres
    - Mensagem de erro exibida ao usuário
    - Impede o envio enquanto o campo estiver inválido
    - Ao validar com sucesso, adiciona o comentário na lista da tela
*/

document.addEventListener('DOMContentLoaded', () => {

    const input = document.getElementById('comentario-input');
    const erro = document.getElementById('comentario-erro');
    const botaoComentar = document.getElementById('btn-comentar');
    const comentarioForm = document.querySelector('.comment-form');

    const TAMANHO_MINIMO = 3;
    const TAMANHO_MAXIMO = 500;

    function mostrarErro(mensagem) {
        erro.textContent = mensagem;
        erro.style.display = 'block';
        input.style.borderColor = 'var(--erro)';
    }

    function limparErro() {
        erro.textContent = '';
        erro.style.display = 'none';
        input.style.borderColor = '';
    }

    function validarComentario() {
        const valor = input.value.trim();

        if (valor.length === 0) {
            mostrarErro('O comentário não pode ficar vazio.');
            return false;
        }

        if (valor.length < TAMANHO_MINIMO) {
            mostrarErro(`O comentário deve ter no mínimo ${TAMANHO_MINIMO} caracteres.`);
            return false;
        }

        if (valor.length > TAMANHO_MAXIMO) {
            mostrarErro(`O comentário deve ter no máximo ${TAMANHO_MAXIMO} caracteres.`);
            return false;
        }

        limparErro();
        return true;
    }

    function adicionarComentarioNaTela(texto) {
        const novoComentario = document.createElement('div');
        novoComentario.className = 'comment';

        const agora = new Date();
        const dataFormatada = agora.toLocaleDateString('pt-BR');
        const horaFormatada = agora.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        novoComentario.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">Você</span>
                <span class="comment-date">${dataFormatada} às ${horaFormatada}</span>
            </div>
            <p class="comment-text"></p>
        `;

        novoComentario.querySelector('.comment-text').textContent = texto;

        comentarioForm.parentNode.insertBefore(novoComentario, comentarioForm);
    }

    botaoComentar.addEventListener('click', () => {
        if (!validarComentario()) {
            return;
        }

        const texto = input.value.trim();
        adicionarComentarioNaTela(texto);

        input.value = '';
        limparErro();
    });

    input.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            botaoComentar.click();
        }
    });

    input.addEventListener('input', () => {
        if (erro.style.display === 'block') {
            limparErro();
        }
    });

});