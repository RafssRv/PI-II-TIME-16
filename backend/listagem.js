/* Autor: Heloisa L Marinho  
Descrição: Validação com JavaScript do filtro de busca */

const botaoBusca = document.getElementById("btn-filtrar");
function realizarBusca() {
    const valorBusca = document.getElementById('filtro-busca').value.trim().toLowerCase();
    const valorStatus = document.getElementById('filtro-status').value;
    const valorPrioridade = document.getElementById('filtro-prioridade').value;
    const valorOrdenacao = document.getElementById('filtro-ordenacao').value;

    if (valorBusca === "" && valorStatus === "selecione" && valorPrioridade === "selecione" && valorOrdenacao === "selecione") {
        alert("Por favor, preencha o campo de busca ou selecione pelo menos um filtro antes de buscar.");
    } else {
        console.log("Busca validada com sucesso");
        // implementar a lógica de busca aqui, enviar os dados para o back/filtrar os resultados na página.
    }
}
