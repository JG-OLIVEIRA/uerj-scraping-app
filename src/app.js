import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import express from 'express';
import { MongoClient } from "mongodb";
import 'dotenv/config';

const app = express();

const dbName = "uerjScrapingDatabase";
const collectionName = "disciplines";

const client = new MongoClient(process.env.URL_MONGODB);
let collection;

async function initMongo() {
    await client.connect();
    const db = client.db(dbName);
    collection = db.collection(collectionName);
    console.log("✅ MongoDB conectado");
}

async function upsertDiscipline(discipline) {
    try {
        const existing = await collection.findOne({ discipline_id: discipline.discipline_id });

        if (existing) {
            const updates = {};
            for (const key in discipline) {
                if (JSON.stringify(discipline[key]) !== JSON.stringify(existing[key])) {
                    updates[key] = discipline[key];
                }
            }

            if (Object.keys(updates).length > 0) {
                await collection.updateOne(
                    { discipline_id: discipline.discipline_id },
                    { $set: updates }
                );
                console.log(`${discipline.name} atualizada com campos modificados:`, Object.keys(updates));
            } else {
                console.log(`${discipline.name} não teve alterações.`);
            }
        } else {
            await collection.insertOne(discipline);
            console.log(`${discipline.name} inserida.`);
        }
    } catch (err) {
        console.error(`Erro ao inserir/atualizar disciplina: ${err}`);
    }
}

async function getAllDisciplines() {
    try {
        return await collection.find({}).toArray();
    } catch (err) {
        console.error(`Erro ao buscar disciplinas: ${err}\n`);
        return [];
    }
}

async function getDisciplineById(id) {
    try {
        return await collection.findOne({ discipline_id: id });
    } catch (err) {
        console.error(`Erro ao buscar disciplina ${id}: ${err}\n`);
        return null;
    }
}

function parseClass(classStr) {
    const classObj = {};

    const classMatch = classStr.match(/TURMA:\s*(\d+)/);
    classObj.number = classMatch ? classMatch[1] : null;

    const prefMatch = classStr.match(/Preferencial:\s*(SIM|NÃO)/);
    classObj.preferential = prefMatch ? prefMatch[1] : null;

    const temposMatch = classStr.match(/Tempos:\s*([A-ZÁÉÍÓÚÃÕÇ0-9\s\w\.\-]+?)(?=Local das Aulas:|Docente:)/);
    classObj.times = temposMatch ? temposMatch[1].trim() : null;

    const teacherMatch = classStr.match(/Docente:\s*([A-ZÁÉÍÓÚÃÕÇ\s\w\.\-]+)/i);
    classObj.teacher = teacherMatch ? teacherMatch[1].trim().replace(/ Vagas.*$/, '') : null;

    const vagasMatch = classStr.match(/Vagas Atualizadas da Turma.*?UERJ\s*(\d+)\s*(\d+).*?Vestibular\s*(\d+)\s*(\d+)/s);
    if (vagasMatch) {
        classObj.offered_uerj = vagasMatch[1];
        classObj.occupied_uerj = vagasMatch[2];
        classObj.offered_vestibular = vagasMatch[3];
        classObj.occupied_vestibular = vagasMatch[4];
    }

    const solMatch = classStr.match(/Vagas para Solicitação de Inscrição.*?UERJ\s*(\d+)\s*(\d+)\s*(\d+).*?Vestibular\s*(\d+)\s*(\d+)\s*(\d+)/s);
    if (solMatch) {
        classObj.request_uerj_offered = solMatch[1];
        classObj.request_uerj_total = solMatch[2];
        classObj.request_uerj_preferential = solMatch[3];
        classObj.request_vestibular_offered = solMatch[4];
        classObj.request_vestibular_total = solMatch[5];
        classObj.request_vestibular_preferential = solMatch[6];
    }

    return classObj;
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

    const disciplines = await page.evaluate(() => {
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

    console.log(`Found ${disciplines.length} disciplinas.`);

    for (const discipline of disciplines) {
        if (!discipline.discipline_id) continue;

        await page.evaluate((id) => { consultarDisciplina(output, id); }, discipline.discipline_id);
        await page.waitForSelector('.divContentBlockHeader', { timeout: 8000 });


        const requirements = await page.evaluate(() => {
            const block = Array.from(document.querySelectorAll('.divContentBlock'))
                .find(el => el.querySelector('.divContentBlockHeader')?.innerText.includes('Requisitos da Disciplina'));
            if (!block) return [];
            const body = block.querySelector('.divContentBlockBody');
            if (!body) return [];
            if (body.innerText.includes('Esta Disciplina não possui requisito para inscrição.')) return [];

            const requirements = [];
            const lines = body.querySelectorAll('div[style*="margin-bottom"]');
            if (lines.length > 0) {
                lines.forEach(line => {
                    const type = line.querySelector('b')?.innerText.replace(':', '').trim() || 'Requisito';
                    const desc = line.querySelector('b')?.parentElement?.nextElementSibling?.innerText.trim() || '';
                    requirements.push({ type, description: desc });
                });
            } else {
                const type = body.querySelector('b')?.innerText.replace(':', '').trim() || 'Requisito';
                const description = body.querySelector('b')?.parentElement?.nextElementSibling?.innerText.trim() || body.innerText.trim();
                requirements.push({ type, description });
            }
            return requirements;
        });

        discipline.requirements = requirements;

        console.log(`Extracted ${discipline.requirements.length} requirements for disciplina ${discipline.name}`);

        const classesRaw = await page.evaluate(() => {
            const classes = [];
            const classBlocks = Array.from(document.querySelectorAll('.divContentBlockHeader'))
                .filter(el => el.textContent.includes('Turmas da Disciplina') || el.textContent.includes('Turma da Disciplina'));
            if (classBlocks.length === 0) return classes;

            const classTable = classBlocks[0].parentElement.querySelector('table');
            if (!classTable) return classes;

            const classRows = Array.from(classTable.querySelectorAll('tr'));
            classRows.forEach(row => {
                const classTd = row.querySelector('td');
                if (classTd) {
                    const classDiv = classTd.querySelector('div');
                    if (classDiv) classes.push(classDiv.innerText.replace(/\s+/g, ' ').trim());
                }
            });
            return classes;
        });

        discipline.classes = classesRaw.map(parseClass);

        console.log(`Extracted ${discipline.classes.length} classes for disciplina ${discipline.name}`);

        await upsertDiscipline(discipline);

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('tbody');
    }

    await browser.close();

    return disciplines;
}

app.use(express.json());

app.get('/disciplines', async (req, res) => {
    const disciplines = await getAllDisciplines();
    res.send(disciplines);
});

app.get('/disciplines/:id', async (req, res) => {
    const discipline = await getDisciplineById(req.params.id);
    if (discipline) {
        res.send(discipline);
    } else {
        res.status(404).send({ error: 'Disciplina não encontrada' });
    }
});

app.post('/disciplines', async (req, res) => {
    const { matricula, senha } = req.body;

    if (!matricula || !senha) {
        return res.status(400).send({ error: 'Matrícula e senha são obrigatórios' });
    }

    await scrapeDisciplinas(matricula, senha);

    res.send({ status: 'Disciplinas atualizadas' });
});

initMongo().then(() => {
    app.listen(process.env.PORT || 3000, () => {
        console.log("🚀 Server rodando");
    });
}).catch(err => {
    console.error("❌ Falha ao conectar no MongoDB:", err);
});
