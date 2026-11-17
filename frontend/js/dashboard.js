// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
// Descrição: Pesquisa e filtros fixos da tabela "Demandas próximas do prazo" no dashboard.

// Seleciona o formulário e os campos que já estão no HTML.
// Obtém o formulário que reúne a busca textual e os seletores da tabela.
const formularioFiltros = document.querySelector('#filtros-ativos');
// Guarda o campo pesquisado no título ou no nome do responsável.
const campoBusca = document.querySelector('#campo-busca');
// Guarda o seletor de status, cujos valores correspondem aos rótulos exibidos nas células.
const filtroStatus = document.querySelector('#filtro-status');
// Guarda o seletor de prioridade usado junto com os demais critérios.
const filtroPrioridade = document.querySelector('#filtro-prioridade');

// Pesquisa pela tecla Enter sem recarregar a página.
// Intercepta o envio do formulário, inclusive quando o usuário pressiona Enter.
formularioFiltros.addEventListener('submit', function (event) {
    // Cancela a navegação padrão do formulário para preservar os dados já carregados.
    event.preventDefault();
    // Reavalia as linhas usando os valores atuais dos três campos.
    aplicarFiltrosTabela();
});

// Atualiza a tabela ao digitar ou mudar um dos filtros.
// Aplica a pesquisa a cada alteração de texto, sem nova consulta ao servidor.
campoBusca.addEventListener('input', aplicarFiltrosTabela);
// Reaplica a filtragem ao escolher outro status.
filtroStatus.addEventListener('change', aplicarFiltrosTabela);
// Reaplica a filtragem ao escolher outra prioridade.
filtroPrioridade.addEventListener('change', aplicarFiltrosTabela);

/**
 * Percorre as linhas da tabela e aplica busca (título ou responsável) e filtros de status/prioridade.
 * Linhas que não correspondem recebem display: none. Sem resultados, exibe mensagem discreta.
 */
// Centraliza o cálculo de quais linhas carregadas permanecem visíveis.
function aplicarFiltrosTabela() {
    // Remove espaços externos e ignora diferenças entre maiúsculas e minúsculas na pesquisa.
    const termo = campoBusca.value.trim().toLowerCase();
    // Lê o status escolhido; texto vazio significa aceitar todos.
    const statusSelecionado = filtroStatus.value;
    // Lê a prioridade escolhida; texto vazio significa aceitar todas.
    const prioridadeSelecionada = filtroPrioridade.value;

    // Seleciona somente as linhas do corpo da tabela, sem atingir seus cabeçalhos.
    const linhas = document.querySelectorAll('#tabela-demandas tbody tr');
    // Inicia a contagem usada para decidir se o aviso de lista vazia deve aparecer.
    let visiveis = 0;

    // Testa cada linha separadamente contra a busca e os dois filtros.
    linhas.forEach(function (linha) {
        // Obtém as células da linha na ordem definida no HTML do dashboard.
        const colunas = linha.querySelectorAll('td');
        // Lê o título na primeira célula; a alternativa vazia evita erro se ela não existir.
        const titulo = (colunas[0] && colunas[0].textContent || '').trim().toLowerCase();
        // Lê o responsável na terceira célula e o normaliza para pesquisa textual.
        const responsavel = (colunas[2] && colunas[2].textContent || '').trim().toLowerCase();
        // Lê a prioridade na quarta célula, retirando espaços externos.
        const prioridade = (colunas[3] && colunas[3].textContent || '').trim();
        // Lê o status na quinta célula para compará-lo com o seletor.
        const status = (colunas[4] && colunas[4].textContent || '').trim();

        // Aceita busca vazia ou ocorrência parcial do termo no título ou no responsável.
        const correspondeBusca = termo === '' || titulo.includes(termo) || responsavel.includes(termo);
        // Aceita qualquer status quando o filtro está vazio; caso contrário exige igualdade.
        const correspondeStatus = statusSelecionado === '' || status === statusSelecionado;
        // Faz a mesma comparação para a prioridade selecionada.
        const correspondePrioridade = prioridadeSelecionada === '' || prioridade === prioridadeSelecionada;

        // Combina os três critérios com E: todos precisam ser satisfeitos.
        const deveExibir = correspondeBusca && correspondeStatus && correspondePrioridade;
        // Restaura o display padrão nas correspondências e oculta as demais linhas.
        linha.style.display = deveExibir ? '' : 'none';

        // Conta apenas linhas que passaram por todos os critérios.
        if (deveExibir) {
            // Acrescenta uma unidade ao total de resultados visíveis.
            visiveis += 1;
        }
    });

    // Exibe o aviso de ausência de resultados quando nenhuma linha passou pelos filtros.
    atualizarMensagemVazio(visiveis === 0);
}

/**
 * Mostra ou esconde o aviso "Nenhuma demanda encontrada" quando o filtro não retorna linhas.
 */
// Atualiza a mensagem de lista vazia sem reconstruir a tabela.
function atualizarMensagemVazio(semResultados) {
    // Busca o elemento reservado a essa mensagem no HTML.
    const mensagem = document.getElementById('mensagem-sem-resultados');
    // Verifica se a mensagem existe antes de acessar suas propriedades.
    if (!mensagem) {
        // Encerra a atualização se o elemento não estiver presente.
        return;
    }
    // Oculta a mensagem quando há resultados e a revela quando não há nenhum.
    mensagem.hidden = !semResultados;
}

// Carrega indicadores persistidos e conserva os filtros locais da tabela.
// Busca o resumo persistido e preenche indicadores, distribuições e listas da página.
async function carregarDashboard() {
    // Obtém a área de alerta para falhas da consulta.
    const erro = document.getElementById('dashboard-erro');
    // Obtém a indicação de carregamento enquanto a requisição estiver pendente.
    const carregando = document.getElementById('dashboard-carregando');
    // Esconde uma mensagem de erro de uma tentativa anterior.
    erro.hidden = true;
    // Revela o estado de carregamento antes de chamar a API.
    carregando.hidden = false;
    // Mantém consulta e renderização no mesmo tratamento de falhas.
    try {
        // Aguarda GET /api/dashboard pelo cliente compartilhado, que envia o cookie da sessão.
        const dados = await api('/dashboard');
        // Monta os quatro indicadores na mesma ordem dos cartões do HTML.
        const metricas = [
            // Usa o total de demandas visíveis ao usuário como primeiro indicador.
            dados.totalDemandas,
            // Usa a contagem de demandas em andamento como segundo indicador.
            dados.quantidadesPorStatus.EM_ANDAMENTO,
            // Usa a contagem de demandas concluídas como terceiro indicador.
            dados.quantidadesPorStatus.CONCLUIDA,
            // Conta os itens da lista de demandas críticas ainda abertas para o quarto indicador.
            dados.demandasCriticasEmAberto.length
        ];
        // Escreve cada indicador no cartão correspondente usando textContent.
        document.querySelectorAll('.metric-card .value').forEach((elemento, indice) => { elemento.textContent = metricas[indice]; });
        // Mantém as distribuições na ordem dos três cartões: status, prioridade e tipo.
        const grupos = [
            // Associa o primeiro cartão às contagens por status recebidas da API.
            ['status', dados.quantidadesPorStatus],
            // Associa o segundo cartão às contagens por prioridade.
            ['prioridade', dados.quantidadesPorPrioridade],
            // Associa o terceiro cartão às contagens por tipo de demanda.
            ['tipo', dados.quantidadesPorTipo]
        ];
        // Percorre os cartões de distribuição da segunda linha da grade da página.
        document.querySelectorAll('.row')[1].querySelectorAll('.content-card').forEach((card, index) => {
            // Extrai os valores do grupo correspondente, conservando a ordem das propriedades recebidas.
            const contagens = Object.values(grupos[index][1]);
            // Preenche as contagens daquele cartão na ordem dos elementos .count.
            card.querySelectorAll('.count').forEach((elemento, indice) => { elemento.textContent = contagens[indice]; });
        });
        // Obtém a lista destinada às demandas críticas em aberto.
        const lista = document.getElementById('demandas-criticas');
        // Substitui o conteúdo anterior pelos itens construídos a partir da resposta atual.
        lista.replaceChildren(...dados.demandasCriticasEmAberto.map((demanda) => {
            // Cria um item de lista, insere o link para a demanda e o devolve para renderização.
            const item = document.createElement('li'); item.append(linkDemanda(demanda)); return item;
        }));
        // Quando a lista está vazia, acrescenta uma mensagem textual em vez de deixá-la sem explicação.
        if (!lista.children.length) { const item = document.createElement('li'); item.textContent = 'Nenhuma demanda crítica em aberto.'; lista.append(item); }
        // Seleciona o corpo da tabela em que serão inseridas as demandas próximas do prazo.
        const corpo = document.querySelector('#tabela-demandas tbody');
        // Reconstrói as linhas com os registros já filtrados pela janela de prazo no servidor.
        corpo.replaceChildren(...dados.demandasProximasDoPrazo.map((demanda) => {
            // Cria a linha de tabela desta demanda.
            const linha = document.createElement('tr');
            // Cria a primeira célula com o link de título e a adiciona à linha.
            const titulo = document.createElement('td'); titulo.append(linkDemanda(demanda)); linha.append(titulo);
            // Percorre os cinco valores restantes na ordem do cabeçalho, traduzindo códigos e formatando o prazo.
            for (const valor of [demanda.projeto_nome, demanda.responsavel_nome || 'Não definido', rotulos[demanda.prioridade], rotulos[demanda.status], dataDashboard(demanda.prazo)]) {
                // Cria uma célula por valor e usa textContent para que o conteúdo não seja interpretado como HTML.
                const coluna = document.createElement('td'); coluna.textContent = valor; linha.append(coluna);
            }
            // Devolve a linha completa para o conjunto que substituirá o corpo da tabela.
            return linha;
        }));
        // Reaplica os filtros locais depois de preencher a tabela com a resposta da API.
        aplicarFiltrosTabela();
    // Captura falhas tanto da requisição quanto do preenchimento dos elementos da página.
    } catch (error) {
        // Escreve a mensagem disponível no erro e revela a área de alerta.
        erro.textContent = error.message; erro.hidden = false;
    // Executa a limpeza visual tanto em caso de sucesso quanto de falha.
    } finally {
        // Oculta a indicação de carregamento ao terminar a tentativa.
        carregando.hidden = true;
    }
}
// Constrói o link reutilizado na lista de críticas e na tabela de prazos.
function linkDemanda(demanda) {
    // Cria um elemento de navegação sem interpolar HTML.
    const link = document.createElement('a');
    // Aplica a classe que define a aparência dos links de demandas.
    link.className = 'link-demanda';
    // Monta o endereço com o identificador, insere o título como texto e devolve o elemento.
    link.href = `detalhes.html?id=${demanda.id}`; link.textContent = demanda.titulo; return link;
}
// Formata uma data civil da API sem converter o valor para outro fuso horário.
function dataDashboard(value) {
    // Converte AAAA-MM-DD em DD/MM/AAAA; prazo ausente recebe um rótulo explícito.
    return value ? value.split('-').reverse().join('/') : 'Não definido';
}
// Aguarda o HTML estar pronto antes de buscar os dados protegidos.
document.addEventListener('DOMContentLoaded', async function () {
    // Confirma a sessão pelo helper compartilhado de autenticação da interface.
    const usuarioDashboard = await exigirUsuario();
    // Só carrega o resumo se a verificação devolver um usuário autenticado.
    if (usuarioDashboard) await carregarDashboard();
});
