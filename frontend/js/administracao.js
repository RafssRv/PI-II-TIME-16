// Autor: Priscila Amorim
// Descrição: Tela de consulta de projetos (com equipe e contagem de demandas) e de usuários. 
// Somente leitura: usa os endpoints GET já existentes da API.
// Todo texto vindo da API é inserido com textContent, nunca como HTML.

const usuarioAdmin = exigirUsuario();

if (usuarioAdmin && usuarioAdmin.perfil !== 'ADMIN') {
  window.location.replace('dashboard.html');
}

// Nomes dos perfis como aparecem no documento do projeto.
const rotulosPerfil = { ADMIN: 'Administrador', LIDER: 'Líder de Projeto', MEMBRO: 'Membro da Equipe' };

// Dados já carregados, mantidos em memória para os filtros não precisarem chamar a API de novo.
let linhasProjetos = [];
let linhasUsuarios = [];

document.addEventListener('DOMContentLoaded', () => {
  if (usuarioAdmin?.perfil === 'ADMIN') carregarAdministracao();
});

// Busca projetos, usuários, demandas e a equipe de cada projeto, e monta as duas tabelas.
async function carregarAdministracao() {
  const erro = document.querySelector('#admin-erro');
  const carregando = document.querySelector('#admin-carregando');
  try {
    const [projetos, usuarios, demandas] = await Promise.all([
      api('/projetos'), api('/usuarios'), api('/demandas')
    ]);
    // A equipe é uma consulta por projeto; em paralelo, pois são poucos projetos.
    const equipes = await Promise.all(projetos.map((projeto) => api(`/projetos/${projeto.id}/membros`)));

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
    carregando.hidden = true;
    erro.textContent = `Não foi possível carregar os dados: ${error.message}`;
    erro.hidden = false;
  }
}

// Totais do topo da página (somente usuários ativos entram na contagem).
function preencherResumo(projetos, usuarios) {
  const ativos = usuarios.filter((usuario) => usuario.ativo);
  document.querySelector('#resumo-projetos').textContent = projetos.length;
  document.querySelector('#resumo-usuarios').textContent = ativos.length;
  document.querySelector('#resumo-lideres').textContent = ativos.filter((usuario) => usuario.perfil === 'LIDER').length;
  document.querySelector('#resumo-membros').textContent = ativos.filter((usuario) => usuario.perfil === 'MEMBRO').length;
}

// Desenha a tabela de projetos já aplicando a busca digitada (projeto, descrição ou membro).
function renderizarProjetos() {
  const termo = normalizarTexto(document.querySelector('#busca-projetos').value);
  const corpo = document.querySelector('#tabela-projetos tbody');
  const visiveis = linhasProjetos.filter(({ projeto, equipe }) =>
    !termo || normalizarTexto([projeto.nome, projeto.descricao, ...equipe.map((membro) => membro.nome)].join(' ')).includes(termo));

  corpo.replaceChildren(...visiveis.map(({ projeto, equipe, total, emAberto }) => {
    const linha = document.createElement('tr');
    linha.append(
      celula(projeto.nome, 'celula-nome'),
      celula(projeto.descricao || '—', 'celula-secundaria'),
      celulaEtiquetas(equipe.map((membro) => ({
        texto: membro.nome, destaque: membro.perfil === 'LIDER', titulo: rotulosPerfil[membro.perfil]
      })), 'Sem equipe vinculada'),
      celula(`${total} no total · ${emAberto} em aberto`)
    );
    return linha;
  }));
  document.querySelector('#sem-projetos').hidden = visiveis.length > 0;
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
