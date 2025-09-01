import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import express from 'express';
import { MongoClient } from "mongodb";
import 'dotenv/config';

const app = express();

const dbName = "uerjScrapingDatabase";
const collectionName = "disciplines";

const client = new MongoClient(process.env.URL_MONGODB);
let collection; // collection global

// Inicializa MongoDB no startup
async function initMongo() {
    await client.connect();
    const db = client.db(dbName);
    collection = db.collection(collectionName);
    console.log("✅ MongoDB conectado");
}

// Upsert refinado: atualiza só campos que mudaram
async function upsertDisciplinaRefinada(disciplina) {
    try {
        const existing = await collection.findOne({ discipline_id: disciplina.discipline_id });

        if (existing) {
            const updates = {};
            for (const key in disciplina) {
                if (JSON.stringify(disciplina[key]) !== JSON.stringify(existing[key])) {
                    updates[key] = disciplina[key];
                }
            }

            if (Object.keys(updates).length > 0) {
                await collection.updateOne(
                    { discipline_id: disciplina.discipline_id },
                    { $set: updates }
                );
                console.log(`${disciplina.name} atualizada com campos modificados:`, Object.keys(updates));
            } else {
                console.log(`${disciplina.name} não teve alterações.`);
            }
        } else {
            await collection.insertOne(disciplina);
            console.log(`${disciplina.name} inserida.`);
        }
    } catch (err) {
        console.error(`Erro ao inserir/atualizar disciplina: ${err}`);
    }
}

// Buscar todas as disciplinas
async function getAllDisciplinas() {
    try {
        return await collection.find({}).toArray();
    } catch (err) {
        console.error(`Erro ao buscar disciplinas: ${err}\n`);
        return [];
    }
}

// Buscar disciplina por id
async function getDisciplinaById(id) {
    try {
        return await collection.findOne({ discipline_id: id });
    } catch (err) {
        console.error(`Erro ao buscar disciplina ${id}: ${err}\n`);
        return null;
    }
}

// Função que parseia informações de turma
function parseTurma(turmaStr) {
    const turmaObj = {};

    const turmaMatch = turmaStr.match(/TURMA:\s*(\d+)/);
    turmaObj.number = turmaMatch ? turmaMatch[1] : null;

    const prefMatch = turmaStr.match(/Preferencial:\s*(SIM|NÃO)/);
    turmaObj.preferential = prefMatch ? prefMatch[1] : null;

    const temposMatch = turmaStr.match(/Tempos:\s*([A-ZÁÉÍÓÚÃÕÇ0-9\s\w\.\-]+?)(?=Local das Aulas:|Docente:)/);
    turmaObj.times = temposMatch ? temposMatch[1].trim() : null;

    const docenteMatch = turmaStr.match(/Docente:\s*([A-ZÁÉÍÓÚÃÕÇ\s\w\.\-]+)/i);
    turmaObj.teacher = docenteMatch ? docenteMatch[1].trim().replace(/ Vagas.*$/, '') : null;

    const vagasMatch = turmaStr.match(/Vagas Atualizadas da Turma.*?UERJ\s*(\d+)\s*(\d+).*?Vestibular\s*(\d+)\s*(\d+)/s);
    if (vagasMatch) {
        turmaObj.offered_uerj = vagasMatch[1];
        turmaObj.occupied_uerj = vagasMatch[2];
        turmaObj.offered_vestibular = vagasMatch[3];
        turmaObj.occupied_vestibular = vagasMatch[4];
    }

    const solMatch = turmaStr.match(/Vagas para Solicitação de Inscrição.*?UERJ\s*(\d+)\s*(\d+)\s*(\d+).*?Vestibular\s*(\d+)\s*(\d+)\s*(\d+)/s);
    if (solMatch) {
        turmaObj.request_uerj_offered = solMatch[1];
        turmaObj.request_uerj_total = solMatch[2];
        turmaObj.request_uerj_preferential = solMatch[3];
        turmaObj.request_vestibular_offered = solMatch[4];
        turmaObj.request_vestibular_total = solMatch[5];
        turmaObj.request_vestibular_preferential = solMatch[6];
    }

    return turmaObj;
}

// Função de scraping
async function scrapeDisciplinas(matricula, senha) {
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    await page.goto('https://www.alunoonline.uerj.br', { waitUntil: 'domcontentloaded' });

    await page.type('#matricula', matricula);
    await page.type('#senha', senha);
    await page.click('#confirmar');
    
    await page.waitForSelector('a.LINKNAOSUB');

    await page.evaluate(() => {
        console.log('Logged in, navigating to Disciplinas do Currículo...');
        const links = Array.from(document.querySelectorAll('a.LINKNAOSUB'));
        const link = links.find(a => a.textContent.includes('Disciplinas do Currículo'));
        if (link) link.click();
    });

    await page.waitForSelector('tbody');

    const disciplinas = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows
            .filter(row => row.querySelectorAll('th').length === 0 && row.querySelectorAll('td').length >= 9)
            .map(row => {
                const tds = row.querySelectorAll('td');
                const link = tds[0].querySelector('a.LINKNAOSUB');
                let id = null;
                if (link && link.getAttribute('onclick')) {
                    const match = link.getAttribute('onclick').match(/consultarDisciplina\(output,\s*(\d+)\)/);
                    if (match) id = match[1];
                }
                return {
                    name: tds[0].innerText.trim(),
                    period: tds[1].innerText.trim(),
                    attended: tds[2].innerText.trim(),
                    type: tds[3].innerText.trim(),
                    ramification: tds[4].innerText.trim(),
                    credits: tds[5].innerText.trim(),
                    total_hours: tds[6].innerText.trim(),
                    credit_lock: tds[7].innerText.trim(),
                    class_in_period: tds[8].innerText.trim(),
                    discipline_id: id
                };
            });
    });

    console.log(`Found ${disciplinas.length} disciplinas.`);

    for (const disciplina of disciplinas) {
        if (!disciplina.discipline_id) continue;

        await page.evaluate((id) => { consultarDisciplina(output, id); }, disciplina.discipline_id);
        await page.waitForSelector('.divContentBlockHeader', { timeout: 8000 });

        // Requisitos
        const requisitos = await page.evaluate(() => {
            const bloco = Array.from(document.querySelectorAll('.divContentBlock'))
                .find(el => el.querySelector('.divContentBlockHeader')?.innerText.includes('Requisitos da Disciplina'));
            if (!bloco) return [];
            const body = bloco.querySelector('.divContentBlockBody');
            if (!body) return [];
            if (body.innerText.includes('Esta Disciplina não possui requisito para inscrição.')) return [];

            const requisitos = [];
            const linhas = body.querySelectorAll('div[style*="margin-bottom"]');
            if (linhas.length > 0) {
                linhas.forEach(linha => {
                    const tipo = linha.querySelector('b')?.innerText.replace(':', '').trim() || 'Requisito';
                    const desc = linha.querySelector('b')?.parentElement?.nextElementSibling?.innerText.trim() || '';
                    requisitos.push({ tipo, descricao: desc });
                });
            } else {
                const tipo = body.querySelector('b')?.innerText.replace(':', '').trim() || 'Requisito';
                const desc = body.querySelector('b')?.parentElement?.nextElementSibling?.innerText.trim() || body.innerText.trim();
                requisitos.push({ tipo, descricao: desc });
            }
            return requisitos;
        });

        disciplina.requisitos = requisitos;

        // Turmas
        const turmasRaw = await page.evaluate(() => {
            const turmas = [];
            const turmaBlocks = Array.from(document.querySelectorAll('.divContentBlockHeader'))
                .filter(el => el.textContent.includes('Turmas da Disciplina') || el.textContent.includes('Turma da Disciplina'));
            if (turmaBlocks.length === 0) return turmas;

            const turmaTable = turmaBlocks[0].parentElement.querySelector('table');
            if (!turmaTable) return turmas;

            const turmaRows = Array.from(turmaTable.querySelectorAll('tr'));
            turmaRows.forEach(row => {
                const turmaTd = row.querySelector('td');
                if (turmaTd) {
                    const turmaDiv = turmaTd.querySelector('div');
                    if (turmaDiv) turmas.push(turmaDiv.innerText.replace(/\s+/g, ' ').trim());
                }
            });
            return turmas;
        });
        disciplina.turmas = turmasRaw.map(parseTurma);

        console.log(`Extracted ${disciplina.turmas.length} turmas for disciplina ${disciplina.name}`);

        await upsertDisciplinaRefinada(disciplina);

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('tbody');
    }

    await browser.close();

    return disciplinas;
}

// Endpoints Express

// GET todas as disciplinas
app.get('/disciplines', async (req, res) => {
    const disciplinas = await getAllDisciplinas();
    res.send(disciplinas);
});

// GET disciplina específica por ID
app.get('/disciplines/:id', async (req, res) => {
    const disciplina = await getDisciplinaById(req.params.id);
    if (disciplina) {
        res.send(disciplina);
    } else {
        res.status(404).send({ error: 'Disciplina não encontrada' });
    }
});

// POST para atualizar/disparar scraping
app.post('/disciplines', async (req, res) => {
    const disciplinas = await scrapeDisciplinas(process.env.UERJ_MATRICULA, process.env.UERJ_SENHA);
    res.send({ 'Disciplinas atualizadas': disciplinas });
});

// Inicia o servidor só depois de conectar no Mongo
initMongo().then(() => {
    app.listen(process.env.PORT || 3000, () => {
        console.log("🚀 Server rodando");
    });
}).catch(err => {
    console.error("❌ Falha ao conectar no MongoDB:", err);
});
