// Autor: Rafael Roveri
// Descrição: Validações do formulário de cadastro de demanda

document.querySelector('form').addEventListener('submit', function (event) {
  event.preventDefault();

  limparErros();

  const valido = [
    validarTexto('titulo', 3, 100),
    validarTexto('descricao', 10, 1000),
    validarSelect('projeto'),
    validarSelect('tipo'),
    validarSelect('prioridade'),
    validarPrazo('prazo'),
  ].every(Boolean);

  if (valido) {
    // TODO: enviar dados pro backend
    alert('Demanda criada com sucesso!');
  }
});

function validarTexto(id, min, max) {
  const campo = document.getElementById(id);
  const valor = campo.value.trim();

  if (!valor) {
    mostrarErro(campo, 'Campo obrigatório.');
    return false;
  }
  if (valor.length < min) {
    mostrarErro(campo, `Mínimo de ${min} caracteres.`);
    return false;
  }
  if (valor.length > max) {
    mostrarErro(campo, `Máximo de ${max} caracteres.`);
    return false;
  }
  return true;
}

function validarSelect(id) {
  const campo = document.getElementById(id);
  const valor = campo.value;

  if (!valor || valor.startsWith('Selecione')) {
    mostrarErro(campo, 'Selecione uma opção válida.');
    return false;
  }
  return true;
}

function validarPrazo(id) {
  const campo = document.getElementById(id);
  const valor = campo.value;

  // Prazo é opcional, só valida se preenchido
  if (!valor) return true;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(valor + 'T00:00:00');

  if (data < hoje) {
    mostrarErro(campo, 'O prazo não pode ser uma data no passado.');
    return false;
  }
  return true;
}

function mostrarErro(campo, mensagem) {
  const erro = document.createElement('span');
  erro.className = 'erro-campo';
  erro.textContent = mensagem;
  campo.classList.add('campo-invalido');
  campo.insertAdjacentElement('afterend', erro);
}

function limparErros() {
  document.querySelectorAll('.erro-campo').forEach(e => e.remove());
  document.querySelectorAll('.campo-invalido').forEach(e => e.classList.remove('campo-invalido'));
}