// Autor: Rafael Roveri Pires - 24007131

const user = exigirUsuario();
const form = document.querySelector('#form-demanda');

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [projetos, usuarios] = await Promise.all([api('/projetos'), api('/usuarios')]);
    preencherSelect('projeto', projetos.filter((item) => item.ativo), 'Selecione um projeto...');
    preencherSelect('responsavel', usuarios.filter((item) => item.ativo), 'Sem responsável definido');
  } catch (error) { alert(error.message); }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  limparErros();
  const valido = [
    validarTexto('titulo', 3, 100), validarTexto('descricao', 10, 1000),
    validarSelect('projeto'), validarSelect('tipo'), validarSelect('prioridade'), validarPrazo('prazo')
  ].every(Boolean);
  if (!valido) return;
  try {
    const result = await api('/demandas', {
      method: 'POST',
      body: JSON.stringify({
        projeto_id: Number(document.querySelector('#projeto').value),
        criador_id: user.id,
        responsavel_id: Number(document.querySelector('#responsavel').value) || null,
        titulo: document.querySelector('#titulo').value.trim(),
        descricao: document.querySelector('#descricao').value.trim(),
        tipo: document.querySelector('#tipo').value,
        prioridade: document.querySelector('#prioridade').value,
        prazo: document.querySelector('#prazo').value || null
      })
    });
    window.location.href = `detalhes.html?id=${result.id}`;
  } catch (error) { alert(error.message); }
});

function preencherSelect(id, items, placeholder) {
  const select = document.querySelector(`#${id}`);
  select.replaceChildren(new Option(placeholder, ''));
  items.forEach((item) => select.add(new Option(item.nome, item.id)));
}
function validarTexto(id, min, max) { const campo = document.getElementById(id); const valor = campo.value.trim(); if (valor.length < min || valor.length > max) { mostrarErro(campo, `Informe entre ${min} e ${max} caracteres.`); return false; } return true; }
function validarSelect(id) { const campo = document.getElementById(id); if (!campo.value) { mostrarErro(campo, 'Selecione uma opção válida.'); return false; } return true; }
function validarPrazo(id) { const campo = document.getElementById(id); if (!campo.value) return true; const hoje = new Date(); hoje.setHours(0, 0, 0, 0); if (new Date(`${campo.value}T00:00:00`) < hoje) { mostrarErro(campo, 'O prazo não pode estar no passado.'); return false; } return true; }
function mostrarErro(campo, mensagem) { const erro = document.createElement('span'); erro.className = 'erro-campo'; erro.textContent = mensagem; campo.classList.add('campo-invalido'); campo.insertAdjacentElement('afterend', erro); }
function limparErros() { document.querySelectorAll('.erro-campo').forEach((item) => item.remove()); document.querySelectorAll('.campo-invalido').forEach((item) => item.classList.remove('campo-invalido')); }
