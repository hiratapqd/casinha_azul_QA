const Voluntario = require('../models/Voluntario');

exports.criarVoluntario = async (req, res) => {
    try {
        const dados = req.body;
        const forceUpdate = dados.forceUpdate === 'true' || dados.forceUpdate === true;

        const existe = await Voluntario.findById(dados.cpf);
        if (existe && !forceUpdate) {
            return res.json({ status: 'conflito', mensagem: 'CPF ja cadastrado' });
        }

        await Voluntario.findByIdAndUpdate(
            dados.cpf,
            {
                _id: dados.cpf,
                nome: dados.nome,
                telefone: dados.telefone,
                email: dados.email,
                mediunidade: dados.mediunidade,
                esta_ativo: 'Sim',
                disponibilidade: {
                    apometria: dados.disp_apometria || [],
                    reiki: dados.disp_reiki || [],
                    auriculo: dados.disp_auriculo || [],
                    maos: dados.disp_maos || [],
                    homeopatia: dados.disp_homeopatia || [],
                    passe: dados.disp_passe || [],
                    cantina: dados.disp_cantina || [],
                    mesa: dados.disp_mesa || []
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({ status: 'sucesso', acao: 'gravado' });
    } catch (err) {
        if (err.code === 11000) {
            return res.json({ status: 'conflito', mensagem: 'CPF ja cadastrado.' });
        }
        console.error('Erro ao salvar:', err);
        res.status(500).json({ status: 'erro', mensagem: err.message });
    }
};

exports.getVisualizarVoluntarios = async (req, res) => {
    try {
        const { dia, terapia } = req.query;
        const filtro = {};

        if (dia && terapia) {
            filtro[`disponibilidade.${terapia}`] = dia;
        }

        const voluntarios = await Voluntario.find(filtro).sort({ nome: 1 });

        res.render('visualizar_voluntarios', {
            voluntarios,
            filtros: { dia, terapia }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao filtrar voluntarios');
    }
};
