/*
Autor: Rafael Roveri Pires - RA: 24007131
Tela: Compartilhado entre as telas (menu lateral)

Descrição: 
Identifica a página aberta pelo endereço do navegador e acrescenta a classe active ao link correspondente no menu
lateral, permitindo destacar a seção atual
*/
document.addEventListener('DOMContentLoaded', () => {
  const paginaAtual = window.location.pathname.split('/').pop();
  const links = document.querySelectorAll('.sidebar-menu a');
  links.forEach(link => {
    if (link.getAttribute('href') === paginaAtual) {
      link.classList.add('active');
    }
  });
});

