// Consulta os projetos e as equipes vinculadas ao usuário autenticado.

const usuarioProjetos = exigirUsuario();

if (usuarioProjetos?.perfil === 'ADMIN') {
    window.location.replace('administracao.html');
}

if (usuarioProjetos?.perfil === 'MEMBRO') {
    document.addEventListener('DOMContentLoaded', () => {
        const linkNovaDemanda = document.querySelector('#link-nova-demanda');
        if (linkNovaDemanda) linkNovaDemanda.hidden = true;
    });
}

let projetosCarregados = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!usuarioProjetos || usuarioProjetos.perfil === 'ADMIN') return;

    document.querySelector('#busca-projetos')
        .addEventListener('input', renderizarProjetos);

    carregarProjetos();
});

async function carregarProjetos() {
    const carregando = document.querySelector('#projetos-carregando');
    const erro = document.querySelector('#projetos-erro');

    try {
        const projetos = await api('/projetos');

        const equipes = await Promise.all(
            projetos.map((projeto) => api(`/projetos/${projeto.id}/membros`))
        );

        projetosCarregados = projetos.map((projeto, indice) => ({
            projeto,
            equipe: equipes[indice]
        }));

        carregando.hidden = true;

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

    semResultado.hidden = visiveis.length > 0;
}

const rotulosPerfilProjeto = {
    ADMIN: 'Administrador',
    LIDER: 'Líder de Projeto',
    MEMBRO: 'Membro da Equipe'
};
