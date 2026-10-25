const express = require('express');
let oracledb;
try { oracledb = require('oracledb'); } catch { oracledb = null; }

const app = express();
const port = Number(process.env.PORT || 3000);
let pool;
app.use(express.json());

async function db() {
  if (!oracledb) throw Object.assign(new Error('Dependência oracledb não instalada.'), { status: 503 });
  pool ||= await oracledb.createPool({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1', poolMin: 1, poolMax: 5 });
  const connection = await pool.getConnection();
  return { connection, close: () => connection.close() };
}
function fields(body, names) { for (const name of names) if (body[name] === undefined || body[name] === null || String(body[name]).trim() === '') throw Object.assign(new Error(`Campo obrigatório: ${name}`), { status: 400 }); }
function fail(res, error) { res.status(error.status || (error.errorNum === 1 ? 409 : 500)).json({ error: error.status === 500 ? 'Erro interno ao acessar o banco.' : error.message }); }
const object = () => ({ outFormat: oracledb.OUT_FORMAT_OBJECT });

app.get('/api/health', async (_req, res) => { let x; try { x = await db(); await x.connection.execute('SELECT 1 FROM dual'); res.json({ database: 'online' }); } catch (e) { res.status(503).json({ database: 'offline', error: e.message }); } finally { if (x) await x.close(); } });

app.get('/api/demandas', async (req, res) => { let x; try { const binds = {}; const where = []; for (const f of ['status', 'prioridade']) if (req.query[f]) { where.push(`d.${f} = :${f}`); binds[f] = req.query[f]; } if (req.query.busca) { where.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)'); binds.busca = `%${req.query.busca.toLowerCase()}%`; } x = await db(); const r = await x.connection.execute(`SELECT d.* FROM demandas d ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.criado_em DESC`, binds, object()); res.json(r.rows); } catch (e) { fail(res, e); } finally { if (x) await x.close(); } });

app.get('/api/demandas/:id', async (req, res) => { let x; try { x = await db(); const r = await x.connection.execute('SELECT * FROM demandas WHERE id = :id', { id: req.params.id }, object()); if (!r.rows.length) return res.status(404).json({ error: 'Demanda não encontrada.' }); const c = await x.connection.execute('SELECT * FROM comentarios WHERE demanda_id = :id ORDER BY criado_em', { id: req.params.id }, object()); const h = await x.connection.execute('SELECT * FROM historico_demandas WHERE demanda_id = :id ORDER BY criado_em', { id: req.params.id }, object()); res.json({ ...r.rows[0], comentarios: c.rows, historico: h.rows }); } catch (e) { fail(res, e); } finally { if (x) await x.close(); } });

app.post('/api/demandas', async (req, res) => { let x; try { fields(req.body, ['projeto_id', 'criador_id', 'titulo', 'descricao', 'tipo', 'prioridade']); x = await db(); const r = await x.connection.execute(`INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo) VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo) RETURNING id INTO :id`, { ...req.body, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }); const id = r.outBinds.id[0]; await x.connection.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo) VALUES (:id, :autor_id, 'CRIACAO', :titulo)", { id, autor_id: req.body.criador_id, titulo: req.body.titulo }); await x.connection.commit(); res.status(201).json({ id }); } catch (e) { if (x) await x.connection.rollback(); fail(res, e); } finally { if (x) await x.close(); } });

app.patch('/api/demandas/:id', async (req, res) => { let x; try { const allowed = ['titulo', 'descricao', 'tipo', 'prioridade', 'status', 'prazo', 'responsavel_id']; const changed = Object.keys(req.body).filter((k) => allowed.includes(k)); if (!changed.length || !req.body.autor_id) throw Object.assign(new Error('Informe campos e autor_id.'), { status: 400 }); x = await db(); const old = await x.connection.execute('SELECT * FROM demandas WHERE id = :id FOR UPDATE', { id: req.params.id }, object()); if (!old.rows.length) throw Object.assign(new Error('Demanda não encontrada.'), { status: 404 }); await x.connection.execute(`UPDATE demandas SET ${changed.map((k) => `${k} = :${k}`).join(', ')}, atualizado_em = SYSTIMESTAMP WHERE id = :id`, { ...req.body, id: req.params.id }); for (const campo of changed) await x.connection.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo) VALUES (:id, :autor_id, 'ALTERACAO', :campo, :anterior, :novo)", { id: req.params.id, autor_id: req.body.autor_id, campo, anterior: old.rows[0][campo.toUpperCase()], novo: req.body[campo] }); await x.connection.commit(); res.status(204).end(); } catch (e) { if (x) await x.connection.rollback(); fail(res, e); } finally { if (x) await x.close(); } });

app.delete('/api/demandas/:id', async (req, res) => { let x; try { x = await db(); await x.connection.execute('DELETE FROM demandas WHERE id = :id', { id: req.params.id }); await x.connection.commit(); res.status(204).end(); } catch (e) { if (x) await x.connection.rollback(); fail(res, e); } finally { if (x) await x.close(); } });
app.post('/api/demandas/:id/comentarios', async (req, res) => { let x; try { fields(req.body, ['autor_id', 'texto']); x = await db(); const r = await x.connection.execute('INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto) RETURNING id INTO :id', { demanda_id: req.params.id, ...req.body, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }); await x.connection.commit(); res.status(201).json({ id: r.outBinds.id[0] }); } catch (e) { if (x) await x.connection.rollback(); fail(res, e); } finally { if (x) await x.close(); } });

app.listen(port, () => console.log(`Servidor ouvindo na porta ${port}`));
module.exports = { app };
