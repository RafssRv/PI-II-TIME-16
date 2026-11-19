/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Compartilhado entre as telas internas (sessão do usuário)

Descrição: 
Consulta a sessão no servidor e apresenta o nome e o perfil do usuário no menu lateral. Ajusta os atalhos conforme
o perfil e controla o botão Sair, encerrando a sessão e retornando à página de login
*/

// Cria uma variável para guardar os dados do usuário conectado, começando vazialet usuarioAtual = null
let usuarioAtual = null;

// Consulta os dados do usuário conectado e atualiza as informações do menu lateral
async function carregarSessao() {

  // Busca os dados do usuário no servidor
  usuarioAtual = await buscarSessaoApi();

  // Mostra uma saudação com o nome do usuário conectado
  // textContent altera o texto exibido
  document.getElementById('saudacaoUsuario').textContent = `Olá, ${usuarioAtual.nome}!`;

  // Mostra no menu lateral o perfil do usuário conectado
  document.getElementById('perfilUsuario').textContent = usuarioAtual.perfil;

  // Faz o botão Sair chamar a função que encerra a sessão quando for clicado
  document.getElementById('btn-sair').addEventListener('click', encerrarSessao);

  // Ajusta o menu de acordo com o perfil do usuário
  // Esconder um atalho organiza a tela; a autorização das operações também é conferida no servidor

  // Procura no menu lateral o link que leva à página de cadastro de demandas
  const novaDemanda = document.querySelector('.sidebar-menu a[href="cadastro.html"]');

  // Se o link existir
  if (novaDemanda) {

    // // Esconde o link de criar demanda se o usuário for membro
    novaDemanda.hidden = usuarioAtual.perfil === 'MEMBRO';

    // Garante que o link não apareça nem ocupe espaço no menu para membros
    if (usuarioAtual.perfil === 'MEMBRO') novaDemanda.style.display = 'none';
  }

  // Procura no menu lateral o link que leva à página de projetos
  const projetos = document.querySelector('.sidebar-menu a[href$="projetos.html"]');

  // Se o link existir e o usuário for administrador, altera o atalho
  if (projetos && usuarioAtual.perfil === 'ADMIN') {

    // Altera o endereço do link para a página de administração
    projetos.setAttribute('href', 'administracao.html');

    // Atualiza o texto visível do atalho para indicar o conteúdo dessa página
    projetos.textContent = 'Projetos e usuários';
  }

  return usuarioAtual;
}

// Tenta buscar os dados do usuário conectado 
async function exigirUsuario() {

  try {

    // Espera carregar os dados do usuário e devolve o resultado
    return await carregarSessao();
  } catch (erro) {

    // Mostra uma mensagem se ocorrer um erro diferente de 401
    if (erro.status !== 401) alert(erro.message);
    return null;
  }
}

// Encerra a sessão quando o usuário clica no botão Sair
async function encerrarSessao() {

  try {

    // Solicita ao servidor que encerre a sessão do usuário
    await sairApi();

    // Encaminha o usuário para a página de login
    window.location.replace('login.html');
  } catch (erro) {

    // Mostra uma mensagem caso ocorra um erro diferente de 401
    if (erro.status !== 401) alert(erro.message);
  }
}

// Verifica se a página foi restaurada da memória do navegador
window.addEventListener('pageshow', function (evento) {

  // Se foi restaurada, recarrega a página para consultar a sessão novamente
  if (evento.persisted) window.location.reload();
});
