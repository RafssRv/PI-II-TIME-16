// Autor: Priscila Amorim
// Descrição: Cadastro e desativação de projetos, consulta de equipes, demandas e usuários.
// Projetos desativados permanecem disponíveis para consulta, sem apagar suas demandas.
// Todo texto vindo da API é inserido com textContent, nunca como HTML.
// O cadastro usa o fluxo de validação com mensagens junto aos campos.

let usuarioAdmin = null;

// Nomes dos perfis como aparecem no documento do projeto.
const rotulosPerfil = { ADMIN: 'Administrador', LIDER: 'Líder de Projeto', MEMBRO: 'Membro da Equipe' };

// Dados já carregados, mantidos em memória para os filtros não precisarem chamar a API de novo.
let linhasProjetos = [];
let linhasUsuarios = [];
let consultaAdministracao = 0;
let criandoProjeto = false;
const projetosEmDesativacao = new Set();
const dialogoProjeto = document.querySelector('#dialog-projeto');
const formularioProjeto = document.querySelector('#form-projeto');

document.addEventListener('DOMContentLoaded', async () => {
  usuarioAdmin = await exigirUsuario();
  if (!usuarioAdmin) return;
  if (usuarioAdmin.perfil !== 'ADMIN') {
    window.location.replace('dashboard.html');
    return;
  }
  if (usuarioAdmin?.perfil === 'ADMIN') {
    document.querySelector('#btn-novo-projeto').hidden = false;
    carregarAdministracao();
  }
});

// Busca projetos, usuários, demandas e a equipe de cada projeto, e monta as duas tabelas.
async function carregarAdministracao() {
  const consulta = ++consultaAdministracao;
  const erro = document.querySelector('#admin-erro');
  const carregando = document.querySelector('#admin-carregando');
  erro.hidden = true;
  carregando.hidden = false;
  try {
    const [projetos, usuarios, demandas] = await Promise.all([
      api('/projetos?incluir_inativos=1'), api('/usuarios'), api('/demandas')
    ]);
    // A equipe é uma consulta por projeto; em paralelo, pois são poucos projetos.
    const equipes = await Promise.all(projetos.map((projeto) => api(`/projetos/${projeto.id}/membros`)));
    if (consulta !== consultaAdministracao) return;

    // Cada projeto, com sua equipe e a contagem de demandas (total e ainda em aberto).
    linhasProjetos = projetos.map((projeto, indice) => {
      const doProjeto = demandas.filter((demanda) => demanda.projeto_id === projeto.id);
      return {
        projeto,
        equipe: equipes[indice],
        total: doProjeto.length,
        emAberto: doProjeto.filter((demanda) => !['CONCLUIDA', 'CANCELADA'].includes(demanda.status)).length
      };
    });

    // Cada usuário, com os nomes dos projetos em que está vinculado.
    linhasUsuarios = usuarios.map((usuario) => ({
      usuario,
      projetos: linhasProjetos
        .filter((linha) => linha.equipe.some((membro) => membro.id === usuario.id))
        .map((linha) => linha.projeto.nome)
    }));

    preencherResumo(projetos, usuarios);
    renderizarProjetos();
    renderizarUsuarios();

    carregando.hidden = true;
    for (const id of ['resumo', 'card-projetos', 'card-usuarios']) document.getElementById(id).hidden = false;
  } catch (error) {
    if (consulta !== consultaAdministracao) return;
    carregando.hidden = true;
    erro.textContent = `Não foi possível carregar os dados: ${error.message}`;
    erro.hidden = false;
  }
}

// Totais do topo da página (somente usuários ativos entram na contagem).
function preencherResumo(projetos, usuarios) {
  const ativos = usuarios.filter((usuario) => usuario.ativo);
  document.querySelector('#resumo-projetos').textContent = projetos.filter((projeto) => Number(projeto.ativo) === 1).length;
  document.querySelector('#resumo-usuarios').textContent = ativos.length;
  document.querySelector('#resumo-lideres').textContent = ativos.filter((usuario) => usuario.perfil === 'LIDER').length;
  document.querySelector('#resumo-membros').textContent = ativos.filter((usuario) => usuario.perfil === 'MEMBRO').length;
}

// Desenha a tabela de projetos já aplicando a busca digitada (projeto, descrição ou membro).
function renderizarProjetos() {
  const termo = normalizarTexto(document.querySelector('#busca-projetos').value);
  const situacao = document.querySelector('#filtro-situacao-projeto').value;
  const corpo = document.querySelector('#tabela-projetos tbody');
  const visiveis = linhasProjetos.filter(({ projeto, equipe }) => {
    const ativo = Number(projeto.ativo) === 1;
    const correspondeSituacao = situacao === 'todos' || (situacao === 'ativos' ? ativo : !ativo);
    return correspondeSituacao && (!termo || normalizarTexto([projeto.nome, projeto.descricao, ...equipe.map((membro) => membro.nome)].join(' ')).includes(termo));
  });

  corpo.replaceChildren(...visiveis.map(({ projeto, equipe, total, emAberto }) => {
    const linha = document.createElement('tr');
    linha.append(
      celula(projeto.nome, 'celula-nome'),
      celula(projeto.descricao || '—', 'celula-secundaria'),
      celulaEtiquetas(equipe.map((membro) => ({
        texto: membro.nome, destaque: membro.perfil === 'LIDER', titulo: rotulosPerfil[membro.perfil]
      })), 'Sem equipe vinculada'),
      celula(`${total} no total · ${emAberto} em aberto`),
      celulaBadge(Number(projeto.ativo) === 1 ? 'Ativo' : 'Inativo', Number(projeto.ativo) === 1 ? 'badge-ativo' : 'badge-inativo')
    );
    const acoes = celula('');
    if (Number(projeto.ativo) === 1) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'btn-danger-custom';
      botao.textContent = 'Desativar';
      botao.setAttribute('aria-label', `Desativar projeto ${projeto.nome}`);
      botao.disabled = projetosEmDesativacao.has(projeto.id);
      botao.addEventListener('click', () => desativarProjeto(projeto));
      acoes.append(botao);
    } else {
      acoes.textContent = '—';
    }
    linha.append(acoes);
    return linha;
  }));
  document.querySelector('#sem-projetos').hidden = visiveis.length > 0;
}

// Cria o projeto pela API e mantém erros de validação junto ao formulário.
function abrirCadastroProjeto() {
  if (usuarioAdmin?.perfil !== 'ADMIN' || criandoProjeto) return;
  formularioProjeto.reset();
  limparErrosProjeto();
  dialogoProjeto.showModal();
  document.querySelector('#projeto-nome').focus();
}

function fecharCadastroProjeto() {
  if (!criandoProjeto) dialogoProjeto.close();
}

function mostrarErroProjeto(mensagem) {
  const erro = document.querySelector('#projeto-erro');
  erro.textContent = mensagem;
  erro.hidden = false;
}

// Os espaços das mensagens ficam no HTML.
function mostrarErroCampoProjeto(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

function limparErrosProjeto() {
  formularioProjeto.querySelectorAll('.is-invalid').forEach(function (campo) {
    campo.classList.remove('is-invalid');
  });
  formularioProjeto.querySelectorAll('.erro-campo').forEach(function (elementoErro) {
    elementoErro.innerText = '';
  });
  document.querySelector('#projeto-erro').innerText = '';
  document.querySelector('#projeto-erro').hidden = true;
}

function mostrarSucessoAdministracao(mensagem) {
  const sucesso = document.querySelector('#admin-sucesso');
  sucesso.textContent = mensagem;
  sucesso.hidden = false;
}

async function criarProjeto(event) {
  event.preventDefault();
  if (usuarioAdmin?.perfil !== 'ADMIN' || criandoProjeto) return;
  limparErrosProjeto();
  const campoNome = document.querySelector('#projeto-nome');
  const campoDescricao = document.querySelector('#projeto-descricao');
  const nome = campoNome.value.trim();
  const descricao = campoDescricao.value.trim();
  let formularioValido = true;

  if (nome === '') {
    mostrarErroCampoProjeto(campoNome, document.querySelector('#erro-projeto-nome'), 'O nome do projeto é obrigatório.');
    formularioValido = false;
  } else if (nome.length < 2 || nome.length > 100) {
    mostrarErroCampoProjeto(campoNome, document.querySelector('#erro-projeto-nome'), 'O nome deve ter entre 2 e 100 caracteres.');
    formularioValido = false;
  }

  // A descrição permanece opcional, conforme a regra já utilizada pelo projeto.
  if (descricao.length > 1000) {
    mostrarErroCampoProjeto(campoDescricao, document.querySelector('#erro-projeto-descricao'), 'A descrição deve ter no máximo 1000 caracteres.');
    formularioValido = false;
  }
  if (!formularioValido) return;

  const projeto = { nome, descricao: descricao || null };
  criandoProjeto = true;
  document.querySelector('#projeto-erro').hidden = true;
  document.querySelector('#admin-sucesso').hidden = true;
  const campos = ['projeto-nome', 'projeto-descricao', 'salvar-projeto', 'cancelar-projeto', 'fechar-projeto'];
  campos.forEach((id) => { document.getElementById(id).disabled = true; });
  document.querySelector('#salvar-projeto').textContent = 'Criando...';
  try {
    await api('/projetos', { method: 'POST', body: JSON.stringify(projeto) });
    dialogoProjeto.close();
    document.querySelector('#busca-projetos').value = '';
    document.querySelector('#filtro-situacao-projeto').value = 'todos';
    await carregarAdministracao();
    mostrarSucessoAdministracao(`Projeto "${nome}" criado com sucesso.`);
  } catch (error) {
    mostrarErroProjeto(error.message);
  } finally {
    criandoProjeto = false;
    campos.forEach((id) => { document.getElementById(id).disabled = false; });
    document.querySelector('#salvar-projeto').textContent = 'Criar projeto';
  }
}

// DELETE desativa o projeto no backend; demandas, comentários e histórico são preservados.
async function desativarProjeto(projeto) {
  if (usuarioAdmin?.perfil !== 'ADMIN' || Number(projeto.ativo) !== 1 || projetosEmDesativacao.has(projeto.id)) return;
  if (!confirm(`Desativar o projeto "${projeto.nome}"? Ele deixará de aceitar novas demandas. As demandas existentes, comentários e históricos serão preservados.`)) return;
  projetosEmDesativacao.add(projeto.id);
  document.querySelector('#admin-sucesso').hidden = true;
  document.querySelector('#admin-erro').hidden = true;
  renderizarProjetos();
  try {
    await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
    projeto.ativo = 0;
    await carregarAdministracao();
    mostrarSucessoAdministracao(`Projeto "${projeto.nome}" desativado. As demandas e o histórico foram preservados.`);
  } catch (error) {
    const erro = document.querySelector('#admin-erro');
    erro.textContent = error.message;
    erro.hidden = false;
  } finally {
    projetosEmDesativacao.delete(projeto.id);
    renderizarProjetos();
  }
}

// Desenha a tabela de usuários já aplicando o filtro de perfil e a busca (nome ou e-mail).
function renderizarUsuarios() {
  const termo = normalizarTexto(document.querySelector('#busca-usuarios').value);
  const perfil = document.querySelector('#filtro-perfil').value;
  const corpo = document.querySelector('#tabela-usuarios tbody');
  const visiveis = linhasUsuarios.filter(({ usuario }) =>
    (!perfil || usuario.perfil === perfil) &&
    (!termo || normalizarTexto(`${usuario.nome} ${usuario.email}`).includes(termo)));

  corpo.replaceChildren(...visiveis.map(({ usuario, projetos }) => {
    const linha = document.createElement('tr');
    // O Administrador enxerga todos os projetos, por isso não precisa de vínculo.
    const celulaProjetos = usuario.perfil === 'ADMIN'
      ? celula('Acesso a todos os projetos', 'celula-secundaria')
      : celulaEtiquetas(projetos.map((nome) => ({ texto: nome })), 'Nenhum projeto vinculado');
    linha.append(
      celula(usuario.nome, 'celula-nome'),
      celula(usuario.email, 'celula-secundaria'),
      celulaBadge(rotulosPerfil[usuario.perfil] || usuario.perfil, `badge-perfil-${usuario.perfil.toLowerCase()}`),
      celulaBadge(usuario.ativo ? 'Ativo' : 'Inativo', usuario.ativo ? 'badge-ativo' : 'badge-inativo'),
      celulaProjetos
    );
    return linha;
  }));
  document.querySelector('#sem-usuarios').hidden = visiveis.length > 0;
}

// Os filtros reagem enquanto a pessoa digita ou muda a seleção.
document.querySelector('#busca-projetos').addEventListener('input', renderizarProjetos);
document.querySelector('#filtro-situacao-projeto').addEventListener('change', renderizarProjetos);
document.querySelector('#btn-novo-projeto').addEventListener('click', abrirCadastroProjeto);
document.querySelector('#fechar-projeto').addEventListener('click', fecharCadastroProjeto);
document.querySelector('#cancelar-projeto').addEventListener('click', fecharCadastroProjeto);
formularioProjeto.addEventListener('submit', criarProjeto);
dialogoProjeto.addEventListener('cancel', (event) => {
  if (criandoProjeto) event.preventDefault();
});
document.querySelector('#busca-usuarios').addEventListener('input', renderizarUsuarios);
document.querySelector('#filtro-perfil').addEventListener('change', renderizarUsuarios);

// --- Funções auxiliares para montar células sem usar innerHTML ---

function celula(texto, classe) {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.textContent = texto;
  return td;
}

function celulaBadge(texto, classe) {
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge-custom ${classe}`;
  badge.textContent = texto;
  td.append(badge);
  return td;
}

function celulaEtiquetas(itens, textoVazio) {
  const td = document.createElement('td');
  if (!itens.length) {
    td.className = 'celula-secundaria';
    td.textContent = textoVazio;
    return td;
  }
  const grupo = document.createElement('div');
  grupo.className = 'etiquetas';
  for (const item of itens) {
    const etiqueta = document.createElement('span');
    etiqueta.className = item.destaque ? 'etiqueta lider' : 'etiqueta';
    etiqueta.textContent = item.texto;
    if (item.titulo) etiqueta.title = item.titulo;
    grupo.append(etiqueta);
  }
  td.append(grupo);
  return td;
}

// Remove acentos e ignora maiúsculas para a busca ("lider" encontra "Líder").
function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
