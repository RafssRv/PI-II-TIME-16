const express = require('express');
const app = express();
const porta = 3000;

app.get('/', (req, res) => {
  res.send('Servidor rodando');
});

app.listen(porta, () => {
  console.log(`Servidor ouvindo na porta ${porta}`);
});