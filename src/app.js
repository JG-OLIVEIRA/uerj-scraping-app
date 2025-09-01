import puppeteer from 'puppeteer'
import express from 'express'
import { MongoClient } from "mongodb"

import 'dotenv/config'

const app = express();

const dbName = "uerjScrapingDatabase";
const collectionName = "disciplinas";

const client = new MongoClient(process.env.URL_MONGODB);

async function insertDisciplinas(disciplinas) {
    await client.connect();

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    try {
        const insertManyResult = await collection.insertMany(disciplinas);
        console.log(`${insertManyResult.insertedCount} documents successfully inserted.\n`);
    } catch (err) {
        console.error(`Something went wrong trying to insert the new documents: ${err}\n`);
    } finally {
        await client.close();
    }
}

async function getAllDisciplinas() {
    await client.connect();

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    try {
        const disciplinas = await collection.find({}).toArray();
        return disciplinas;
    } catch (err) {
        console.error(`Something went wrong trying to get the documents: ${err}\n`);
    } finally {
        await client.close();
    }
}

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

async function scrapeDisciplinas(matricula, senha) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer"
        ] 
    });
    
    const page = await browser.newPage();

    await page.goto('https://www.alunoonline.uerj.br', { waitUntil: 'networkidle2' });

    await page.type('#matricula', matricula);
    await page.type('#senha', senha);
    await page.click('#confirmar');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

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

        if (!disciplina.discipline_id){
            continue;
        } 

        await page.evaluate((id) => {
            consultarDisciplina(output, id);
        }, disciplina.discipline_id);

        await page.waitForSelector('.divContentBlockHeader', { timeout: 5000 });

        const requisitos = await page.evaluate(() => {
        const bloco = Array.from(document.querySelectorAll('.divContentBlock'))
            .find(el => el.querySelector('.divContentBlockHeader')?.innerText.includes('Requisitos da Disciplina'));

        if (!bloco) return [];

        const body = bloco.querySelector('.divContentBlockBody');
        if (!body) return [];

        if (body.innerText.includes('Esta Disciplina não possui requisito para inscrição.')) {
            return [];
        }

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
                    if (turmaDiv) {
                        const turmaInfo = turmaDiv.innerText.replace(/\s+/g, ' ').trim();
                        turmas.push(turmaInfo);
                    }
                }
            });

            return turmas;
        });

        const turmasParsed = turmasRaw.map(turmaStr => {
            return parseTurma(turmaStr);
        });

        disciplina.turmas = turmasParsed;

        console.log(`Extracted ${turmasParsed.length} turmas for disciplina ${disciplina.name}`);

        await page.goBack({ waitUntil: 'networkidle2' });
        await page.waitForSelector('tbody');
    }

    await browser.close();

    return disciplinas;
}

app.get('/disciplinas', async (req, res) => {
  const disciplinas = getAllDisciplinas();
  res.send(disciplinas);
});

app.post('/disciplinas', async (req, res) => {
  const disciplinas = await scrapeDisciplinas(process.env.UERJ_MATRICULA, process.env.UERJ_SENHA);
  insertDisciplinas(disciplinas);
  res.send({ message: disciplinas.length + " disciplinas inseridas no banco de dados." });
});

app.listen(process.env.PORT || 3000);