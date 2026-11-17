// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
// Carrega variáveis do .env em modo silencioso, sem imprimir a configuração no terminal.
require('dotenv').config({ quiet: true });
// Carrega o executor de testes nativo do Node.
const test = require('node:test');
// Carrega asserções estritas para validar respostas HTTP e registros persistidos.
const assert = require('node:assert/strict');
// Importa a aplicação real que será servida por uma porta local temporária.
const { createApp } = require('../src/app');
// Importa o adaptador real do MySQL usado durante todo o cenário.
const { createMysqlDatabase } = require('../src/database');

// Define um cenário completo de persistência; ele depende de um banco de teste disponível.
test('MySQL real: cadastro, login, CRUD, comentários e histórico', {
  // Pula o cenário por padrão e só o habilita quando MYSQL_INTEGRATION vale exatamente 1.
  skip: process.env.MYSQL_INTEGRATION !== '1'
// Inicia a execução assíncrona do cenário quando ele estiver habilitado.
}, async () => {
  // Exige o sufixo _test no banco para evitar executar as escritas no banco habitual do projeto.
  assert.match(process.env.MYSQL_DATABASE || '', /_test$/, 'Use um banco exclusivo terminado em _test.');
  // Cria o pool real usando as variáveis de ambiente carregadas no início.
  const database = createMysqlDatabase();
  // Inicia a API apenas no loopback e deixa o sistema escolher uma porta livre.
  const server = createApp(database).listen(0, '127.0.0.1');
  // Aguarda o servidor começar a escutar antes de enviar requisições.
  await new Promise((resolve) => server.once('listening', resolve));
  // Monta a URL da API com a porta efetivamente escolhida pelo sistema.
  const base = `http://127.0.0.1:${server.address().port}/api`;
  // Guarda os ids criados, usados depois para remover somente os registros deste cenário.
  const created = {};
  // Mantém o cookie de sessão que será reaproveitado pelas chamadas autenticadas.
  let cookie = '';
  // Centraliza envio HTTP, persistência do cookie e conferência do status esperado.
  async function call(path, method = 'GET', body, status = 200) {
    // Informa que os corpos enviados pelo teste usam JSON.
    const headers = { 'content-type': 'application/json' };
    // Reutiliza o cookie recebido no login nas chamadas seguintes.
    if (cookie) headers.cookie = cookie;
    // Faz a requisição para a rota solicitada, usando as opções definidas abaixo.
    const response = await fetch(`${base}${path}`, {
      // Aplica o método HTTP e os cabeçalhos calculados para esta chamada.
      method, headers,
      // Serializa o corpo quando fornecido; caso contrário, envia a requisição sem corpo.
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    // Obtém os cabeçalhos de criação ou atualização de cookies enviados pelo servidor.
    const cookies = response.headers.getSetCookie();
    // Guarda o primeiro par nome=valor, retirando os atributos que pertencem só ao Set-Cookie.
    if (cookies.length) cookie = cookies[0].split(';')[0];
    // Trata 204 sem tentar ler JSON; os demais resultados são desserializados.
    const result = response.status === 204 ? null : await response.json();
    // Compara o status com o esperado e usa o corpo na mensagem de falha para facilitar diagnóstico.
    assert.equal(response.status, status, JSON.stringify(result));
    // Devolve o corpo para as verificações específicas de cada etapa.
    return result;
  }
  // Protege o cenário com limpeza final, inclusive quando uma verificação falhar.
  try {
    // Confirma que a API consegue consultar o banco pela rota pública de saúde.
    await call('/health');
    // Confirma que a listagem de projetos exige autenticação antes do login.
    await call('/projetos', 'GET', undefined, 401);

    // Em banco populado, autentica com um ADMIN existente.
    // Em banco vazio, mantém o teste do cadastro inicial por bootstrap.
    // Abre uma conexão apenas para saber se o banco já contém usuários.
    const connection = await database.connection();
    // Reserva o total que decidirá entre login administrativo e cadastro inicial.
    let totalUsuarios;
    // Garante a devolução da conexão de contagem ao terminar a leitura.
    try {
      // Conta os usuários existentes, sem alterar os registros do banco.
      const rows = await connection.query('SELECT COUNT(*) AS total FROM usuarios');
      // Converte o resultado da contagem para número, adotando zero se ele estiver ausente.
      totalUsuarios = Number(rows[0]?.total || 0);
    // Executa a liberação mesmo se a consulta de contagem falhar.
    } finally {
      // Devolve a conexão ao pool após a leitura inicial.
      await connection.close();
    }

    // Em banco populado, o cadastro de outro usuário exige uma sessão administrativa existente.
    if (totalUsuarios > 0) {
      // Lê o e-mail administrativo dedicado ao teste, sem incluí-lo no código.
      const adminEmail = process.env.MYSQL_TEST_ADMIN_EMAIL;
      // Lê a senha correspondente pela configuração do ambiente.
      const adminPassword = process.env.MYSQL_TEST_ADMIN_PASSWORD;
      // Verifica a presença das duas credenciais antes de tentar o login administrativo.
      assert.ok(
        // Exige que tanto e-mail quanto senha tenham sido configurados.
        adminEmail && adminPassword,
        // Explica como configurar o cenário quando o banco já está populado.
        'Banco populado: informe MYSQL_TEST_ADMIN_EMAIL e MYSQL_TEST_ADMIN_PASSWORD de um ADMIN.'
      );
      // Autentica o administrador existente para permitir a preparação dos dados do teste.
      const adminSession = await call('/login', 'POST', {
        // Envia o e-mail configurado para esse administrador.
        email: adminEmail,
        // Envia a senha configurada, mantendo-a fora do histórico do código.
        senha: adminPassword
      });
      // Confirma que a sessão recebida tem efetivamente perfil ADMIN.
      assert.equal(adminSession.perfil, 'ADMIN');
    }
    // Gera um e-mail de teste com carimbo de tempo para reduzir colisões com outras execuções.
    const email = `mysql-${Date.now()}@local.test`;
    // Cria um ADMIN exclusivo do cenário, espera 201 e guarda seu id para a limpeza final.
    created.usuario = (await call('/usuarios', 'POST', { nome: 'Teste MySQL', email, senha: 'SenhaTeste123!', perfil: 'ADMIN' }, 201)).id;
    // Faz login como o usuário recém-criado para validar suas próprias credenciais e sessão.
    const sessao = await call('/login', 'POST', { email, senha: 'SenhaTeste123!' });
    // Confirma que o login devolve o mesmo identificador criado no banco.
    assert.equal(sessao.id, created.usuario);
    // Consulta a sessão em outra requisição para verificar a continuidade pelo cookie.
    assert.equal((await call('/sessao')).id, created.usuario);
    // Cria um projeto e guarda o identificador devolvido com status 201.
    created.projeto = (await call('/projetos', 'POST', { nome: 'Projeto teste MySQL' }, 201)).id;
    // Vincula o usuário à equipe do projeto e espera resposta 204 sem corpo.
    await call(`/projetos/${created.projeto}/membros`, 'POST', { usuario_id: created.usuario }, 204);
    // Cria uma demanda pelo fluxo HTTP real e guarda seu identificador.
    created.demanda = (await call('/demandas', 'POST', {
      // Relaciona a demanda ao projeto e ao responsável criados por este cenário.
      projeto_id: created.projeto, responsavel_id: created.usuario,
      // Fornece os campos obrigatórios e um prazo fixo para conferir a persistência posteriormente.
      titulo: 'Teste de persistência', descricao: 'Demanda criada pelo teste de integração.', tipo: 'TAREFA', prioridade: 'MEDIA', prazo: '2030-12-31'
    // Exige 201 e extrai o id da demanda recém-criada.
    }, 201)).id;
    // Avança o status para EM_ANDAMENTO e exige resposta 204.
    await call(`/demandas/${created.demanda}`, 'PATCH', { status: 'EM_ANDAMENTO' }, 204);
    // Cria um comentário na demanda e registra seu id para as próximas operações.
    created.comentario = (await call(`/demandas/${created.demanda}/comentarios`, 'POST', { texto: 'Comentário de teste' }, 201)).id;
    // Edita o comentário pela API para validar a atualização do texto persistido.
    await call(`/comentarios/${created.comentario}`, 'PATCH', { texto: 'Comentário editado' }, 204);
    // Reconsulta a demanda para conferir dados e dependências após as escritas.
    const detail = await call(`/demandas/${created.demanda}`);
    // Confirma a persistência do novo status.
    assert.equal(detail.status, 'EM_ANDAMENTO');
    // Confirma que o prazo DATE preservou o mesmo dia civil enviado.
    assert.equal(detail.prazo, '2030-12-31');
    // Confirma que a leitura agregada devolve o comentário já editado.
    assert.equal(detail.comentarios[0].texto, 'Comentário editado');
    // Exige dois eventos de histórico: criação e mudança de status.
    assert.equal(detail.historico.length, 2);
    // Confere também a rota específica de listagem de comentários da demanda.
    assert.equal((await call(`/demandas/${created.demanda}/comentarios`)).length, 1);
    // Edita quatro campos, incluindo a remoção explícita do prazo com null.
    await call(`/demandas/${created.demanda}`, 'PATCH', { titulo: 'Demanda editada no MySQL', tipo: 'DOCUMENTACAO', prioridade: 'CRITICA', prazo: null }, 204);
    // Reconsulta o registro para verificar a gravação efetiva da edição.
    const persisted = await call(`/demandas/${created.demanda}`);
    // Confirma o título atualizado no MySQL.
    assert.equal(persisted.titulo, 'Demanda editada no MySQL');
    // Confirma a mudança do tipo para DOCUMENTACAO.
    assert.equal(persisted.tipo, 'DOCUMENTACAO');
    // Confirma a mudança da prioridade para CRITICA.
    assert.equal(persisted.prioridade, 'CRITICA');
    // Confirma que o prazo foi removido, em vez de preservado ou convertido para texto vazio.
    assert.equal(persisted.prazo, null);
    // Exige 405 para exclusão física da demanda, preservando o registro e seus vínculos.
    await call(`/demandas/${created.demanda}`, 'DELETE', undefined, 405);
    // Cancela pelo fluxo permitido, alterando apenas o status.
    await call(`/demandas/${created.demanda}`, 'PATCH', { status: 'CANCELADA' }, 204);
    // Reconsulta o estado cancelado e suas dependências.
    const cancelled = await call(`/demandas/${created.demanda}`);
    // Confirma que a demanda permaneceu no banco com status CANCELADA.
    assert.equal(cancelled.status, 'CANCELADA');
    // Exige os sete eventos acumulados: criação, status, quatro campos editados e cancelamento.
    assert.equal(cancelled.historico.length, 7);
    // Verifica que o cancelamento preservou o comentário existente.
    assert.equal(cancelled.comentarios[0].texto, 'Comentário editado');
    // Remove o comentário pela operação específica e exige 204.
    await call(`/comentarios/${created.comentario}`, 'DELETE', undefined, 204);
    // Consulta a listagem com projeto, status e ordenação para exercitar filtros na persistência real.
    const filtered = await call(`/demandas?projeto_id=${created.projeto}&status=CANCELADA&ordenacao=prioridade_desc`);
    // Exige apenas a demanda cancelada que foi criada no projeto deste cenário.
    assert.equal(filtered.length, 1);
    // Confirma a identidade do registro retornado, além da quantidade de resultados.
    assert.equal(filtered[0].id, created.demanda);
    // Consulta os indicadores calculados a partir do banco após o cancelamento.
    const dashboard = await call('/dashboard');
    // Verifica que a demanda cancelada participa da contagem por status.
    assert.ok(dashboard.quantidadesPorStatus.CANCELADA >= 1);
    // Garante que ela deixou de integrar a lista de críticas em aberto, mesmo mantendo prioridade crítica.
    assert.ok(!dashboard.demandasCriticasEmAberto.some(d => d.id === created.demanda));
    // Encerra a sessão pelo endpoint de logout.
    await call('/logout', 'POST');
    // Confirma que o cookie anterior já não permite consultar a sessão.
    await call('/sessao', 'GET', undefined, 401);
  // Inicia a limpeza dos dados de teste independentemente do sucesso do cenário.
  } finally {
    // Obtém uma conexão exclusiva para remover os registros criados durante o teste.
    const c = await database.connection();
    // Protege essa conexão e os demais recursos com uma segunda etapa de limpeza.
    try {
      // Só tenta remover a demanda e suas dependências se seu id chegou a ser criado.
      if (created.demanda) {
        // Remove os comentários dependentes antes da demanda para respeitar a chave estrangeira.
        await c.execute('DELETE FROM comentarios WHERE demanda_id = :id', { id: created.demanda });
        // Remove os eventos de histórico vinculados à demanda de teste.
        await c.execute('DELETE FROM historico_demandas WHERE demanda_id = :id', { id: created.demanda });
        // Remove a demanda depois de retirar suas dependências.
        await c.execute('DELETE FROM demandas WHERE id = :id', { id: created.demanda });
      }
      // Só remove o projeto se sua criação foi concluída e registrada.
      if (created.projeto) {
        // Remove os vínculos da equipe antes de apagar o projeto.
        await c.execute('DELETE FROM projeto_membros WHERE projeto_id = :id', { id: created.projeto });
        // Remove o projeto exclusivo do cenário.
        await c.execute('DELETE FROM projetos WHERE id = :id', { id: created.projeto });
      }
      // Remove o usuário criado pelo teste após retirar seus vínculos.
      if (created.usuario) await c.execute('DELETE FROM usuarios WHERE id = :id', { id: created.usuario });
      // Confirma a transação que eliminou os dados temporários.
      await c.commit();
    // Libera conexão, servidor e pool mesmo se uma operação de limpeza falhar.
    } finally {
      // Encerra a transação restante e devolve a conexão ao pool.
      await c.close();
      // Aguarda o fechamento do servidor HTTP temporário.
      await new Promise((resolve) => server.close(resolve));
      // Fecha o pool de conexões usado por este cenário.
      await database.close();
    }
  }
});
