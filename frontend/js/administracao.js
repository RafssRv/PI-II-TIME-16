/*
Autora: Priscila Amorim - RA: 24787350
Tela: Controla a área administrativa de projetos e usuários

Descrição: 
Carrega os projetos, as equipes e os usuários para consulta na área administrativa. Controla as pesquisas, os filtros
e o formulário de criação de projetos, além de permitir sua desativação sem apagar as demandas associadas
*/

// Guarda os dados do usuário que acessa esta página
let usuarioAdmin = null;

// Converte os códigos de perfil em nomes apresentados ao usuário
const rotulosPerfil = { 
  ADMIN: 'Administrador', 
  LIDER: 'Líder de Projeto', 
  MEMBRO: 'Membro da Equipe' 
};

// Guarda os dados já carregados para aplicar os filtros sem novas consultas
let linhasProjetos = [];
let linhasUsuarios = [];
let consultaAdministracao = 0;
let criandoProjeto = false;
const projetosEmDesativacao = new Set();
const dialogoProjeto = document.querySelector('#dialog-projeto');
const formularioProjeto = document.querySelector('#form-projeto');

// Aguarda o HTML carregar e inicia a página administrativa
document.addEventListener('DOMContentLoaded', async () => {

  // Confere a sessão do usuário atual
  usuarioAdmin = await exigirUsuario();
  if (!usuarioAdmin) return;

  // Envia usuários sem perfil administrador para o dashboard
  if (usuarioAdmin.perfil !== 'ADMIN') {
    window.location.replace('dashboard.html');
    return;
  }

  // Libera o cadastro e inicia o carregamento dos dados
  if (usuarioAdmin?.perfil === 'ADMIN') {
    document.querySelector('#btn-novo-projeto').hidden = false;
    carregarAdministracao();
  }
});

// Consulta os dados usados pelas tabelas e pelos indicadores
async function carregarAdministracao() {

  // Identifica a consulta atual para ignorar respostas antigas
  const consulta = ++consultaAdministracao;
  const erro = document.querySelector('#admin-erro');
  const carregando = document.querySelector('#admin-carregando');
  erro.hidden = true;
  carregando.hidden = false;

  try {
    // Busca projetos, usuários e demandas ao mesmo tempo
    const [projetos, usuarios, demandas] = await Promise.all([
      api('/projetos?incluir_inativos=1'), api('/usuarios'), api('/demandas')
    ]);

    // Busca as equipes de todos os projetos ao mesmo tempo
    const equipes = await Promise.all(projetos.map((projeto) => api(`/projetos/${projeto.id}/membros`)));
    
    // Ignora o resultado quando uma consulta mais nova já começou
    if (consulta !== consultaAdministracao) return;

    // Junta projeto, equipe e contagem de demandas em uma lista
    linhasProjetos = projetos.map((projeto, indice) => {
      const doProjeto = demandas.filter((demanda) => demanda.projeto_id === projeto.id);
      return {
        projeto,
        equipe: equipes[indice],
        total: doProjeto.length,
        emAberto: doProjeto.filter((demanda) => !['CONCLUIDA', 'CANCELADA'].includes(demanda.status)).length
      };
    });

    // Associa cada usuário aos projetos em que participa
    linhasUsuarios = usuarios.map((usuario) => ({
      usuario,
      projetos: linhasProjetos
        .filter((linha) => linha.equipe.some((membro) => membro.id === usuario.id))
        .map((linha) => linha.projeto.nome)
    }));

    // Atualiza os indicadores e desenha as tabelas
    preencherResumo(projetos, usuarios);
    renderizarProjetos();
    renderizarUsuarios();

    carregando.hidden = true;
    // Exibe os cartões após concluir o carregamento
    for (const id of ['resumo', 'card-projetos', 'card-usuarios']) document.getElementById(id).hidden = false;
  } catch (error) {
    // Ignora erros de consultas que já foram substituídas
    if (consulta !== consultaAdministracao) return;
    carregando.hidden = true;

    // Exibe a mensagem recebida pela API
    erro.textContent = `Não foi possível carregar os dados: ${error.message}`;
    erro.hidden = false;
  }
}

// Atualiza os totais exibidos no topo da página
function preencherResumo(projetos, usuarios) {

  // Seleciona somente os usuários ativos
  const ativos = usuarios.filter((usuario) => usuario.ativo);

  // Conta projetos ativos, usuários ativos e perfis ativos
  document.querySelector('#resumo-projetos').textContent = projetos.filter((projeto) => Number(projeto.ativo) === 1).length;
  document.querySelector('#resumo-usuarios').textContent = ativos.length;
  document.querySelector('#resumo-lideres').textContent = ativos.filter((usuario) => usuario.perfil === 'LIDER').length;
  document.querySelector('#resumo-membros').textContent = ativos.filter((usuario) => usuario.perfil === 'MEMBRO').length;
}

// Monta a tabela de projetos com os filtros escolhidos
function renderizarProjetos() {

  // Obtém o texto digitado e a situação selecionada
  const termo = normalizarTexto(document.querySelector('#busca-projetos').value);
  const situacao = document.querySelector('#filtro-situacao-projeto').value;
  const corpo = document.querySelector('#tabela-projetos tbody');

  // Seleciona somente os projetos que correspondem aos filtros
  const visiveis = linhasProjetos.filter(({ projeto, equipe }) => {
    const ativo = Number(projeto.ativo) === 1;
    const correspondeSituacao = situacao === 'todos' || (situacao === 'ativos' ? ativo : !ativo);
    return correspondeSituacao && (!termo || normalizarTexto([projeto.nome, projeto.descricao, ...equipe.map((membro) => membro.nome)].join(' ')).includes(termo));
  });

  // Cria uma linha da tabela para cada projeto visível
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

    // Permite desativar somente projetos que ainda estão ativos
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
      // Mostra um traço quando não existe ação disponível
      acoes.textContent = '—';
    }
    linha.append(acoes);
    return linha;
  }));

  // Exibe uma mensagem quando nenhum projeto corresponder
  document.querySelector('#sem-projetos').hidden = visiveis.length > 0;
}

// Abre o formulário usado para cadastrar um projeto
function abrirCadastroProjeto() {

  // Impede abrir o formulário sem permissão ou durante o cadastro
  if (usuarioAdmin?.perfil !== 'ADMIN' || criandoProjeto) return;
  formularioProjeto.reset();
  limparErrosProjeto();
  dialogoProjeto.showModal();
  document.querySelector('#projeto-nome').focus();
}

// Fecha o formulário quando não houver um cadastro em andamento
function fecharCadastroProjeto() {
  if (!criandoProjeto) dialogoProjeto.close();
}

// Exibe uma mensagem geral enviada pela API
function mostrarErroProjeto(mensagem) {
  const erro = document.querySelector('#projeto-erro');
  erro.textContent = mensagem;
  erro.hidden = false;
}

// Marca um campo e escreve sua mensagem de validação
function mostrarErroCampoProjeto(campo, elementoErro, mensagem) {
  campo.classList.add('is-invalid');
  elementoErro.innerText = mensagem;
}

// Remove marcações e mensagens de tentativas anteriores
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

// Exibe uma mensagem de sucesso na página administrativa
function mostrarSucessoAdministracao(mensagem) {
  const sucesso = document.querySelector('#admin-sucesso');
  sucesso.textContent = mensagem;
  sucesso.hidden = false;
}

async function criarProjeto(event) {
  // Impede o recarregamento automático do formulário
  event.preventDefault();

  // Interrompe o cadastro sem permissão ou durante outro envio
  if (usuarioAdmin?.perfil !== 'ADMIN' || criandoProjeto) return;

  // Limpa mensagens antigas antes da nova validação
  limparErrosProjeto();
  const campoNome = document.querySelector('#projeto-nome');
  const campoDescricao = document.querySelector('#projeto-descricao');
  const nome = campoNome.value.trim();
  const descricao = campoDescricao.value.trim();

  // Começa considerando que o formulário está válido
  let formularioValido = true;

  // Exige o preenchimento do nome
  if (nome === '') {
    mostrarErroCampoProjeto(campoNome, document.querySelector('#erro-projeto-nome'), 'O nome do projeto é obrigatório.');
    formularioValido = false;

  // Valida o tamanho permitido do nome
  } else if (nome.length < 2 || nome.length > 100) {
    mostrarErroCampoProjeto(campoNome, document.querySelector('#erro-projeto-nome'), 'O nome deve ter entre 2 e 100 caracteres.');
    formularioValido = false;
  }

  // Valida a descrição quando ela tiver sido preenchida
  if (descricao.length > 1000) {
    mostrarErroCampoProjeto(campoDescricao, document.querySelector('#erro-projeto-descricao'), 'A descrição deve ter no máximo 1000 caracteres.');
    formularioValido = false;
  }

  // Interrompe o envio caso alguma validação falhe
  if (!formularioValido) return;

  // Prepara os dados que serão enviados ao backend
  const projeto = { nome, descricao: descricao || null };

  // Bloqueia o formulário enquanto o projeto é criado
  criandoProjeto = true;
  document.querySelector('#projeto-erro').hidden = true;
  document.querySelector('#admin-sucesso').hidden = true;
  const campos = ['projeto-nome', 'projeto-descricao', 'salvar-projeto', 'cancelar-projeto', 'fechar-projeto'];
  
  // Desativa os campos e botões durante o envio
  campos.forEach((id) => { document.getElementById(id).disabled = true; });
  document.querySelector('#salvar-projeto').textContent = 'Criando...';
  
  try {
    // Envia os dados do novo projeto à API
    await api('/projetos', { method: 'POST', body: JSON.stringify(projeto) });
    
    // Fecha o formulário e limpa os filtros locais
    dialogoProjeto.close();
    document.querySelector('#busca-projetos').value = '';
    document.querySelector('#filtro-situacao-projeto').value = 'todos';
    
    // Recarrega os dados atualizados da administração
    await carregarAdministracao();
    
    // Confirma a criação ao usuário
    mostrarSucessoAdministracao(`Projeto "${nome}" criado com sucesso.`);
  } catch (error) {
    // Mostra o erro devolvido pela API
    mostrarErroProjeto(error.message);
  } finally {
    // Libera o formulário após a tentativa terminar
    criandoProjeto = false;
    campos.forEach((id) => { document.getElementById(id).disabled = false; });
    document.querySelector('#salvar-projeto').textContent = 'Criar projeto';
  }
}

// Desativa um projeto sem apagar seus registros relacionados
async function desativarProjeto(projeto) {
  // Impede desativar projetos inativos ou iniciar duas solicitações
  if (usuarioAdmin?.perfil !== 'ADMIN' || Number(projeto.ativo) !== 1 || projetosEmDesativacao.has(projeto.id)) return;
  
  // Solicita confirmação antes de desativar
  if (!confirm(`Desativar o projeto "${projeto.nome}"? Ele deixará de aceitar novas demandas. As demandas existentes, comentários e históricos serão preservados.`)) return;
  
  // Marca o projeto como desativação em andamento
  projetosEmDesativacao.add(projeto.id);
  document.querySelector('#admin-sucesso').hidden = true;
  document.querySelector('#admin-erro').hidden = true;
  renderizarProjetos();
  
  try {
    // Solicita ao backend que desative o projeto
    await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
    
    // Atualiza o estado local e recarrega os dados
    projeto.ativo = 0;
    await carregarAdministracao();
    
    // Confirma que os registros existentes foram preservados
    mostrarSucessoAdministracao(`Projeto "${projeto.nome}" desativado. As demandas e o histórico foram preservados.`);
  } catch (error) {
    // Exibe o erro da desativação
    const erro = document.querySelector('#admin-erro');
    erro.textContent = error.message;
    erro.hidden = false;
  } finally {
    // Remove o projeto da lista de operações em andamento
    projetosEmDesativacao.delete(projeto.id);
    renderizarProjetos();
  }
}

// Desenha a tabela de usuários aplicando perfil e texto pesquisado
function renderizarUsuarios() {
  
  // Obtém os valores dos filtros de usuário
  const termo = normalizarTexto(document.querySelector('#busca-usuarios').value);
  const perfil = document.querySelector('#filtro-perfil').value;
  const corpo = document.querySelector('#tabela-usuarios tbody');
 
  // Seleciona usuários que correspondem ao perfil e à busca
  const visiveis = linhasUsuarios.filter(({ usuario }) =>
    (!perfil || usuario.perfil === perfil) &&
    (!termo || normalizarTexto(`${usuario.nome} ${usuario.email}`).includes(termo)));

  // Cria uma linha para cada usuário visível
  corpo.replaceChildren(...visiveis.map(({ usuario, projetos }) => {
    const linha = document.createElement('tr');
   
    // Administradores possuem acesso a todos os projetos
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
  // Exibe uma mensagem quando nenhum usuário corresponder
  document.querySelector('#sem-usuarios').hidden = visiveis.length > 0;
}

// Atualiza as tabelas quando os filtros são usados
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

// Cria uma célula simples da tabela
function celula(texto, classe) {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.textContent = texto;
  return td;
}

// Cria uma célula contendo uma etiqueta colorida
function celulaBadge(texto, classe) {
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge-custom ${classe}`;
  badge.textContent = texto;
  td.append(badge);
  return td;
}

// Cria uma célula com uma ou várias etiquetas
function celulaEtiquetas(itens, textoVazio) {
  const td = document.createElement('td');

  // Exibe a mensagem vazia quando não houver etiquetas
  if (!itens.length) {
    td.className = 'celula-secundaria';
    td.textContent = textoVazio;
    return td;
  }

  // Agrupa todas as etiquetas em um único elemento
  const grupo = document.createElement('div');
  grupo.className = 'etiquetas';
  for (const item of itens) {

    // Cria uma etiqueta para cada projeto ou integrante
    const etiqueta = document.createElement('span');
    etiqueta.className = item.destaque ? 'etiqueta lider' : 'etiqueta';
    etiqueta.textContent = item.texto;
    if (item.titulo) etiqueta.title = item.titulo;
    grupo.append(etiqueta);
  }
  
  // Insere o grupo de etiquetas na célula
  td.append(grupo);
  return td;
}

// Remove acentos e transforma o texto em minúsculas para facilitar a busca
function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
