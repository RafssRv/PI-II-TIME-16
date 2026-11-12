// Autor: Rafael Roveri Pires - RA: 24007131
// Descrição: Valida todos os campos antes de criar uma demanda, seguindo o fluxo da Aula 05.
// Carrega projetos e responsáveis pela API e apresenta também os erros enviados pelo servidor.

let user = null;
const form = document.querySelector('#form-demanda');
const alertaErro = document.querySelector('#cadastro-alerta-erro');
const btnCancelar = document.querySelector('#btn-cancelar');
const selectProjeto = document.querySelector('#projeto');
const selectResponsavel = document.querySelector('#responsavel');
const campoTitulo = document.querySelector('#titulo');
const campoDescricao = document.querySelector('#descricao');
const campoTipo = document.querySelector('#tipo');
const campoPrioridade = document.querySelector('#prioridade');
const campoPrazo = document.querySelector('#prazo');
const btnSubmit = form.querySelector('[type="submit"]');
const camposComErro = [campoTitulo, campoDescricao, selectProjeto, campoTipo, selectResponsavel, campoPrioridade, campoPrazo];
const mensagensDeErro = [
  document.querySelector('#erro-titulo'), document.querySelector('#erro-descricao'),
  document.querySelector('#erro-projeto'), document.querySelector('#erro-tipo'),
  document.querySelector('#erro-responsavel'), document.querySelector('#erro-prioridade'),
  document.querySelector('#erro-prazo')
];
let consultaResponsaveis = 0;
let carregandoResponsaveis = false;
let enviandoDemanda = false;

// Aguarda a sessão e os projetos antes de permitir o cadastro.
btnSubmit.disabled = true;
selectResponsavel.disabled = true;

if (btnCancelar) {
  btnCancelar.addEventListener('click', () => {
    window.location.href = 'listagemDemandas.html';
  });
}

document.addEventListener('DOMContentLoaded', async function () {
  user = await exigirUsuario();
  if (!user) return;
  if (user.perfil === 'MEMBRO') {
    window.location.replace('listagemDemandas.html');
    form.hidden = true;
    return;
  }
  try {
    const projetos = await api('/projetos');
    preencherSelect('projeto', projetos.filter((item) => item.ativo), 'Selecione um projeto...');
    btnSubmit.disabled = false;
  } catch (error) {
    exibirAlertaGeral(error.message);
  }
});

// Limpa o responsável anterior e só libera o envio depois de carregar a nova equipe.
selectProjeto.addEventListener('change', async function () {
  const consulta = ++consultaResponsaveis;
  const projetoId = selectProjeto.value;
  preencherSelect('responsavel', [], 'Sem responsável definido');
  selectResponsavel.disabled = true;
  selectProjeto.classList.remove('is-invalid');
  document.querySelector('#erro-projeto').innerText = '';
  selectResponsavel.classList.remove('is-invalid');
  document.querySelector('#erro-responsavel').innerText = '';
  carregandoResponsaveis = false;
  btnSubmit.disabled = enviandoDemanda;
  if (!projetoId || !user) return;

  carregandoResponsaveis = true;
  btnSubmit.disabled = true;
  try {
    const membros = await api(`/projetos/${projetoId}/membros`);
    // Uma resposta antiga não pode preencher a equipe de outro projeto.
    if (consulta !== consultaResponsaveis) return;
    preencherSelect('responsavel', membros, 'Sem responsável definido');
    selectResponsavel.disabled = false;
  } catch (error) {
    if (consulta !== consultaResponsaveis) return;
    selectProjeto.value = '';
    mostrarErro(selectProjeto, document.querySelector('#erro-projeto'), `Não foi possível carregar os responsáveis. Selecione o projeto novamente. ${error.message}`);
  } finally {
    if (consulta === consultaResponsaveis) {
      carregandoResponsaveis = false;
      btnSubmit.disabled = enviandoDemanda;
    }
  }
});

form.addEventListener('submit', async function (event) {
  event.preventDefault();
  if (!user || user.perfil === 'MEMBRO' || btnSubmit.disabled || enviandoDemanda) return;

  limparErros();
  esconderAlertaGeral();

  const titulo = campoTitulo.value.trim();
  const descricao = campoDescricao.value.trim();
  const projetoId = Number(selectProjeto.value);
  const tipo = campoTipo.value;
  const prioridade = campoPrioridade.value;
  const responsavel = selectResponsavel.value;
  let formularioValido = true;

  // Confere cada campo sem interromper a apresentação dos outros erros.
  if (titulo === '') {
    mostrarErro(campoTitulo, document.querySelector('#erro-titulo'), 'O título é obrigatório.');
    formularioValido = false;
  } else if (titulo.length < 3 || titulo.length > 100) {
    mostrarErro(campoTitulo, document.querySelector('#erro-titulo'), 'O título deve ter entre 3 e 100 caracteres.');
    formularioValido = false;
  }

  if (descricao === '') {
    mostrarErro(campoDescricao, document.querySelector('#erro-descricao'), 'A descrição é obrigatória.');
    formularioValido = false;
  } else if (descricao.length < 10 || descricao.length > 1000) {
    mostrarErro(campoDescricao, document.querySelector('#erro-descricao'), 'A descrição deve ter entre 10 e 1000 caracteres.');
    formularioValido = false;
  }

  if (!Number.isInteger(projetoId) || projetoId < 1) {
    mostrarErro(selectProjeto, document.querySelector('#erro-projeto'), 'Selecione um projeto válido.');
    formularioValido = false;
  }

  if (tipo !== 'TAREFA' && tipo !== 'DEFEITO' && tipo !== 'MELHORIA' && tipo !== 'DOCUMENTACAO') {
    mostrarErro(campoTipo, document.querySelector('#erro-tipo'), 'Selecione Tarefa, Defeito, Melhoria ou Documentação.');
    formularioValido = false;
  }

  if (prioridade !== 'CRITICA' && prioridade !== 'ALTA' && prioridade !== 'MEDIA' && prioridade !== 'BAIXA') {
    mostrarErro(campoPrioridade, document.querySelector('#erro-prioridade'), 'Selecione Crítica, Alta, Média ou Baixa.');
    formularioValido = false;
  }

  if (responsavel !== '' && (!Number.isInteger(Number(responsavel)) || Number(responsavel) < 1)) {
    mostrarErro(selectResponsavel, document.querySelector('#erro-responsavel'), 'Selecione um responsável válido ou deixe sem responsável.');
    formularioValido = false;
  }

  if (!validarPrazo()) formularioValido = false;
  if (!formularioValido) return;

  // Somente os dados válidos viram um objeto e são enviados como JSON.
  const demanda = {
    projeto_id: projetoId,
    responsavel_id: responsavel === '' ? null : Number(responsavel),
    titulo,
    descricao,
    tipo,
    prioridade,
    prazo: campoPrazo.value || null
  };
  enviandoDemanda = true;
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Criando...';

  try {
    const result = await api('/demandas', {
      method: 'POST',
      body: JSON.stringify(demanda)
    });
    window.location.href = `detalhes.html?id=${result.id}`;
  } catch (error) {
    // Se o erro for de feriado nacional ou prazo, destaca o campo de prazo
    if (error.message.toLowerCase().includes('feriado') || error.message.toLowerCase().includes('prazo')) {
      mostrarErro(campoPrazo, document.querySelector('#erro-prazo'), error.message);
    } else {
      exibirAlertaGeral(error.message);
    }
  } finally {
    enviandoDemanda = false;
    btnSubmit.disabled = carregandoResponsaveis;
    btnSubmit.textContent = 'Criar demanda';
  }
});

function preencherSelect(id, items, placeholder) {
  const select = document.querySelector(`#${id}`);
  select.replaceChildren(new Option(placeholder, ''));
  items.forEach((item) => select.add(new Option(item.nome, item.id)));
}

// O prazo é opcional; quando preenchido, precisa ser uma data real a partir de hoje.
function validarPrazo() {
  const valor = campoPrazo.value;
  const erro = document.querySelector('#erro-prazo');
  if (campoPrazo.validity.badInput || (valor !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(valor))) {
    mostrarErro(campoPrazo, erro, 'Informe uma data válida.');
    return false;
  }
  if (valor === '') return true;

  const partes = valor.split('-');
  const prazo = new Date(`${valor}T00:00:00`);
  if (prazo.getFullYear() !== Number(partes[0]) || prazo.getMonth() + 1 !== Number(partes[1]) || prazo.getDate() !== Number(partes[2])) {
    mostrarErro(campoPrazo, erro, 'Informe uma data válida.');
    return false;
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (prazo < hoje) {
    mostrarErro(campoPrazo, erro, 'O prazo não pode estar no passado.');
    return false;
  }
  return true;
}

// Usa os espaços de mensagem que já existem no HTML, como no Exemplo 03 da Aula 05.
function mostrarErro(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

function limparErros() {
  camposComErro.forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });
  mensagensDeErro.forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
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
