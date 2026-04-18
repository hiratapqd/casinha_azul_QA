const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const Atendimento = require('../src/models/Atendimento');
const Assistido = require('../src/models/Assistido');

const DEMO_ASSISTIDOS = [
    { cpf: '12345678906', nome: 'Assistido Exemplo 6' },
    { cpf: '12345678907', nome: 'Assistido Exemplo 7' },
    { cpf: '12345678908', nome: 'Assistido Exemplo 8' },
    { cpf: '12345678909', nome: 'Assistido Exemplo 9' }
];

function dataDiasAtras(dias) {
    const data = new Date();
    data.setHours(12, 0, 0, 0);
    data.setDate(data.getDate() - dias);
    return data;
}

function montarAtendimentosDemo() {
    return [
        {
            cpf_assistido: '12345678906',
            nome_assistido: 'Assistido Exemplo 6',
            tipo: 'apometria',
            data: dataDiasAtras(91),
            voluntario: 'Jane Doe',
            observacoes: 'Cenario demo: apometria realizada ha 91 dias.'
        },
        {
            cpf_assistido: '12345678906',
            nome_assistido: 'Assistido Exemplo 6',
            tipo: 'passe',
            data: dataDiasAtras(91),
            voluntario: 'Jack Doe',
            observacoes: 'Cenario demo: passe realizado apos apometria ha 91 dias.'
        },
        {
            cpf_assistido: '12345678907',
            nome_assistido: 'Assistido Exemplo 7',
            tipo: 'apometria',
            data: dataDiasAtras(61),
            voluntario: 'Jane Doe',
            observacoes: 'Cenario demo: apometria realizada ha 61 dias.'
        },
        {
            cpf_assistido: '12345678907',
            nome_assistido: 'Assistido Exemplo 7',
            tipo: 'passe',
            data: dataDiasAtras(61),
            voluntario: 'Jack Doe',
            observacoes: 'Cenario demo: passe realizado apos apometria ha 61 dias.'
        },
        {
            cpf_assistido: '12345678908',
            nome_assistido: 'Assistido Exemplo 8',
            tipo: 'apometria',
            data: dataDiasAtras(31),
            voluntario: 'Jane Doe',
            observacoes: 'Cenario demo: apometria realizada ha 31 dias.'
        },
        {
            cpf_assistido: '12345678908',
            nome_assistido: 'Assistido Exemplo 8',
            tipo: 'passe',
            data: dataDiasAtras(31),
            voluntario: 'Jack Doe',
            observacoes: 'Cenario demo: passe realizado apos apometria ha 31 dias.'
        },
        {
            cpf_assistido: '12345678909',
            nome_assistido: 'Assistido Exemplo 9',
            tipo: 'apometria',
            data: dataDiasAtras(21),
            voluntario: 'Jane Doe',
            observacoes: 'Cenario demo: apometria realizada ha 21 dias.'
        },
        {
            cpf_assistido: '12345678909',
            nome_assistido: 'Assistido Exemplo 9',
            tipo: 'passe',
            data: dataDiasAtras(21),
            voluntario: 'Jack Doe',
            observacoes: 'Cenario demo: passe realizado apos apometria ha 21 dias.'
        },
        {
            cpf_assistido: '12345678909',
            nome_assistido: 'Assistido Exemplo 9',
            tipo: 'reiki',
            data: dataDiasAtras(14),
            voluntario: 'John Doe',
            observacoes: 'Cenario demo: sessao de reiki ha 14 dias.'
        },
        {
            cpf_assistido: '12345678909',
            nome_assistido: 'Assistido Exemplo 9',
            tipo: 'reiki',
            data: dataDiasAtras(7),
            voluntario: 'John Doe',
            observacoes: 'Cenario demo: sessao de reiki ha 7 dias.'
        },
        {
            cpf_assistido: '12345678909',
            nome_assistido: 'Assistido Exemplo 9',
            tipo: 'reiki',
            data: dataDiasAtras(2),
            voluntario: 'John Doe',
            observacoes: 'Cenario demo: sessao de reiki ha 2 dias.'
        }
    ];
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI nao encontrado no .env.');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const cpfs = DEMO_ASSISTIDOS.map((item) => item.cpf);
    const atendimentos = montarAtendimentosDemo();

    await Assistido.bulkWrite(
        DEMO_ASSISTIDOS.map((assistido) => ({
            updateOne: {
                filter: { _id: assistido.cpf },
                update: {
                    $set: {
                        nome_assistido: assistido.nome,
                        status: 'Ativo'
                    }
                },
                upsert: true
            }
        }))
    );

    await Atendimento.deleteMany({
        cpf_assistido: { $in: cpfs },
        tipo: { $in: ['apometria', 'passe', 'reiki'] }
    });

    await Atendimento.insertMany(atendimentos);

    console.log(`Cenario demo inserido com sucesso: ${atendimentos.length} atendimentos.`);
    atendimentos.forEach((item) => {
        console.log(
            `${item.cpf_assistido} | ${item.tipo} | ${item.data.toLocaleDateString('pt-BR')} | ${item.nome_assistido}`
        );
    });
}

main()
    .catch((err) => {
        console.error('Erro ao inserir cenario demo:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    });
