// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
/*
  Autor: Vinícius Panutti Salgado — R.A. 25007329
  Descrição: Ponto de entrada do servidor Express (TypeScript) com persistência MySQL: lê a porta
  do ambiente, abre a conexão com o banco, cria o app e encerra o pool ao receber SIGINT/SIGTERM.
*/

// Carrega o arquivo .env antes de ler configurações e criar os serviços da aplicação.
import 'dotenv/config';

// Importa a fábrica que configura middlewares, autenticação e rotas do Express.
import { createApp } from './app';
// Importa a fábrica do pool MySQL compartilhado pelas requisições.
import { createMysqlDatabase } from './database';

// Converte PORT para número e usa 3000 quando a variável não está definida.
const port = Number(process.env.PORT || 3000);
// Cria o adaptador de banco; as conexões serão obtidas do pool sob demanda.
const database = createMysqlDatabase();
// Injeta o banco no aplicativo para que as rotas usem a mesma persistência.
const app = createApp(database);

// Dashboard e demandas usam as rotas persistidas registradas em createApp.

// Abre a porta HTTP e executa o callback quando o servidor começa a aceitar conexões.
const server = app.listen(port, () => {
  // Informa no terminal o endereço local e a porta configurada.
  console.log(`Servidor disponível em http://localhost:${port}`);
});

// Agrupa o procedimento usado pelos sinais de encerramento do processo.
async function shutdown() {
  // Para de aceitar conexões e fecha o pool quando o servidor HTTP termina de fechar.
  server.close(async () => { await database.close(); });
}

// Solicita o encerramento ao receber a interrupção do terminal, como Ctrl+C.
process.on('SIGINT', shutdown);
// Usa o mesmo procedimento quando o sistema solicita a finalização do processo.
process.on('SIGTERM', shutdown);
