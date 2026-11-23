/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Dashboard
    - Transforma os dados da API em indicadores e tabelas visuais para acompanhar o andamento das demandas
    
Descrição: 
Busca os dados do painel e preenche os indicadores, os resumos e as listas de demandas críticas e próximas do prazo.
Na tabela, permite pesquisar por título ou responsável e combinar os filtros de status e prioridade
*/

// Guarda os elementos usados pelos filtros da tabela
const formularioFiltros = document.querySelector('#filtros-ativos');
const campoBusca = document.querySelector('#campo-busca');
const filtroStatus = document.querySelector('#filtro-status');
const filtroPrioridade = document.querySelector('#filtro-prioridade');

// Impede o recarregamento ao enviar o formulário
formularioFiltros.addEventListener('submit', function (event) {
    event.preventDefault();
    aplicarFiltrosTabela();
});

// Atualiza os resultados ao digitar ou alterar os filtros
campoBusca.addEventListener('input', aplicarFiltrosTabela);
filtroStatus.addEventListener('change', aplicarFiltrosTabela);
filtroPrioridade.addEventListener('change', aplicarFiltrosTabela);

// Percorre a tabela e mostra somente as linhas que correspondem aos filtros
function aplicarFiltrosTabela() {

    // Obtém o texto e os filtros escolhidos
    const termo = campoBusca.value.trim().toLowerCase();
    const statusSelecionado = filtroStatus.value;
    const prioridadeSelecionada = filtroPrioridade.value;

    // Recupera todas as linhas da tabela
    const linhas = document.querySelectorAll('#tabela-demandas tbody tr');

    // Conta quantas linhas continuam visíveis
    let visiveis = 0;

    // Examina cada linha da tabela
    linhas.forEach(function (linha) {

        // Recupera as células usadas pela busca e pelos filtros
        const colunas = linha.querySelectorAll('td');
        const titulo = (colunas[0] && colunas[0].textContent || '').trim().toLowerCase();
        const responsavel = (colunas[2] && colunas[2].textContent || '').trim().toLowerCase();
        const prioridade = (colunas[3] && colunas[3].textContent || '').trim();
        const status = (colunas[4] && colunas[4].textContent || '').trim();

        // Confere se a busca corresponde ao título ou ao responsável
        const correspondeBusca = termo === '' || titulo.includes(termo) || responsavel.includes(termo);
        
        // Confere se o status corresponde ao filtro selecionado
        const correspondeStatus = statusSelecionado === '' || status === statusSelecionado;
        
        // Confere se a prioridade corresponde ao filtro selecionado
        const correspondePrioridade = prioridadeSelecionada === '' || prioridade === prioridadeSelecionada;

        // Mostra a linha somente quando todos os filtros forem atendidos
        const deveExibir = correspondeBusca && correspondeStatus && correspondePrioridade;
        linha.style.display = deveExibir ? '' : 'none';

        // Soma a linha ao total de resultados visíveis
        if (deveExibir) {
            visiveis += 1;
        }
    });

    // Atualiza a mensagem exibida quando não houver resultados
    atualizarMensagemVazio(visiveis === 0);
}

// Mostra ou esconde o aviso de nenhuma demanda encontrada
function atualizarMensagemVazio(semResultados) {

    // Localiza o elemento reservado à mensagem
    const mensagem = document.getElementById('mensagem-sem-resultados');
    if (!mensagem) {
        return;
    }

    // Exibe a mensagem somente quando não existir linha visível
    mensagem.hidden = !semResultados;
}

// Busca os indicadores do dashboard e preenche os elementos da página
async function carregarDashboard() {

    // Recupera os elementos usados pelas mensagens de carregamento e erro
    const erro = document.getElementById('dashboard-erro');
    const carregando = document.getElementById('dashboard-carregando');
    erro.hidden = true;
    carregando.hidden = false;

    try {
        // Consulta os dados resumidos da API
        const dados = await api('/dashboard');

        // Organiza os principais indicadores em uma lista
        const metricas = [
            dados.totalDemandas,
            dados.quantidadesPorStatus.EM_ANDAMENTO,
            dados.quantidadesPorStatus.CONCLUIDA,
            dados.demandasCriticasEmAberto.length
        ];

        // Exibe cada métrica no cartão correspondente
        document.querySelectorAll('.metric-card .value').forEach((elemento, indice) => { elemento.textContent = metricas[indice]; });
       
        // Relaciona os grupos de contagem às áreas da página
        const grupos = [
            ['status', dados.quantidadesPorStatus],
            ['prioridade', dados.quantidadesPorPrioridade],
            ['tipo', dados.quantidadesPorTipo]
        ];

        // Preenche as contagens exibidas em cada grupo
        document.querySelectorAll('.row')[1].querySelectorAll('.content-card').forEach((card, index) => {
            const contagens = Object.values(grupos[index][1]);
            card.querySelectorAll('.count').forEach((elemento, indice) => { elemento.textContent = contagens[indice]; });
        });

        // Cria a lista de demandas críticas em aberto
        const lista = document.getElementById('demandas-criticas');
        lista.replaceChildren(...dados.demandasCriticasEmAberto.map((demanda) => {
            const item = document.createElement('li'); item.append(linkDemanda(demanda)); return item;
        }));

        // Exibe uma mensagem quando não existir demanda crítica
        if (!lista.children.length) { const item = document.createElement('li'); item.textContent = 'Nenhuma demanda crítica em aberto.'; lista.append(item); }
        
        // Preenche a tabela com as demandas próximas do prazo
        const corpo = document.querySelector('#tabela-demandas tbody');
        corpo.replaceChildren(...dados.demandasProximasDoPrazo.map((demanda) => {
            const linha = document.createElement('tr');
            const titulo = document.createElement('td'); titulo.append(linkDemanda(demanda)); linha.append(titulo);
            for (const valor of [demanda.projeto_nome, demanda.responsavel_nome || 'Não definido', rotulos[demanda.prioridade], rotulos[demanda.status], dataDashboard(demanda.prazo)]) {
                const coluna = document.createElement('td'); coluna.textContent = valor; linha.append(coluna);
            }
            return linha;
        }));

        // Aplica novamente os filtros locais após a tabela ser preenchida
        aplicarFiltrosTabela();
    } catch (error) {
        // Exibe a mensagem devolvida pela API
        erro.textContent = error.message; erro.hidden = false;
    } finally {
        // Esconde o indicador de carregamento ao finalizar a consulta
        carregando.hidden = true;
    }
}

// Cria um link para a página de detalhes de uma demanda
function linkDemanda(demanda) {
    const link = document.createElement('a');
    link.className = 'link-demanda';
    link.href = `detalhes.html?id=${demanda.id}`; link.textContent = demanda.titulo; return link;
}

// Converte uma data ano-mês-dia para o formato brasileiro
function dataDashboard(value) {
    return value ? value.split('-').reverse().join('/') : 'Não definido';
}

// Aguarda o HTML carregar e inicia o dashboard
document.addEventListener('DOMContentLoaded', async function () {

    // Confere a sessão antes de buscar os indicadores
    const usuarioDashboard = await exigirUsuario();
    if (usuarioDashboard) await carregarDashboard();
});
