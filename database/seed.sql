-- Autor: Equipe PI-II-TIME-16
-- Descrição: Dados demonstrativos para apresentar perfis, projetos e demandas.
-- MySQL 8.4. Execute após schema.sql, com o banco demandas_app selecionado (USE demandas_app;).
-- As contas abaixo são apenas para demonstração.
-- O script pode ser executado mais de uma vez: registros já existentes não são duplicados.

START TRANSACTION;

INSERT INTO usuarios (nome, email, senha_hash, perfil)
SELECT s.nome, s.email, s.senha_hash, s.perfil
FROM (
    SELECT 'Admin Demo' AS nome, 'admin@local.test' AS email,
           '$2b$12$QAyhaWtP9tqSp6oU6myLW..W44FvREIJJGBvk017TmYXjLOF2D8mK' AS senha_hash, 'ADMIN' AS perfil
    UNION ALL
    SELECT 'Lucas Líder', 'lider@local.test',
           '$2b$12$e2/.lBV02T34.T0SC3JzHuiDEjiXdanjZ2vQezNKzxMhBUI8MeHji', 'LIDER'
    UNION ALL
    SELECT 'João Silva', 'joao@local.test',
           '$2b$12$TJRMnBaAcBFIVPAA.td9IOKE8B1/X9.e2S9LAgwSsz3QQJX7OeOee', 'MEMBRO'
    UNION ALL
    SELECT 'Maria Santos', 'maria@local.test',
           '$2b$12$TJRMnBaAcBFIVPAA.td9IOKE8B1/X9.e2S9LAgwSsz3QQJX7OeOee', 'MEMBRO'
) AS s
WHERE NOT EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.email_chave = LOWER(TRIM(s.email)) COLLATE utf8mb4_0900_as_cs
);

INSERT INTO projetos (nome, descricao)
SELECT s.nome, s.descricao
FROM (
    SELECT 'Sistema de Demandas' AS nome, 'Projeto de acompanhamento de demandas.' AS descricao
    UNION ALL
    SELECT 'App Cliente', 'Aplicação de atendimento ao cliente.'
) AS s
WHERE NOT EXISTS (
    SELECT 1 FROM projetos p
    WHERE p.nome = s.nome COLLATE utf8mb4_0900_as_cs
);

INSERT INTO projeto_membros (projeto_id, usuario_id)
SELECT p.id, u.id
FROM projetos p CROSS JOIN usuarios u
WHERE (
      (p.nome = 'Sistema de Demandas' AND u.email IN ('lider@local.test', 'joao@local.test', 'maria@local.test'))
   OR (p.nome = 'App Cliente' AND u.email IN ('lider@local.test', 'maria@local.test'))
  )
  AND NOT EXISTS (
      SELECT 1 FROM projeto_membros pm
      WHERE pm.projeto_id = p.id AND pm.usuario_id = u.id
  );

INSERT INTO demandas
    (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, status, prazo)
SELECT p.id, criador.id, responsavel.id,
       dados.titulo, dados.descricao, dados.tipo, dados.prioridade, dados.status, dados.prazo
FROM (
    SELECT 'Sistema de Demandas' AS projeto, 'joao@local.test' AS criador, 'joao@local.test' AS responsavel,
           'Ajustar fluxo de login' AS titulo, 'Corrigir a mensagem apresentada após uma senha inválida.' AS descricao,
           'DEFEITO' AS tipo, 'ALTA' AS prioridade, 'EM_ANDAMENTO' AS status, DATE '2026-10-29' AS prazo
    UNION ALL
    SELECT 'App Cliente', 'lider@local.test', NULL, 'Implementar busca por responsável',
           'Adicionar busca textual e filtros por pessoa responsável.', 'MELHORIA', 'MEDIA', 'ABERTA', DATE '2026-11-03'
    UNION ALL
    SELECT 'Sistema de Demandas', 'lider@local.test', 'joao@local.test', 'Revisar página de cadastro',
           'Ajustar os rótulos e validar as mensagens do formulário.', 'TAREFA', 'CRITICA', 'ABERTA', DATE '2026-10-27'
    UNION ALL
    SELECT 'Sistema de Demandas', 'maria@local.test', 'maria@local.test', 'Documentar API de demandas',
           'Registrar os exemplos de requisição e resposta das rotas.', 'DOCUMENTACAO', 'BAIXA', 'EM_REVISAO', NULL
    UNION ALL
    SELECT 'App Cliente', 'lider@local.test', 'maria@local.test', 'Atualizar validação de cadastro',
           'Revisar regras e mensagens da validação de cadastro.', 'TAREFA', 'ALTA', 'CONCLUIDA', NULL
    UNION ALL
    SELECT 'Sistema de Demandas', 'lider@local.test', 'joao@local.test', 'Remover inconsistência de prioridade',
           'Analisar a demanda duplicada e registrar o motivo do cancelamento.', 'DEFEITO', 'CRITICA', 'CANCELADA', NULL
    UNION ALL
    SELECT 'App Cliente', 'maria@local.test', NULL, 'Criar filtros do dashboard',
           'Permitir filtrar indicadores por status e prioridade.', 'MELHORIA', 'MEDIA', 'ABERTA', DATE '2026-10-30'
    UNION ALL
    SELECT 'Sistema de Demandas', 'lider@local.test', 'joao@local.test', 'Otimizar consulta da listagem',
           'Reduzir o tempo de resposta da consulta da listagem.', 'TAREFA', 'ALTA', 'EM_REVISAO', DATE '2026-11-02'
) AS dados
JOIN projetos p ON p.nome = dados.projeto COLLATE utf8mb4_0900_as_cs
JOIN usuarios criador ON criador.email = dados.criador COLLATE utf8mb4_0900_as_cs
LEFT JOIN usuarios responsavel ON responsavel.email = dados.responsavel COLLATE utf8mb4_0900_as_cs
WHERE NOT EXISTS (
    SELECT 1 FROM demandas d
    WHERE d.titulo = dados.titulo COLLATE utf8mb4_0900_as_cs
);

INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo)
SELECT d.id, d.criador_id, 'CRIACAO', d.titulo
FROM demandas d
WHERE NOT EXISTS (
    SELECT 1 FROM historico_demandas h
    WHERE h.demanda_id = d.id AND h.acao = 'CRIACAO'
);

INSERT INTO comentarios (demanda_id, autor_id, texto)
SELECT d.id, u.id, 'A demanda foi conferida e está registrada para demonstração.'
FROM demandas d CROSS JOIN usuarios u
WHERE d.titulo = 'Ajustar fluxo de login'
  AND u.email = 'maria@local.test'
  AND NOT EXISTS (
      SELECT 1 FROM comentarios c
      WHERE c.demanda_id = d.id AND c.texto = 'A demanda foi conferida e está registrada para demonstração.'
  );

COMMIT;
