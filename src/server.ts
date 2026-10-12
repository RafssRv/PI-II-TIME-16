// Autor: Vinícius Panutti Salgado — Responsável pelo Dashboard
// Servidor provisório da demonstração individual; não substitui a base coletiva.
import express from 'express';
import dashboardRoutes from './dashboard/dashboard.routes';

const app = express();

app.get('/', (_req, res) => {
  res.send('Servidor rodando');
});

app.use('/dashboard', dashboardRoutes);

app.listen(3000, () => {
  console.log('Demonstração do Dashboard: http://localhost:3000/dashboard');
});
