/*
Autora: Priscila Amorim - RA: 24787350
Tela: Projetos (carrega e filtra os projetos que o usuário pode visualizar)

Descrição: 
Exibe os projetos vinculados ao usuário e os integrantes de cada equipe. A pesquisa considera o nome,
a descrição do projeto e os nomes dos membros. Também apresenta os avisos de carregamento, busca vazia e falha
*/

// Guarda os dados da pessoa conectada
let usuarioProjetos = null;

// Guarda os projetos e suas equipes depois que forem buscados
let projetosCarregados = [];

// Aguarda o HTML ser carregado e inicia a configuração da tela de projetos
document.addEventListener('DOMContentLoaded', async () => {

    // Confere a sessão e obtém os dados do usuário atual
    usuarioProjetos = await exigirUsuario();

    // Verifica se encontrou um usuário 
    if (!usuarioProjetos) return;

    // Redireciona o administrador para a página própria dele
    if (usuarioProjetos.perfil === 'ADMIN') {
        window.location.replace('administracao.html');
        return;
    }

    // Atualiza os cartões sempre que o texto da busca mudar
    document.querySelector('#busca-projetos')
        .addEventListener('input', renderizarProjetos);

    // Busca os projetos assim que a página estiver pronta
    carregarProjetos();
});

async function carregarProjetos() {

    // Recupera os elementos usados para mostrar carregamento e erros
    const carregando = document.querySelector('#projetos-carregando');
    const erro = document.querySelector('#projetos-erro');

    try {
        // Busca os projetos aos quais o usuário tem acesso
        const projetos = await api('/projetos');

        // Consulta a equipe de todos os projetos ao mesmo tempo
        const equipes = await Promise.all(
            projetos.map((projeto) => api(`/projetos/${projeto.id}/membros`))
        );

        // Associa cada projeto à sua equipe correspondente
        projetosCarregados = projetos.map((projeto, indice) => ({
            projeto,
            equipe: equipes[indice]
        }));

        // Esconde a mensagem de carregamento
        carregando.hidden = true;

        // Mostra o aviso caso o usuário não tenha nenhum projeto
        if (projetosCarregados.length === 0) {
            document.querySelector('#projetos-vazio').hidden = false;
            return;
        }

        // Desenha os projetos encontrados na tela
        renderizarProjetos();

    } catch (error) {
        // Esconde o carregamento e mostra o erro recebido pela API
        carregando.hidden = true;
        erro.textContent = `Não foi possível carregar os projetos: ${error.message}`;
        erro.hidden = false;
    }
}

function renderizarProjetos() {

    // Lê e padroniza o texto digitado na busca
    const termo = document.querySelector('#busca-projetos').value
        .trim()
        .toLocaleLowerCase('pt-BR');

    // Recupera a área dos cartões e a mensagem de nenhuma busca
    const lista = document.querySelector('#lista-projetos');
    const semResultado = document.querySelector('#projetos-sem-resultado');

    // Seleciona projetos cujo nome, descrição ou equipe contenham o texto
    const visiveis = projetosCarregados.filter(({ projeto, equipe }) => {
        const textoEquipe = equipe.map((membro) => membro.nome).join(' ');
        const texto = `${projeto.nome} ${projeto.descricao || ''} ${textoEquipe}`;
        return texto.toLocaleLowerCase('pt-BR').includes(termo);
    });

    // Remove os cartões anteriores antes de mostrar o novo resultado
    lista.replaceChildren();

    // Cria um cartão para cada projeto encontrado
    visiveis.forEach(({ projeto, equipe }) => {
        
        // Cria o elemento que representa o cartão do projeto
        const card = document.createElement('article');
        card.className = 'projeto-card';

        // Cria e preenche o título do projeto
        const titulo = document.createElement('h2');
        titulo.textContent = projeto.nome;

        // Cria e preenche a descrição do projeto
        const descricao = document.createElement('p');
        descricao.className = 'projeto-descricao';
        descricao.textContent = projeto.descricao || 'Este projeto não possui descrição.';

        // Cria o título da seção que lista os membros
        const equipeTitulo = document.createElement('h3');
        equipeTitulo.className = 'projeto-equipe-titulo';
        equipeTitulo.textContent = `Equipe (${equipe.length})`;

        // Cria o contêiner que receberá os integrantes da equipe
        const equipeContainer = document.createElement('div');
        equipeContainer.className = 'projeto-equipe';

        // Cria uma linha para cada integrante da equipe
        equipe.forEach((membro) => {
            const item = document.createElement('div');
            item.className = 'membro-equipe';

            // Mostra o nome do integrante
            const nome = document.createElement('span');
            nome.className = 'membro-nome';
            nome.textContent = membro.nome;

            // Traduz e mostra o perfil do integrante
            const perfil = document.createElement('span');
            perfil.className = 'membro-perfil';
            perfil.textContent = rotulosPerfilProjeto[membro.perfil] || membro.perfil;

            // Junta nome e perfil no item e insere na equipe
            item.append(nome, perfil);
            equipeContainer.appendChild(item);
        });

        // Junta todas as partes no cartão e o adiciona à lista
        card.append(titulo, descricao, equipeTitulo, equipeContainer);
        lista.appendChild(card);
    });

    // Exibe a mensagem quando a pesquisa não encontra resultados
    semResultado.hidden = visiveis.length > 0;
}

const rotulosPerfilProjeto = {
    ADMIN: 'Administrador',
    LIDER: 'Líder de Projeto',
    MEMBRO: 'Membro da Equipe'
};