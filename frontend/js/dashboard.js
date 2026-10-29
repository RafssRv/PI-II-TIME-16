// Autor: Vinícius Panutti - 25007329
// Descrição: Pesquisa e filtros da tabela "Demandas próximas do prazo" no dashboard.

/**
 * Lê o texto digitado no campo de busca e aplica o filtro da tabela.
 * Se o campo estiver vazio, não restringe por texto (todas as linhas voltam a aparecer,
 * respeitando apenas os filtros de status/prioridade, se existirem).
 */
function pesquisarDemanda() {
    aplicarFiltrosTabela();
}

/**
 * Cria, uma única vez, os selects de Status e Prioridade dentro do card da tabela.
 * Cliques seguintes no botão não duplicam os campos. Ao mudar um select, a tabela é filtrada.
 */
function adicionarFiltro() {
    if (document.getElementById('filtros-ativos')) {
        return;
    }

    const card = document.getElementById('card-demandas-prazo');
    const titulo = card.querySelector('h5');

    const container = document.createElement('div');
    container.id = 'filtros-ativos';
    container.className = 'filtros-ativos';

    const selectStatus = criarSelectFiltro(
        'filtro-status',
        [
            { valor: '', texto: 'Todos os status' },
            { valor: 'Aberta', texto: 'Aberta' },
            { valor: 'Em andamento', texto: 'Em andamento' },
            { valor: 'Em revisão', texto: 'Em revisão' },
            { valor: 'Concluída', texto: 'Concluída' },
            { valor: 'Cancelada', texto: 'Cancelada' }
        ]
    );

    const selectPrioridade = criarSelectFiltro(
        'filtro-prioridade',
        [
            { valor: '', texto: 'Todas as prioridades' },
            { valor: 'Crítica', texto: 'Crítica' },
            { valor: 'Alta', texto: 'Alta' },
            { valor: 'Média', texto: 'Média' },
            { valor: 'Baixa', texto: 'Baixa' }
        ]
    );

    container.appendChild(selectStatus);
    container.appendChild(selectPrioridade);
    titulo.insertAdjacentElement('afterend', container);
}

/**
 * Monta um <select> com as opções informadas e dispara o filtro da tabela ao mudar o valor.
 */
function criarSelectFiltro(id, opcoes) {
    const select = document.createElement('select');
    select.id = id;
    select.className = 'form-select-custom';
    select.addEventListener('change', aplicarFiltrosTabela);

    opcoes.forEach(function (opcao) {
        const option = document.createElement('option');
        option.value = opcao.valor;
        option.textContent = opcao.texto;
        select.appendChild(option);
    });

    return select;
}

/**
 * Percorre as linhas da tabela e aplica busca (título ou responsável) e filtros de status/prioridade.
 * Linhas que não correspondem recebem display: none. Sem resultados, exibe mensagem discreta.
 */
function aplicarFiltrosTabela() {
    const campoBusca = document.getElementById('campo-busca');
    const termo = campoBusca ? campoBusca.value.trim().toLowerCase() : '';
    const statusSelecionado = obterValorSelect('filtro-status');
    const prioridadeSelecionada = obterValorSelect('filtro-prioridade');

    const linhas = document.querySelectorAll('#tabela-demandas tbody tr');
    let visiveis = 0;

    linhas.forEach(function (linha) {
        const colunas = linha.querySelectorAll('td');
        const titulo = (colunas[0] && colunas[0].textContent || '').trim().toLowerCase();
        const responsavel = (colunas[2] && colunas[2].textContent || '').trim().toLowerCase();
        const prioridade = (colunas[3] && colunas[3].textContent || '').trim();
        const status = (colunas[4] && colunas[4].textContent || '').trim();

        const correspondeBusca = termo === '' || titulo.includes(termo) || responsavel.includes(termo);
        const correspondeStatus = statusSelecionado === '' || status === statusSelecionado;
        const correspondePrioridade = prioridadeSelecionada === '' || prioridade === prioridadeSelecionada;

        const deveExibir = correspondeBusca && correspondeStatus && correspondePrioridade;
        linha.style.display = deveExibir ? '' : 'none';

        if (deveExibir) {
            visiveis += 1;
        }
    });

    atualizarMensagemVazio(visiveis === 0);
}

/**
 * Devolve o valor do select, ou string vazia se o filtro ainda não foi criado / está em "todos".
 */
function obterValorSelect(id) {
    const select = document.getElementById(id);
    return select ? select.value : '';
}

/**
 * Mostra ou esconde o aviso "Nenhuma demanda encontrada" quando o filtro não retorna linhas.
 */
function atualizarMensagemVazio(semResultados) {
    const mensagem = document.getElementById('mensagem-sem-resultados');
    if (!mensagem) {
        return;
    }
    mensagem.hidden = !semResultados;
}
