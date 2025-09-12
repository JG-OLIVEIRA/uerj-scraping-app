import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { upsertDiscipline } from '../db/mongo.js';

function parseClass(classStr) {
    const classObj = {};

    const classMatch = classStr.match(/TURMA:\s*(\d+)/);
    classObj.number = classMatch ? classMatch[1] : null;

    const prefMatch = classStr.match(/Preferencial:\s*(SIM|NÃO)/);
    classObj.preferential = prefMatch ? prefMatch[1] : null;

    const timesMatch = classStr.match(/Tempos:\s*([A-ZÁÉÍÓÚÃÕÇ0-9\s\w\.\-]+?)(?=Local das Aulas:|Docente:)/);
    classObj.times = timesMatch ? timesMatch[1].trim() : null;

    const teacherMatch = classStr.match(/Docente:\s*([A-ZÁÉÍÓÚÃÕÇ\s\w\.\-]+)/i);
    classObj.teacher = teacherMatch ? teacherMatch[1].trim().replace(/ Vagas.*$/, '') : null;

    const vagasMatch = classStr.match(/Vagas Atualizadas da Turma.*?UERJ\s*(\d+)\s*(\d+).*?Vestibular\s*(\d+)\s*(\d+)/s);
    if (vagasMatch) {
        classObj.offeredUerj = vagasMatch[1];
        classObj.occupiedUerj = vagasMatch[2];
        classObj.offeredVestibular = vagasMatch[3];
        classObj.occupiedVestibular = vagasMatch[4];
    }

    const solMatch = classStr.match(/Vagas para Solicitação de Inscrição.*?UERJ\s*(\d+)\s*(\d+)\s*(\d+).*?Vestibular\s*(\d+)\s*(\d+)\s*(\d+)/s);
    if (solMatch) {
        classObj.requestUerjOffered = solMatch[1];
        classObj.requestUerjTotal = solMatch[2];
        classObj.requestUerjPreferential = solMatch[3];
        classObj.requestVestibularOffered = solMatch[4];
        classObj.requestVestibularTotal = solMatch[5];
        classObj.requestVestibularPreferential = solMatch[6];
    }

    return classObj;
}

async function scrapeDisciplines(matricula, senha) {
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
                    totalHours: tds[6].innerText.trim(),
                    creditLock: tds[7].innerText.trim(),
                    classInPeriod: tds[8].innerText.trim(),
                    disciplineId: id
                };
            });
    });

    console.log(`Found ${disciplines.length} disciplines.`);

    for (const discipline of disciplines) {
        if (!discipline.disciplineId) continue;

        await page.evaluate((id) => { consultarDisciplina(output, id); }, discipline.disciplineId);
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
                    const type = line.querySelector('b')?.innerText.replace(':', '').trim() || 'Requirement';
                    const description = line.querySelector('b')?.parentElement?.nextElementSibling?.innerText.trim() || '';
                    requirements.push({ type, description });
                });
            } else {
                const type = body.querySelector('b')?.innerText.replace(':', '').trim() || 'Requirement';
                const description = body.querySelector('b')?.parentElement?.nextElementSibling?.innerText.trim() || body.innerText.trim();
                requirements.push({ type, description });
            }
            return requirements;
        });

        discipline.requirements = requirements;

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

        console.log(`Extracted ${discipline.classes.length} classes for discipline ${discipline.name}`);

        await upsertDiscipline(discipline);

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('tbody');
    }

    await browser.close();

    return disciplines;
}

export { scrapeDisciplines };