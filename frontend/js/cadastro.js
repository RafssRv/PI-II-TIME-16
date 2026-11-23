/*
Autor: Rafael Roveri Pires - RA: 24007131
Tela: Cadastro de Demandas

Descrição: 
Prepara o formulário de nova demanda, buscando os projetos disponíveis e os responsáveis de cada equipe. 
Confere os dados preenchidos, apresenta os erros junto aos campos e envia o cadastro ao servidor, abrindo os detalhes após a criação
*/

// Guarda os dados da pessoa autenticada
let user = null;

// Guarda os elementos principais do formulário
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

// Organiza os campos que podem receber mensagens de erro
const camposComErro = [campoTitulo, campoDescricao, selectProjeto, campoTipo, selectResponsavel, campoPrioridade, campoPrazo];

// Organiza os elementos usados para mostrar cada mensagem
const mensagensDeErro = [
  document.querySelector('#erro-titulo'), document.querySelector('#erro-descricao'),
  document.querySelector('#erro-projeto'), document.querySelector('#erro-tipo'),
  document.querySelector('#erro-responsavel'), document.querySelector('#erro-prioridade'),
  document.querySelector('#erro-prazo')
];

// Controla consultas antigas de responsáveis
let consultaResponsaveis = 0;

// Indica quando os responsáveis estão sendo carregados
let carregandoResponsaveis = false;

// Indica quando uma demanda está sendo enviada
let enviandoDemanda = false;

// Impede o envio antes da sessão e das opções serem carregadas
btnSubmit.disabled = true;
selectResponsavel.disabled = true;

// Volta para a listagem ao cancelar o cadastro
if (btnCancelar) {
  btnCancelar.addEventListener('click', () => {
    window.location.href = 'listagemDemandas.html';
  });
}

// Aguarda o HTML carregar e inicia a página de cadastro
document.addEventListener('DOMContentLoaded', async function () {

  // Confere a sessão do usuário
  user = await exigirUsuario();
  if (!user) return;

  // Impede que membros acessem o cadastro
  if (user.perfil === 'MEMBRO') {
    window.location.replace('listagemDemandas.html');
    form.hidden = true;
    return;
  }

  try {
    // Busca os projetos ativos disponíveis
    const projetos = await api('/projetos');

    // Preenche o campo de projeto sem permitir opções inativas
    preencherSelect('projeto', projetos.filter((item) => item.ativo), 'Selecione um projeto...');
    
    // Libera o formulário após carregar os projetos
    btnSubmit.disabled = false;
  } catch (error) {
    // Mostra o erro geral da consulta
    exibirAlertaGeral(error.message);
  }
});

// Atualiza os responsáveis quando o projeto selecionado muda
selectProjeto.addEventListener('change', async function () {

  // Identifica esta consulta de equipe
  const consulta = ++consultaResponsaveis;
  const projetoId = selectProjeto.value;

  // Remove opções anteriores e aguarda novos responsáveis
  preencherSelect('responsavel', [], 'Sem responsável definido');
  selectResponsavel.disabled = true;
  selectProjeto.classList.remove('is-invalid');
  document.querySelector('#erro-projeto').innerText = '';
  selectResponsavel.classList.remove('is-invalid');
  document.querySelector('#erro-responsavel').innerText = '';
  carregandoResponsaveis = false;
  btnSubmit.disabled = enviandoDemanda;

  // Interrompe caso nenhum projeto tenha sido escolhido
  if (!projetoId || !user) return;

  // Bloqueia o envio enquanto busca a equipe
  carregandoResponsaveis = true;
  btnSubmit.disabled = true;

  try {
    // Busca os membros vinculados ao projeto escolhido
    const membros = await api(`/projetos/${projetoId}/membros`);

    // Ignora respostas antigas de uma escolha anterior
    if (consulta !== consultaResponsaveis) return;

    // Preenche o campo de responsável com a equipe atual
    preencherSelect('responsavel', membros, 'Sem responsável definido');
    selectResponsavel.disabled = false;
  } catch (error) {

    // Ignora erros de consultas que já não são mais atuais
    if (consulta !== consultaResponsaveis) return;

    // Cancela o projeto escolhido quando não foi possível buscar a equipe
    selectProjeto.value = '';
    mostrarErro(selectProjeto, document.querySelector('#erro-projeto'), `Não foi possível carregar os responsáveis. Selecione o projeto novamente. ${error.message}`);
  } finally {
    // Libera o envio somente para a consulta que ainda é atual
    if (consulta === consultaResponsaveis) {
      carregandoResponsaveis = false;
      btnSubmit.disabled = enviandoDemanda;
    }
  }
});

form.addEventListener('submit', async function (event) {

  // Impede o navegador de recarregar a página
  event.preventDefault();

  // Interrompe o cadastro sem autorização ou enquanto uma solicitação está ativa
  if (!user || user.perfil === 'MEMBRO' || btnSubmit.disabled || enviandoDemanda) return;

  // Limpa mensagens anteriores antes da nova validação
  limparErros();
  esconderAlertaGeral();

  // Remove espaços extras e obtém os valores escolhidos
  const titulo = campoTitulo.value.trim();
  const descricao = campoDescricao.value.trim();
  const projetoId = Number(selectProjeto.value);
  const tipo = campoTipo.value;
  const prioridade = campoPrioridade.value;
  const responsavel = selectResponsavel.value;

  // Começa considerando que o formulário está válido
  let formularioValido = true;

  // Valida o título da demanda
  if (titulo === '') {
    mostrarErro(campoTitulo, document.querySelector('#erro-titulo'), 'O título é obrigatório.');
    formularioValido = false;
  } else if (titulo.length < 3 || titulo.length > 100) {
    mostrarErro(campoTitulo, document.querySelector('#erro-titulo'), 'O título deve ter entre 3 e 100 caracteres.');
    formularioValido = false;
  }

  // Valida a descrição da demanda
  if (descricao === '') {
    mostrarErro(campoDescricao, document.querySelector('#erro-descricao'), 'A descrição é obrigatória.');
    formularioValido = false;
  } else if (descricao.length < 10 || descricao.length > 1000) {
    mostrarErro(campoDescricao, document.querySelector('#erro-descricao'), 'A descrição deve ter entre 10 e 1000 caracteres.');
    formularioValido = false;
  }

  // Valida o projeto selecionado
  if (!Number.isInteger(projetoId) || projetoId < 1) {
    mostrarErro(selectProjeto, document.querySelector('#erro-projeto'), 'Selecione um projeto válido.');
    formularioValido = false;
  }

  // Valida o tipo da demanda
  if (tipo !== 'TAREFA' && tipo !== 'DEFEITO' && tipo !== 'MELHORIA' && tipo !== 'DOCUMENTACAO') {
    mostrarErro(campoTipo, document.querySelector('#erro-tipo'), 'Selecione Tarefa, Defeito, Melhoria ou Documentação.');
    formularioValido = false;
  }

  // Valida a prioridade da demanda
  if (prioridade !== 'CRITICA' && prioridade !== 'ALTA' && prioridade !== 'MEDIA' && prioridade !== 'BAIXA') {
    mostrarErro(campoPrioridade, document.querySelector('#erro-prioridade'), 'Selecione Crítica, Alta, Média ou Baixa.');
    formularioValido = false;
  }

  // Valida o responsável quando ele foi informado
  if (responsavel !== '' && (!Number.isInteger(Number(responsavel)) || Number(responsavel) < 1)) {
    mostrarErro(selectResponsavel, document.querySelector('#erro-responsavel'), 'Selecione um responsável válido ou deixe sem responsável.');
    formularioValido = false;
  }

  // Valida o prazo antes de enviar
  if (!validarPrazo()) formularioValido = false;

  // Interrompe o cadastro se alguma validação falhar
  if (!formularioValido) return;

  // Organiza os dados válidos no formato recebido pela API
  const demanda = {
    projeto_id: projetoId,
    responsavel_id: responsavel === '' ? null : Number(responsavel),
    titulo,
    descricao,
    tipo,
    prioridade,
    prazo: campoPrazo.value || null
  };

  // Indica que o cadastro está em andamento
  enviandoDemanda = true;
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Criando...';

  try {
    // Envia os dados da nova demanda ao servidor
    const result = await api('/demandas', {
      method: 'POST',
      body: JSON.stringify(demanda)
    });

    // Abre os detalhes da demanda recém-criada
    window.location.href = `detalhes.html?id=${result.id}`;
  } catch (error) {

    // Destaca o campo de prazo quando o erro estiver relacionado a ele
    if (error.message.toLowerCase().includes('feriado') || error.message.toLowerCase().includes('prazo')) {
      mostrarErro(campoPrazo, document.querySelector('#erro-prazo'), error.message);
    } else {
      // Exibe outros erros em uma mensagem geral
      exibirAlertaGeral(error.message);
    }
  } finally {

    // Reativa o formulário após a conclusão da solicitação
    enviandoDemanda = false;
    btnSubmit.disabled = carregandoResponsaveis;
    btnSubmit.textContent = 'Criar demanda';
  }
});

// Preenche um campo select com uma opção vazia e os itens disponíveis
function preencherSelect(id, items, placeholder) {
  const select = document.querySelector(`#${id}`);
  select.replaceChildren(new Option(placeholder, ''));
  items.forEach((item) => select.add(new Option(item.nome, item.id)));
}

// Valida o prazo opcional antes do cadastro
function validarPrazo() {

  // Obtém o valor e o elemento usado pela mensagem
  const valor = campoPrazo.value;
  const erro = document.querySelector('#erro-prazo');

  // Rejeita formatos inválidos ou datas parcialmente digitadas
  if (campoPrazo.validity.badInput || (valor !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(valor))) {
    mostrarErro(campoPrazo, erro, 'Informe uma data válida.');
    return false;
  }

  // Considera válido deixar o prazo vazio
  if (valor === '') return true;

  // Separa ano, mês e dia recebidos
  const partes = valor.split('-');
  const prazo = new Date(`${valor}T00:00:00`);

  // Confere se os dados correspondem a uma data real
  if (prazo.getFullYear() !== Number(partes[0]) || prazo.getMonth() + 1 !== Number(partes[1]) || prazo.getDate() !== Number(partes[2])) {
    mostrarErro(campoPrazo, erro, 'Informe uma data válida.');
    return false;
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Impede escolher uma data anterior a hoje
  if (prazo < hoje) {
    mostrarErro(campoPrazo, erro, 'O prazo não pode estar no passado.');
    return false;
  }
  return true;
}

// Marca um campo como inválido e mostra sua mensagem
function mostrarErro(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

// Remove os erros anteriores antes de validar novamente
function limparErros() {

  // Remove o destaque dos campos
  camposComErro.forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });
  
  // Apaga todas as mensagens dos campos
  mensagensDeErro.forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
}

// Exibe uma mensagem geral no topo do formulário
function exibirAlertaGeral(mensagem) {
  if (!alertaErro) return;
  alertaErro.textContent = mensagem;
  alertaErro.style.display = 'block';
  alertaErro.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Esconde e limpa a mensagem geral do formulário
function esconderAlertaGeral() {
  if (!alertaErro) return;
  alertaErro.style.display = 'none';
  alertaErro.textContent = '';
}
