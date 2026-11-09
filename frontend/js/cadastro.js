// Autor: Rafael Roveri Pires - RA: 24007131
// Descrição: Script de validação e criação de demandas, preenchimento dinâmico de projetos/membros e tratamento de feriados nacionais.

const user = exigirUsuario();
const form = document.querySelector('#form-demanda');
const alertaErro = document.querySelector('#cadastro-alerta-erro');
const btnCancelar = document.querySelector('#btn-cancelar');
const selectProjeto = document.querySelector('#projeto');
const selectResponsavel = document.querySelector('#responsavel');

if (user?.perfil === 'MEMBRO') {
  window.location.replace('listagemDemandas.html');
  if (form) form.hidden = true;
}

if (btnCancelar) {
  btnCancelar.addEventListener('click', () => {
    window.location.href = 'listagemDemandas.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (user?.perfil === 'MEMBRO') return;
  try {
    const projetos = await api('/projetos');
    preencherSelect('projeto', projetos.filter((item) => item.ativo), 'Selecione um projeto...');

    // Ao mudar o projeto, carrega os membros da equipe daquele projeto
    selectProjeto.addEventListener('change', async () => {
      const projetoId = selectProjeto.value;
      if (!projetoId) {
        selectResponsavel.replaceChildren(new Option('Sem responsável definido', ''));
        return;
      }
      try {
        const membros = await api(`/projetos/${projetoId}/membros`);
        preencherSelect('responsavel', membros, 'Sem responsável definido');
      } catch (err) {
        console.warn('Erro ao carregar membros do projeto:', err);
      }
    });
  } catch (error) {
    exibirAlertaGeral(error.message);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (user?.perfil === 'MEMBRO') return;

  limparErros();
  esconderAlertaGeral();

  const valido = [
    validarTexto('titulo', 3, 100),
    validarTexto('descricao', 10, 1000),
    validarSelect('projeto'),
    validarSelect('tipo'),
    validarSelect('prioridade'),
    validarPrazo('prazo')
  ].every(Boolean);

  if (!valido) return;

  const btnSubmit = form.querySelector('[type="submit"]');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Criando...';

  try {
    const result = await api('/demandas', {
      method: 'POST',
      body: JSON.stringify({
        projeto_id: Number(selectProjeto.value),
        responsavel_id: Number(selectResponsavel.value) || null,
        titulo: document.querySelector('#titulo').value.trim(),
        descricao: document.querySelector('#descricao').value.trim(),
        tipo: document.querySelector('#tipo').value,
        prioridade: document.querySelector('#prioridade').value,
        prazo: document.querySelector('#prazo').value || null
      })
    });
    window.location.href = `detalhes.html?id=${result.id}`;
  } catch (error) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Criar demanda';

    // Se o erro for de feriado nacional ou prazo, destaca o campo de prazo
    if (error.message.toLowerCase().includes('feriado') || error.message.toLowerCase().includes('prazo')) {
      const campoPrazo = document.querySelector('#prazo');
      mostrarErro(campoPrazo, error.message);
    } else {
      exibirAlertaGeral(error.message);
    }
  }
});

function preencherSelect(id, items, placeholder) {
  const select = document.querySelector(`#${id}`);
  select.replaceChildren(new Option(placeholder, ''));
  items.forEach((item) => select.add(new Option(item.nome, item.id)));
}

function validarTexto(id, min, max) {
  const campo = document.getElementById(id);
  const valor = campo.value.trim();
  if (valor.length < min || valor.length > max) {
    mostrarErro(campo, `Informe entre ${min} e ${max} caracteres.`);
    return false;
  }
  return true;
}

function validarSelect(id) {
  const campo = document.getElementById(id);
  if (!campo.value) {
    mostrarErro(campo, 'Selecione uma opção válida.');
    return false;
  }
  return true;
}

function validarPrazo(id) {
  const campo = document.getElementById(id);
  if (!campo.value) return true;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (new Date(`${campo.value}T00:00:00`) < hoje) {
    mostrarErro(campo, 'O prazo não pode estar no passado.');
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
  document.querySelectorAll('.erro-campo').forEach((item) => item.remove());
  document.querySelectorAll('.campo-invalido').forEach((item) => item.classList.remove('campo-invalido'));
}

function exibirAlertaGeral(mensagem) {
  if (!alertaErro) return;
  alertaErro.textContent = mensagem;
  alertaErro.style.display = 'block';
  alertaErro.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function esconderAlertaGeral() {
  if (!alertaErro) return;
  alertaErro.style.display = 'none';
  alertaErro.textContent = '';
}
