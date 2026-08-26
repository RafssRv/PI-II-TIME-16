// Autor: Rafael
// Descrição: destaca o item ativo do menu com base na pagina atual automaticamente
document.addEventListener('DOMContentLoaded', () => {
  const paginaAtual = window.location.pathname.split('/').pop();
  const links = document.querySelectorAll('.sidebar-menu a');
  links.forEach(link => {
    if (link.getAttribute('href') === paginaAtual) {
      link.classList.add('active');
    }
  });
});

