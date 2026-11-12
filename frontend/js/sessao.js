/*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Consulta a sessão no servidor antes de carregar as telas internas,
  apresenta o usuário e seu perfil e encerra a sessão pelo logout, conforme a Aula 11.
*/
let usuarioAtual = null;

async function carregarSessao() {
  usuarioAtual = await buscarSessaoApi();
  document.getElementById('saudacaoUsuario').textContent = `Olá, ${usuarioAtual.nome}!`;
  document.getElementById('perfilUsuario').textContent = usuarioAtual.perfil;
  document.getElementById('btn-sair').addEventListener('click', encerrarSessao);

  // A interface acompanha o perfil; as permissões também são verificadas no servidor.
  const novaDemanda = document.querySelector('.sidebar-menu a[href="cadastro.html"]');
  if (novaDemanda) {
    novaDemanda.hidden = usuarioAtual.perfil === 'MEMBRO';
    if (usuarioAtual.perfil === 'MEMBRO') novaDemanda.style.display = 'none';
  }

  const projetos = document.querySelector('.sidebar-menu a[href$="projetos.html"]');
  if (projetos && usuarioAtual.perfil === 'ADMIN') {
    projetos.setAttribute('href', 'administracao.html');
    projetos.textContent = 'Projetos e usuários';
  }
  return usuarioAtual;
}

async function exigirUsuario() {
  try {
    return await carregarSessao();
  } catch (erro) {
    if (erro.status !== 401) alert(erro.message);
    return null;
  }
}

async function encerrarSessao() {
  try {
    await sairApi();
    window.location.replace('login.html');
  } catch (erro) {
    if (erro.status !== 401) alert(erro.message);
  }
}

// Consulta novamente a página e a sessão ao voltar pelo histórico do navegador.
window.addEventListener('pageshow', function (evento) {
  if (evento.persisted) window.location.reload();
});
