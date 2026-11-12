// Autor: Vinícius Panutti - 25007329
// Descrição: Pesquisa e filtros fixos da tabela "Demandas próximas do prazo" no dashboard.

// Seleciona o formulário e os campos que já estão no HTML.
const formularioFiltros = document.querySelector('#filtros-ativos');
const campoBusca = document.querySelector('#campo-busca');
const filtroStatus = document.querySelector('#filtro-status');
const filtroPrioridade = document.querySelector('#filtro-prioridade');

// Pesquisa pela tecla Enter sem recarregar a página.
formularioFiltros.addEventListener('submit', function (event) {
    event.preventDefault();
    aplicarFiltrosTabela();
});

// Atualiza a tabela ao digitar ou mudar um dos filtros.
campoBusca.addEventListener('input', aplicarFiltrosTabela);
filtroStatus.addEventListener('change', aplicarFiltrosTabela);
filtroPrioridade.addEventListener('change', aplicarFiltrosTabela);

/**
 * Percorre as linhas da tabela e aplica busca (título ou responsável) e filtros de status/prioridade.
 * Linhas que não correspondem recebem display: none. Sem resultados, exibe mensagem discreta.
 */
function aplicarFiltrosTabela() {
    const termo = campoBusca.value.trim().toLowerCase();
    const statusSelecionado = filtroStatus.value;
    const prioridadeSelecionada = filtroPrioridade.value;

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
    link.className = 'link-demanda';
    link.href = `detalhes.html?id=${demanda.id}`; link.textContent = demanda.titulo; return link;
}
function dataDashboard(value) {
    return value ? value.split('-').reverse().join('/') : 'Não definido';
}
const usuarioDashboard = exigirUsuario();
if (usuarioDashboard?.perfil === 'MEMBRO') document.querySelector('.sidebar-menu a[href="cadastro.html"]').hidden = true;
if (usuarioDashboard) document.addEventListener('DOMContentLoaded', carregarDashboard);
