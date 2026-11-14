/*
Autor: Priscila Amorim
Tela: Projetos
Descrição: Responsável por consultar e exibir os projetos vinculados
ao usuário autenticado, incluindo os integrantes e seus respectivos
perfis. Implementa a pesquisa de projetos por nome, descrição ou
membros da equipe, além do controle de acesso conforme o perfil
do usuário e do tratamento de carregamento, resultados vazios e erros.
*/

// Usuário logado nesta tela.
let usuarioProjetos = null;

// Projetos já carregados (cada um com sua equipe), guardados para a busca não chamar a API de novo.
let projetosCarregados = [];

// Ao carregar a página: confirma a sessão, redireciona o Administrador para a tela dele,
// liga a busca e carrega os projetos.
document.addEventListener('DOMContentLoaded', async () => {
    usuarioProjetos = await exigirUsuario();
    if (!usuarioProjetos) return;
    // O Administrador usa a tela completa (administracao.html).
    if (usuarioProjetos.perfil === 'ADMIN') {
        window.location.replace('administracao.html');
        return;
    }

    document.querySelector('#busca-projetos')
        .addEventListener('input', renderizarProjetos);

    carregarProjetos();
});

// Busca na API os projetos do usuário e a equipe de cada um, e depois desenha os cartões.
// A própria API já devolve só os projetos aos quais o usuário está vinculado.
async function carregarProjetos() {
    const carregando = document.querySelector('#projetos-carregando');
    const erro = document.querySelector('#projetos-erro');

    try {
        const projetos = await api('/projetos');

        // A equipe é uma consulta por projeto; elas rodam em paralelo.
        const equipes = await Promise.all(
            projetos.map((projeto) => api(`/projetos/${projeto.id}/membros`))
        );

        projetosCarregados = projetos.map((projeto, indice) => ({
            projeto,
            equipe: equipes[indice]
        }));

        carregando.hidden = true;

        // Sem nenhum vínculo, mostra o aviso e não desenha nada.
        if (projetosCarregados.length === 0) {
            document.querySelector('#projetos-vazio').hidden = false;
            return;
        }

        renderizarProjetos();
    } catch (error) {
        carregando.hidden = true;
        erro.textContent = `Não foi possível carregar os projetos: ${error.message}`;
        erro.hidden = false;
    }
}

// Desenha um cartão por projeto, já aplicando o texto digitado na busca
// (nome, descrição ou nome de algum integrante). Usa textContent, nunca HTML.
function renderizarProjetos() {
    const termo = document.querySelector('#busca-projetos').value
        .trim()
        .toLocaleLowerCase('pt-BR');

    const lista = document.querySelector('#lista-projetos');
    const semResultado = document.querySelector('#projetos-sem-resultado');

    const visiveis = projetosCarregados.filter(({ projeto, equipe }) => {
        const textoEquipe = equipe.map((membro) => membro.nome).join(' ');
        const texto = `${projeto.nome} ${projeto.descricao || ''} ${textoEquipe}`;
        return texto.toLocaleLowerCase('pt-BR').includes(termo);
    });

    lista.replaceChildren();

    visiveis.forEach(({ projeto, equipe }) => {
        const card = document.createElement('article');
        card.className = 'projeto-card';

        const titulo = document.createElement('h2');
        titulo.textContent = projeto.nome;

        const descricao = document.createElement('p');
        descricao.className = 'projeto-descricao';
        descricao.textContent = projeto.descricao || 'Este projeto não possui descrição.';

        const equipeTitulo = document.createElement('h3');
        equipeTitulo.className = 'projeto-equipe-titulo';
        equipeTitulo.textContent = `Equipe (${equipe.length})`;

        // Lista dos integrantes, cada um com nome e perfil.
        const equipeContainer = document.createElement('div');
        equipeContainer.className = 'projeto-equipe';

        equipe.forEach((membro) => {
            const item = document.createElement('div');
            item.className = 'membro-equipe';

            const nome = document.createElement('span');
            nome.className = 'membro-nome';
            nome.textContent = membro.nome;

            const perfil = document.createElement('span');
            perfil.className = 'membro-perfil';
            perfil.textContent = rotulosPerfilProjeto[membro.perfil] || membro.perfil;

            item.append(nome, perfil);
            equipeContainer.appendChild(item);
        });

        card.append(titulo, descricao, equipeTitulo, equipeContainer);
        lista.appendChild(card);
    });

    // Mostra a mensagem quando a busca não encontra nenhum projeto.
    semResultado.hidden = visiveis.length > 0;
}

// Nomes dos perfis como aparecem no documento do projeto.
const rotulosPerfilProjeto = {
    ADMIN: 'Administrador',
    LIDER: 'Líder de Projeto',
    MEMBRO: 'Membro da Equipe'
};