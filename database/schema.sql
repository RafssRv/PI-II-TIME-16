-- Autor: Vinícius Panutti Salgado - RA 25007329
-- MySQL 8.4. Execute uma única vez em um banco vazio, selecionado na conexão.
-- DDL realiza COMMIT implícito: um erro pode deixar objetos já criados.

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    email_chave VARCHAR(254) GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED,
    CONSTRAINT uq_usuario_email UNIQUE (email_chave),
    perfil VARCHAR(20) DEFAULT 'MEMBRO' NOT NULL,
    ativo TINYINT DEFAULT 1 NOT NULL,
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    CONSTRAINT ck_usuario_perfil CHECK (perfil IN ('ADMIN', 'LIDER', 'MEMBRO')),
    CONSTRAINT ck_usuario_ativo CHECK (ativo IN (0, 1)),
    CONSTRAINT ck_usuario_nome CHECK (CHAR_LENGTH(TRIM(nome)) > 0),
    CONSTRAINT ck_usuario_email CHECK (CHAR_LENGTH(TRIM(email)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;

-- E-mails iguais com diferença apenas de caixa pertencem ao mesmo usuário.
-- A coluna gerada email_chave mantém a unicidade sem diferença de caixa/espaços.

CREATE TABLE projetos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao VARCHAR(1000),
    ativo TINYINT DEFAULT 1 NOT NULL,
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    CONSTRAINT ck_projeto_nome CHECK (CHAR_LENGTH(TRIM(nome)) > 0),
    CONSTRAINT ck_projeto_ativo CHECK (ativo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;

CREATE TABLE projeto_membros (
    projeto_id INT NOT NULL,
    usuario_id INT NOT NULL,
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    CONSTRAINT pk_projeto_membros PRIMARY KEY (projeto_id, usuario_id),
    CONSTRAINT fk_pm_projeto FOREIGN KEY (projeto_id) REFERENCES projetos (id),
    CONSTRAINT fk_pm_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE INDEX ix_pm_usuario ON projeto_membros (usuario_id);

CREATE TABLE demandas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    projeto_id INT NOT NULL,
    criador_id INT NOT NULL,
    responsavel_id INT,
    titulo VARCHAR(100) NOT NULL,
    descricao VARCHAR(1000) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    prioridade VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'ABERTA' NOT NULL,
    prazo DATE,
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_demanda_projeto FOREIGN KEY (projeto_id) REFERENCES projetos (id),
    CONSTRAINT fk_demanda_criador FOREIGN KEY (criador_id) REFERENCES usuarios (id),
    CONSTRAINT fk_demanda_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios (id),
    CONSTRAINT ck_demanda_titulo CHECK (TRIM(titulo) IS NOT NULL AND CHAR_LENGTH(TRIM(titulo)) >= 3),
    CONSTRAINT ck_demanda_desc CHECK (TRIM(descricao) IS NOT NULL AND CHAR_LENGTH(TRIM(descricao)) >= 10),
    CONSTRAINT ck_demanda_tipo CHECK (tipo IN ('TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO')),
    CONSTRAINT ck_demanda_prioridade CHECK (prioridade IN ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA')),
    CONSTRAINT ck_demanda_status CHECK (status IN ('ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE INDEX ix_demanda_projeto ON demandas (projeto_id);
CREATE INDEX ix_demanda_criador ON demandas (criador_id);
CREATE INDEX ix_demanda_responsavel ON demandas (responsavel_id);
CREATE INDEX ix_demanda_filtros ON demandas (status, prioridade, prazo);

CREATE TABLE comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    demanda_id INT NOT NULL,
    autor_id INT NOT NULL,
    texto VARCHAR(500) NOT NULL,
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_comentario_demanda FOREIGN KEY (demanda_id) REFERENCES demandas (id),
    CONSTRAINT fk_comentario_autor FOREIGN KEY (autor_id) REFERENCES usuarios (id),
    CONSTRAINT ck_comentario_texto CHECK (TRIM(texto) IS NOT NULL AND CHAR_LENGTH(TRIM(texto)) >= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE INDEX ix_comentario_demanda ON comentarios (demanda_id, criado_em);
CREATE INDEX ix_comentario_autor ON comentarios (autor_id);

CREATE TABLE historico_demandas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    demanda_id INT NOT NULL,
    autor_id INT NOT NULL,
    acao VARCHAR(20) NOT NULL,
    campo VARCHAR(40),
    valor_anterior VARCHAR(1000),
    valor_novo VARCHAR(1000),
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_historico_demanda FOREIGN KEY (demanda_id) REFERENCES demandas (id),
    CONSTRAINT fk_historico_autor FOREIGN KEY (autor_id) REFERENCES usuarios (id),
    CONSTRAINT ck_historico_acao CHECK (acao IN ('CRIACAO', 'ALTERACAO')),
    CONSTRAINT ck_historico_campo CHECK (acao = 'CRIACAO' OR campo IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE INDEX ix_historico_demanda ON historico_demandas (demanda_id, criado_em);
CREATE INDEX ix_historico_autor ON historico_demandas (autor_id);
