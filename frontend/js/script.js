/*
Autor: Rafael Roveri Pires - RA: 24007131
Tela: Compartilhado entre as telas (menu lateral)

Descrição: 
Identifica a página aberta pelo endereço do navegador e acrescenta a classe active ao link correspondente no menu
lateral, permitindo destacar a seção atual
*/

// Espera o HTML da página carregar 
document.addEventListener('DOMContentLoaded', () => {

  // Descobre qual página está aberta 
  const paginaAtual = window.location.pathname.split('/').pop();

  // Seleciona todos os links que estão dentro do menu lateral
  const links = document.querySelectorAll('.sidebar-menu a');

  // Percorre cada link do menu lateral para verificar qual corresponde à página atual
  links.forEach(link => {

    // Verifica se o endereço do link é igual ao nome da página aberta
    if (link.getAttribute('href') === paginaAtual) {

      // Destaca o link correspondente à página atual
      link.classList.add('active');
    }
  });
});

