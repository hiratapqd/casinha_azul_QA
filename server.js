require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Atendimento = require('./models/Atendimento');
const Voluntario = require('./models/Voluntario');
const Assistido = require('./models/Assistido');
const Solicitacao = require('./models/Solicitacao');
const app = express();

// --- CONFIGURAÇÕES ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CONEXÃO COM MONGODB ---
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Conectado ao MongoDB Atlas (casinha_azul)"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

app.use(async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    if (!db) {
      res.locals.terapias = [];
      return next();
    }

    const terapiasAtivas = await db.collection("terapias")
      .find({ ativa: true })
      .sort({ ordem: 1, nome: 1 })
      .toArray();

    res.locals.terapias = terapiasAtivas;
    next();
  } catch (err) {
    console.error("Erro ao carregar terapias para o menu:", err);
    res.locals.terapias = [];
    next();
  }
});
function getTimeZoneOffsetMs(date, timeZone) {
  // Retorna o offset (timezone - UTC) em ms para "date" naquele timeZone.
  // Ex.: Sao_Paulo (UTC-3) => -10800000
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const asIfUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asIfUTC - date.getTime();
}

function dataComHoraAtualNoFuso(dataYYYYMMDD, timeZone = "America/Sao_Paulo") {
  const agora = new Date();

  // pega a hora/min/seg "atuais" no fuso desejado
  const dtfTime = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const timeParts = dtfTime.formatToParts(agora);
  const t = {};
  for (const p of timeParts) if (p.type !== "literal") t[p.type] = p.value;

  const [ano, mes, dia] = String(dataYYYYMMDD).split("-").map(Number);

  // 1) cria um "rascunho" interpretando os componentes como UTC
  const draft = new Date(Date.UTC(
    ano, mes - 1, dia,
    Number(t.hour), Number(t.minute), Number(t.second),
    agora.getUTCMilliseconds()
  ));

  // 2) calcula o offset real desse instante no fuso desejado
  const offsetMs = getTimeZoneOffsetMs(draft, timeZone);

  // 3) ajusta para o instante real
  return new Date(draft.getTime() - offsetMs);
}

// --- ROTAS DE NAVEGAÇÃO ---
// Verifique se esta rota exata existe no seu server.js
app.get('/api/assistido/:cpf', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        // Buscamos pelo _id pois no seu sistema o CPF é a chave primária
        const assistido = await db.collection('assistidos').findOne({ _id: req.params.cpf });
        
        if (assistido) {
            res.json(assistido);
        } else {
            res.status(404).json({ mensagem: "Não encontrado" });
        }
    } catch (err) {
        console.error("Erro na API de busca:", err);
        res.status(500).json(null);
    }
});
// Redireciona a raiz para a página de apometria
app.get('/', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const hoje_inicio = new Date();
        hoje_inicio.setHours(0, 0, 0, 0);

        // 1. Total de Voluntários Ativos
        const totalVoluntarios = await db.collection('voluntarios').countDocuments({ esta_ativo: "Sim" });

        // 2. Atendimentos realizados hoje
        const atendimentosHoje = await db.collection('atendimento').countDocuments({ 
            data: { $gte: hoje_inicio } 
        });

        // 3. Total Geral de Assistidos (para o cálculo da porcentagem)
        const totalAssistidos = await db.collection('assistidos').countDocuments();

        // 4. Assistidos "Somente 1 Apometria e nenhuma outra terapia" (Excluindo os de hoje)
        const assistidosAntigos = await db.collection('atendimento').aggregate([
            { $match: { data: { $lt: hoje_inicio } } },
            { 
                $group: { 
                    _id: "$cpf_assistido", 
                    terapias: { $addToSet: "$tipo" } 
                } 
            },
            { 
                $match: { 
                    terapias: ["apometrico"] 
                } 
            }
        ]).toArray();

        const totalSomenteApometria = assistidosAntigos.length;

        // 5. Cálculo da Taxa de Abandono
        const taxa = totalAssistidos > 0 
            ? ((totalSomenteApometria / totalAssistidos) * 100).toFixed(1) 
            : 0;

    // 6. Terapias ativas (menu)
    const terapiasAtivas = await db.collection('terapias')
      .find({ ativa: true })
      .sort({ ordem: 1, nome: 1 })
      .toArray();

    res.render('index', {
      resumo: {
                voluntarios: totalVoluntarios,
                hoje: atendimentosHoje,
                apometriaUnica: totalSomenteApometria,
                taxaAbandono: taxa // Envia o valor que estava faltando 
            },
      terapias: terapiasAtivas
    });
    } catch (err) {
        console.error(err);
        res.render('index', { resumo: { voluntarios: 0, hoje: 0, apometriaUnica: 0, taxaAbandono: 0 }, terapias: [] });
    }
});

app.get('/cadastro', (req, res) => res.render('cadastro'));
app.get('/solicitacao_atendimento', (req, res) => res.render('solicitacao_atendimento'));
// Rota para abrir a página de Reiki
app.get('/atendimento/reiki', async (req, res) => {
    res.render('atendimento/reiki');
});
app.get('/atendimento/passe', (req, res) => res.render('atendimento/passe'));
app.get('/atendimento/auriculo', (req, res) => res.render('atendimento/auriculo'));
app.get('/atendimento/maos_sem_fronteiras', (req, res) => res.render('atendimento/maos_sem_fronteiras'));
app.get('/atendimento/homeopatico', (req, res) => res.render('atendimento/homeopatico'));
app.get('/cadastro_mediuns', (req, res) => res.render('cadastro_mediuns')); 


// Abre a página de atendimento apometrico
app.get('/atendimento/apometrico', (req, res) => {
    res.render('atendimento/apometrico', { atendimentos: [] });
});

app.get('/api/historico/:tipo/:cpf', async (req, res) => {
  try {
    const { tipo, cpf } = req.params;

    // 1) Busca histórico
    const historico = await Atendimento.find({
      cpf_assistido: cpf,
      tipo: tipo
    })
      .sort({ data: -1 })
      .limit(12)
      .lean();

    // 2) Busca assistido (SEM derrubar a rota se falhar)
    let assistido = null;
    try {
      const db = mongoose.connection.db;
      const doc = await db.collection('assistidos').findOne({ _id: cpf }); // sem projection
      if (doc) {
        assistido = { cpf, nome: doc.nome || "" };
      }
    } catch (e) {
      console.error("⚠️ Falha ao buscar assistido:", e);
      // continua mesmo assim
    }

    res.json({ assistido, historico });
  } catch (err) {
    console.error("❌ Erro /api/historico:", err);
    res.status(500).json({ erro: err.message || "Erro ao buscar histórico" });
  }
});

// ROTA PARA SALVAR SOLICITAÇÃO DE ATENDIMENTO APOMETRICO
app.get('/solicitacao_atendimento', async (req, res) => {
    const db = mongoose.connection.db;
    res.render('solicitacao_atendimento', { bloqueado: false }); 
});
// ROTA PARA ATENDIMENTO DINÂMICO (REIKI, AURICULO, HOMEOPATICO, MAOS SEM FRONTEIRAS, ETC)
app.post('/atendimento/:tipo', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const { tipo } = req.params;

    // valida se a terapia existe e está ativa
    const terapia = await db.collection('terapias').findOne({ slug: tipo, ativa: true });
    if (!terapia) {
      return res.status(400).send("Tipo de atendimento inválido ou inativo.");
    }

    // data + hora real (se você ainda usa a função)
    const dataSelecionada = (req.body.data || "").trim();
    const dataFinal = dataSelecionada
      ? dataComHoraAtualNoFuso(dataSelecionada, "America/Sao_Paulo")
      : new Date();

    const atendimento = new Atendimento({
      data: dataFinal,
      cpf_assistido: req.body.cpf_assistido,
      nome_assistido: req.body.nome_assistido,
      voluntario: req.body.voluntario,
      observacoes: req.body.observacoes,
      tipo: terapia.slug
    });

    await atendimento.save();
    return res.status(200).send("OK");

  } catch (err) {
    console.error("Erro ao salvar atendimento:", err);
    return res.status(500).send("Erro ao salvar: " + (err.message || err));
  }
});
// ROTA PARA ESCALA DE VOLUNTÁRIOS
app.get('/voluntarios/escala', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const { dia, terapia } = req.query;
        let voluntariosFiltrados = [];

        if (dia && terapia) {
            // A consulta usa a notação de ponto para acessar o subcampo dinâmico

            const query = {};
            query[`disponibilidade.${terapia}`] = dia;

            voluntariosFiltrados = await db.collection('voluntarios')
                .find(query)
                .sort({ nome: 1 })
                .toArray();
        }

        res.render('visualizar_voluntarios', { 
            voluntarios: voluntariosFiltrados, 
            filtros: { dia, terapia } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erro ao buscar escala.");
    }
});
app.use(express.urlencoded({ extended: true }));

// --- ROTA PARA SALVAR ATENDIMENTO APOMETRICO ---
app.post('/atendimento/apometrico', async (req, res) => {
  try {

    const dataSelecionada = req.body.data; // YYYY-MM-DD
    const agora = new Date();

    // separa ano, mês, dia do input
    const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

    // cria data com a hora atual
    const dataComHora = new Date(Date.UTC(
      ano,
      mes - 1,
      dia,
      agora.getUTCHours(),
      agora.getUTCMinutes(),
      agora.getUTCSeconds(),
      agora.getUTCMilliseconds()
    ));

    const atendimento = new Atendimento({
      data: dataComHora,
      cpf_assistido: req.body.cpf_assistido,
      nome_assistido: req.body.nome_assistido,
      voluntario: req.body.voluntario,
      observacoes: req.body.observacoes,
      tipo: "apometrico"
    });

    await atendimento.save();

    res.status(200).send("OK");

  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao salvar");
  }
});

// --- ROTA PARA SALVAR ATENDIMENTO Auriculo ---
app.post('/atendimento/auriculo', async (req, res) => {
    try {
        console.log("Recebendo dados para salvar:", req.body);
        const novoAtendimento = new Atendimento(req.body);
        await novoAtendimento.save();
        console.log("✅ Atendimento salvo com sucesso!");
        res.redirect('/atendimento/auriculo');
    } catch (error) {
        console.error("❌ Erro ao salvar atendimento:", error);
        res.status(500).send("Erro ao salvar: " + error.message);
    }
});

// --- ROTA PARA SALVAR CADASTRO DE VOLUNTÁRIOS ---
app.post('/mediun/novo', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const cpf = req.body.cpf;
        const forceUpdate = req.body.forceUpdate === 'true'; 

        // Busca se o voluntário já existe
        const voluntarioExistente = await db.collection('voluntarios').findOne({ _id: cpf });

        // Se existe e o usuário ainda não confirmou a atualização
        if (voluntarioExistente && !forceUpdate) {
            return res.json({ status: 'conflito', mensagem: 'CPF já cadastrado.' });
        }

        const disponibilidade = {
            apometria: req.body.voluntario_apometria_dias || [],
            reiki: req.body.voluntario_reiki_dias || [],
            auriculo: req.body.voluntario_auriculo_dias || [],
            maos: req.body.voluntario_maos_dias || [],
            homeopatia: req.body.voluntario_homeopatia_dias || [],
            cantina: req.body.voluntario_cantina_dias || [],
            mesa: req.body.voluntario_mesa_dias || []
        };

        const dadosVoluntario = {
            nome: req.body.nome,
            telefone: req.body.telefone,
            email: req.body.email,
            mediunidade: req.body.mediunidade,
            disponibilidade: disponibilidade,
            esta_ativo: "Sim",
            data_cadastro_voluntario: voluntarioExistente ? voluntarioExistente.data_cadastro_voluntario : new Date().toISOString().split('T')[0]
        };

        if (voluntarioExistente) {
            // ATUALIZA
            await db.collection('voluntarios').updateOne({ _id: cpf }, { $set: dadosVoluntario });
            return res.json({ status: 'sucesso', acao: 'atualizado' });
        } else {
            // INSERE NOVO
            await db.collection('voluntarios').insertOne({ _id: cpf, ...dadosVoluntario });
            return res.json({ status: 'sucesso', acao: 'inserido' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'erro' });
    }
});

// --- ROTA DE CADASTRO DE ASSISTIDO ---
app.post('/assistido/novo', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const cpf = req.body.cpf;

        // 1. Verifica se o assistido já existe
        const assistidoExistente = await db.collection('assistidos').findOne({ _id: cpf });

        if (assistidoExistente) {
            // Se existir, enviamos o status 'existente' e o nome para o alerta
            return res.json({ 
                status: 'existente', 
                nome: assistidoExistente.nome 
            });
        }

        // 2. Se não existe, procede com a gravação normal
        const novoAssistido = {
            _id: cpf,
            nome: req.body.nome,
            telefone: req.body.telefone,
            email: req.body.email,
            data_cadastro: new Date().toISOString().split('T')[0]
        };

        await db.collection('assistidos').insertOne(novoAssistido);
        res.json({ status: 'sucesso' });

    } catch (err) {
        console.error("Erro ao cadastrar assistido:", err);
        res.status(500).json({ status: 'erro' });
    }
});
// ROTA DE GRAVAÇÃO DA SOLICITAÇÃO
app.post('/atendimento/solicitacao', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const dataInput = req.body.data;
        const dataInicio = new Date(dataInput);
        dataInicio.setUTCHours(0,0,0,0);
        const dataFim = new Date(dataInput);
        dataFim.setUTCHours(23,59,59,999);

        // 1. Pegar o dia da semana para o limite
        const diasSemana = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
        const nomeDia = diasSemana[new Date(dataInput).getUTCDay()];

        // 2. Buscar o limite na coleção limite_atendimento
        const regra = await db.collection('limite_atendimento').findOne({ 
            terapia: "Apometria", 
            dia_semana: nomeDia 
        });
        const limiteMax = regra ? parseInt(regra.qtos_atendimentos) : 0;

        // 3. Contar quantas solicitações já existem para este dia específico
        const totalExistente = await Solicitacao.countDocuments({ 
            data_pedido: { $gte: dataInicio, $lte: dataFim } 
        });

        const posicaoAtual = totalExistente + 1; // A posição desta pessoa
        let statusFinal = "Aprovado";
        let msgExtra = "Confirmado";

        if (posicaoAtual > limiteMax) {
            statusFinal = "Pendente";
            msgExtra = "Lista de Espera";
        }

        const novaSolicitacao = new Solicitacao({
            data_pedido: dataInput,
            cpf_assistido: req.body.cpf_assistido,
            nome_assistido: req.body.nome,
            status: statusFinal,
            observacoes: `Senha: ${posicaoAtual}/${limiteMax} - ${req.body.queixa}`
        });

        await novaSolicitacao.save();

        // Redireciona com os dados para o SweetAlert
        res.redirect(`/solicitacao_atendimento?sucesso=true&posicao=${posicaoAtual}&limite=${limiteMax}&status=${statusFinal}`);
    } catch (error) {
        res.status(500).send("Erro: " + error.message);
    }
});

//ROTA PARA RELATÓRIO DE ABANDONO - APOMETRIA
app.get('/relatorios/apometria-inativos', async (req, res) => {
  try {
    const db = mongoose.connection.db;

    const agora = new Date();
    const limite30 = new Date(agora); limite30.setDate(limite30.getDate() - 30);
    const limite60 = new Date(agora); limite60.setDate(limite60.getDate() - 60);
    const limite90 = new Date(agora); limite90.setDate(limite90.getDate() - 90);

    // Pipeline base: por CPF, pega:
    // - ultimaData (qualquer tipo)
    // - teveApometria (se existe pelo menos 1 apometrico)
    const base = await db.collection('atendimento').aggregate([
      {
        $group: {
          _id: "$cpf_assistido",
          ultimaData: { $max: "$data" },
          teveApometria: {
            $max: {
              $cond: [{ $eq: ["$tipo", "apometrico"] }, 1, 0]
            }
          }
        }
      },
      // precisa ter apometria em algum momento
      { $match: { teveApometria: 1 } },

      // traz dados do assistido (no seu caso assistidos._id = cpf)
      {
        $lookup: {
          from: "assistidos",
          localField: "_id",
          foreignField: "_id",
          as: "assistido"
        }
      },
      { $unwind: { path: "$assistido", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 0,
          cpf: "$_id",
          nome: { $ifNull: ["$assistido.nome", ""] },
          telefone: { $ifNull: ["$assistido.telefone", ""] },
          email: { $ifNull: ["$assistido.email", ""] },
          ultimaData: 1
        }
      }
    ]).toArray();

    // filtra em memória por 30/60/90 (simples e rápido para volumes pequenos/médios)
    const lista30 = base.filter(x => x.ultimaData && new Date(x.ultimaData) < limite30);
    const lista60 = base.filter(x => x.ultimaData && new Date(x.ultimaData) < limite60);
    const lista90 = base.filter(x => x.ultimaData && new Date(x.ultimaData) < limite90);

    // padrão: mostra a lista de 60 dias
    res.render('relatorios/apometria_inativos', {
      counts: { d30: lista30.length, d60: lista60.length, d90: lista90.length },
      listas: { d30: lista30, d60: lista60, d90: lista90 }
    });

  } catch (err) {
    console.error("Erro relatório apometria-inativos:", err);
    res.status(500).send("Erro ao gerar relatório.");
  }
});

//ROTA PARA RELATÓRIO DE ATENDIMENTOS DE HOJE (TODOS TIPOS) - COM FILTRO POR TERAPIA E CONTAGEM PARA OS BOTÕES
app.get('/relatorios/atendimentos-hoje', async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // HOJE em UTC (combina com o que você já usou nos cards)
    const inicio = new Date();
    inicio.setUTCHours(0, 0, 0, 0);

    const fim = new Date(inicio);
    fim.setUTCDate(inicio.getUTCDate() + 1);

    // terapias para os botões (se você já usa a collection 'terapias', aproveitamos)
    const terapiasAtivas = await db.collection('terapias')
      .find({ ativa: true })
      .sort({ ordem: 1, nome: 1 })
      .toArray();

    // atendimentos de hoje (todos os tipos)
    const atendimentos = await db.collection('atendimento')
      .find({ data: { $gte: inicio, $lt: fim } })
      .sort({ data: -1 })
      .toArray();

    // total por tipo (para mostrar no botão)
    const contagemPorTipo = await db.collection('atendimento').aggregate([
      { $match: { data: { $gte: inicio, $lt: fim } } },
      { $group: { _id: "$tipo", total: { $sum: 1 } } }
    ]).toArray();

    const counts = {};
    contagemPorTipo.forEach(x => { counts[x._id] = x.total; });

    res.render('relatorios/atendimentos_hoje', {
      atendimentos,
      terapias: terapiasAtivas, // para montar os botões
      counts
    });

  } catch (err) {
    console.error("Erro relatório atendimentos-hoje:", err);
    res.status(500).send("Erro ao gerar relatório.");
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});