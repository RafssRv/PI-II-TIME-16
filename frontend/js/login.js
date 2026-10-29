const formulario = document.querySelector('#form-login');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');
const erroEmail = document.querySelector('#erro-email');
const erroSenha = document.querySelector('#erro-senha');

formulario.addEventListener('submit', async (event) => {
  event.preventDefault();
  erroEmail.textContent = '';
  erroSenha.textContent = '';
  try {
    const user = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email: campoEmail.value.trim(), senha: campoSenha.value })
    });
    sessionStorage.setItem('usuario', JSON.stringify(user));
    window.location.href = 'dashboard.html';
  } catch (error) {
    erroSenha.textContent = error.message;
    erroSenha.style.display = 'block';
  }
});
