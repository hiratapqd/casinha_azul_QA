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
    .then(() => console.log("✅ Conectado ao MongoDB Atlas Mar_7_08:11"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// Middleware Global
app.use(async (req, res, next) => {
    try {
        const db = mongoose.connection.db;
        if (!db) { res.locals.terapias = []; return next(); }
        const terapiasAtivas = await db.collection("terapias").find({ ativa: true }).sort({ ordem: 1 }).toArray();
        res.locals.terapias = terapiasAtivas;
        next();
    } catch (err) {
        next();
    }
});

// --- ROTA DE FORMULARIOS ---
app.get('/cadastro', (req, res) => res.render('cadastro_assistidos'));
app.get('/', async (req, res) => {
    try {
        const hojeInicio = new Date();
        hojeInicio.setHours(0, 0, 0, 0);
        const hojeFim = new Date();
        hojeFim.setHours(23, 59, 59, 999);

        const dataCorteAbandono = new Date();
        dataCorteAbandono.setDate(dataCorteAbandono.getDate() - 14);

        // 1. Atendimentos e Abandono
        const totalAtendimentosHoje = await Atendimento.countDocuments({
            data: { $gte: hojeInicio, $lte: hojeFim }
        });

        const analiseAbandono = await Atendimento.aggregate([
            { $match: { tipo: 'apometrico' } },
            { $group: { _id: "$cpf_assistido", total: { $sum: 1 }, ultimaData: { $max: "$data" } } },
            { $match: { total: 1, ultimaData: { $lt: dataCorteAbandono } } }
        ]);

        const totalAssistidosGeral = await Atendimento.distinct("cpf_assistido");
        const totalAbandono = analiseAbandono.length;
        const porcentagemAbandono = totalAssistidosGeral.length > 0 
            ? ((totalAbandono / totalAssistidosGeral.length) * 100).toFixed(1) 
            : 0;

        // 2. Voluntários (Ajustado para a estrutura JSON real)
        const voluntariosDB = await Voluntario.find({ esta_ativo: "Sim" }).lean(); // .lean() faz o Mongoose virar JSON puro
        
        const diasTraducao = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
        const hojeAbrev = diasTraducao[new Date().getDay()];

        const labelsFormatados = {
            apometria: "Apometria",
            reiki: "Reiki",
            auriculo: "Aurículo",
            maos: "Mãos sem Fronteiras",
            homeopatia: "Homeopático",
            passe: "Passe",
            cantina: "Cantina",
            mesa: "Mesa"
        };

        const contagemPorTipo = {};
        Object.keys(labelsFormatados).forEach(key => contagemPorTipo[key] = 0);
        const escala_hoje = [];

        voluntariosDB.forEach(v => {
            // Acedemos ao objeto disponibilidade que vimos no teste
            const disp = v.disponibilidade || {};

            for (let mod in labelsFormatados) {
                let diasRaw = disp[mod];

                if (!diasRaw) continue;

                // Converte para array (caso venha string do formulário)
                let listaDias = Array.isArray(diasRaw) ? diasRaw : [diasRaw];

                if (listaDias.length > 0) {
                    contagemPorTipo[mod]++;

                    // Verifica se o dia de hoje (ex: 'sex') está na lista
                    if (listaDias.includes(hojeAbrev)) {
                        escala_hoje.push({ 
                            nome: v.nome, 
                            tipo: labelsFormatados[mod] 
                        });
                    }
                }
            }
        });

        // Prepara o objeto para o index.ejs
        const resumoFinal = {};
        for (let chave in contagemPorTipo) {
            resumoFinal[labelsFormatados[chave]] = contagemPorTipo[chave];
        }

        res.render('index', {
            resumo: {
                hoje: totalAtendimentosHoje,
                taxaAbandono: porcentagemAbandono,
                apometriaUnica: totalAbandono, 
                voluntariosPorTipo: resumoFinal,
                totalVoluntarios: voluntariosDB.length
            },
            escala_hoje
        });

    } catch (err) {
        console.error("Erro Dashboard:", err);
        res.status(500).send("Erro ao carregar painel.");
    }
});

app.get('/solicitacao_atendimento', (req, res) => res.render('solicitacao_atendimento'));
app.get('/cadastro_mediuns', (req, res) => {
    res.render('cadastro_mediuns');
});
app.get('/atendimento/apometrico', (req, res) => {
    res.render('atendimento/apometrico', { atendimentos: [] });
});
app.get('/atendimento/reiki', async (req, res) => {
    res.render('atendimento/reiki');
});

app.get('/relatorios/todos-assistidos', async (req, res) => {
    try {
        // Busca todos os assistidos e ordena por nome
        const assistidos = await Assistido.find().sort({ nome: 1 }).lean();
        
        res.render('relatorios/relatorio_assistidos', { assistidos });
    } catch (err) {
        console.error("Erro ao gerar relatório de assistidos:", err);
        res.status(500).send("Erro ao carregar relatório.");
    }
});
app.get('/atendimento/auriculo', (req, res) => res.render('atendimento/auriculo'));
app.get('/atendimento/maos_sem_fronteiras', (req, res) => res.render('atendimento/maos_sem_fronteiras'));
app.get('/atendimento/homeopatico', (req, res) => res.render('atendimento/homeopatico'));
app.get('/cadastro_mediuns', (req, res) => res.render('cadastro_mediuns')); 
app.get('/atendimento/passe', (req, res) => res.render('atendimento/passe'));
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

// --- ROTA DE CADASTRO  ---
app.post('/mediun/novo', async (req, res) => {
    try {
        const { cpf, forceUpdate } = req.body;
        const voluntarioExistente = await Voluntario.findOne({ cpf });

        if (voluntarioExistente && forceUpdate !== 'true') {
            return res.json({ status: 'conflito' });
        }

        const dadosVoluntario = {
            nome: req.body.nome,
            cpf: req.body.cpf,
            telefone: req.body.telefone,
            email: req.body.email,
            mediunidade: req.body.mediunidade,
            esta_ativo: req.body.esta_ativo || "Sim",
            disponibilidade: {
                apometria: req.body.voluntario_apometria_dias || [],
                reiki: req.body.voluntario_reiki_dias || [],
                auriculo: req.body.voluntario_auriculo_dias || [],
                maos: req.body.voluntario_maos_dias || [],
                homeopatia: req.body.voluntario_homeopatia_dias || [],
                cantina: req.body.voluntario_cantina_dias || [],
                passe: req.body.voluntario_passe_dias || [],
                mesa: req.body.voluntario_mesa_dias || []
            }
        };

        if (voluntarioExistente) {
            await Voluntario.updateOne({ cpf }, dadosVoluntario);
            res.json({ status: 'sucesso', acao: 'atualizado' });
        } else {
            const novoVoluntario = new Voluntario(dadosVoluntario);
            await novoVoluntario.save();
            res.json({ status: 'sucesso', acao: 'criado' });
        }
    } catch (err) {
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

// --- OUTRAS ROTAS ---
app.get('/assistido/novo', (req, res) => res.render('cadastro_assistidos'));

app.post('/atendimento/novo', async (req, res) => {
    try {
        const novoAtendimento = new Atendimento({ ...req.body, data: new Date() });
        await novoAtendimento.save();
        res.redirect('/');
    } catch (err) {
        res.status(500).send("Erro ao salvar atendimento");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor pronto na porta http://localhost:${PORT}`));