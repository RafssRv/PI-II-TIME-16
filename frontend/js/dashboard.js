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

// Carrega indicadores persistidos e conserva os filtros locais da tabela.
async function carregarDashboard() {
    const erro = document.getElementById('dashboard-erro');
    const carregando = document.getElementById('dashboard-carregando');
    erro.hidden = true;
    carregando.hidden = false;
    try {
        const dados = await api('/dashboard');
        const metricas = [
            dados.totalDemandas,
            dados.quantidadesPorStatus.EM_ANDAMENTO,
            dados.quantidadesPorStatus.CONCLUIDA,
            dados.demandasCriticasEmAberto.length
        ];
        document.querySelectorAll('.metric-card .value').forEach((elemento, indice) => { elemento.textContent = metricas[indice]; });
        const grupos = [
            ['status', dados.quantidadesPorStatus],
            ['prioridade', dados.quantidadesPorPrioridade],
            ['tipo', dados.quantidadesPorTipo]
        ];
        document.querySelectorAll('.row')[1].querySelectorAll('.content-card').forEach((card, index) => {
            const contagens = Object.values(grupos[index][1]);
            card.querySelectorAll('.count').forEach((elemento, indice) => { elemento.textContent = contagens[indice]; });
        });
        const lista = document.getElementById('demandas-criticas');
        lista.replaceChildren(...dados.demandasCriticasEmAberto.map((demanda) => {
            const item = document.createElement('li'); item.append(linkDemanda(demanda)); return item;
        }));
        if (!lista.children.length) { const item = document.createElement('li'); item.textContent = 'Nenhuma demanda crítica em aberto.'; lista.append(item); }
        const corpo = document.querySelector('#tabela-demandas tbody');
        corpo.replaceChildren(...dados.demandasProximasDoPrazo.map((demanda) => {
            const linha = document.createElement('tr');
            const titulo = document.createElement('td'); titulo.append(linkDemanda(demanda)); linha.append(titulo);
            for (const valor of [demanda.projeto_nome, demanda.responsavel_nome || 'Não definido', rotulos[demanda.prioridade], rotulos[demanda.status], dataDashboard(demanda.prazo)]) {
                const coluna = document.createElement('td'); coluna.textContent = valor; linha.append(coluna);
            }
            return linha;
        }));
        aplicarFiltrosTabela();
    } catch (error) {
        erro.textContent = error.message; erro.hidden = false;
    } finally {
        carregando.hidden = true;
    }
}
function linkDemanda(demanda) {
    const link = document.createElement('a');
    link.href = `detalhes.html?id=${demanda.id}`; link.textContent = demanda.titulo; return link;
}
function dataDashboard(value) {
    return value ? value.split('-').reverse().join('/') : 'Não definido';
}
if (exigirUsuario()) document.addEventListener('DOMContentLoaded', carregarDashboard);
