/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Compartilhado entre as telas internas (sessão do usuário)
  - Identifica o usuário conectado e adapta o menu ás permissões da conta 

Descrição: 
Consulta a sessão no servidor e apresenta o nome e o perfil do usuário no menu lateral. Ajusta os atalhos conforme
o perfil e controla o botão Sair, encerrando a sessão e retornando à página de login
*/

// Guarda os dados da sessão até a página confirmar o usuário
let usuarioAtual = null;

// Consulta a sessão e atualiza as informações do menu lateral
async function carregarSessao() {

  // Busca os dados do usuário no servidor
  usuarioAtual = await buscarSessaoApi();

  // Escreve uma saudação com o nome do usuário
  document.getElementById('saudacaoUsuario').textContent = `Olá, ${usuarioAtual.nome}!`;

  // Mostra o perfil do usuário no menu lateral
  document.getElementById('perfilUsuario').textContent = usuarioAtual.perfil;

  // Liga o botão Sair à função que encerra a sessão
  document.getElementById('btn-sair').addEventListener('click', encerrarSessao);

  // Procura o link usado para cadastrar demandas
  const novaDemanda = document.querySelector('.sidebar-menu a[href="cadastro.html"]');

  // Esconde o cadastro de demandas para membros da equipe
  if (novaDemanda) {
    novaDemanda.hidden = usuarioAtual.perfil === 'MEMBRO';
    if (usuarioAtual.perfil === 'MEMBRO') novaDemanda.style.display = 'none';
  }

  // Procura o link usado para abrir a área de projetos
  const projetos = document.querySelector('.sidebar-menu a[href$="projetos.html"]');

  // Direciona administradores para a página que reúne projetos e usuários
  if (projetos && usuarioAtual.perfil === 'ADMIN') {
    projetos.setAttribute('href', 'administracao.html');
    projetos.textContent = 'Projetos e usuários';
  }
  return usuarioAtual;
}

// Exige uma sessão válida antes de continuar
async function exigirUsuario() {

  try {
    // Retorna os dados do usuário autenticado
    return await carregarSessao();
    
  } catch (erro) {
    // Exibe um alerta somente para erros diferentes de sessão inválida
    if (erro.status !== 401) alert(erro.message);
    return null;
  }
}

// Encerra a sessão atual
async function encerrarSessao() {

  try {
    // Solicita ao servidor que faça o logout
    await sairApi();

    // Redireciona o usuário para a tela de login
    window.location.replace('login.html');

  } catch (erro) {
    // Exibe um alerta somente para erros diferentes de sessão inválida
    if (erro.status !== 401) alert(erro.message);
  }
}

// Confere a sessão quando o navegador restaura uma página da memória
window.addEventListener('pageshow', function (evento) {

  // Recarrega a página restaurada para consultar novamente a sessão
  if (evento.persisted) window.location.reload();
});
