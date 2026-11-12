import express from 'express';
import { registrarLogin } from './rotas/login';
import { registrarUsuarios } from './rotas/usuarios';

const app = express();
app.use(express.json());

registrarLogin(app);
registrarUsuarios(app);

const porta = Number(process.env.PORT_REUNIAO4 || 3001);
app.listen(porta, () => {
  console.log(`Login e usuários em memória: http://localhost:${porta}/api/usuarios`);
});
