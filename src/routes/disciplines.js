import express from 'express';
import { getAllDisciplinas, getDisciplinaById } from '../db/mongo.js';
import { scrapeDisciplinas } from '../scraping/scraper.js';
import 'dotenv/config';

const router = express.Router();

/**
 * @swagger
 * /disciplines:
 *   get:
 *     summary: Retorna todas as disciplinas.
 *     responses:
 *       200:
 *         description: Lista de todas as disciplinas.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Discipline'
 */
router.get('/', async (req, res) => {
    const disciplinas = await getAllDisciplinas();
    res.send(disciplinas);
});

/**
 * @swagger
 * /disciplines/{id}:
 *   get:
 *     summary: Retorna uma disciplina pelo seu ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da disciplina.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A disciplina correspondente ao ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Discipline'
 *       404:
 *         description: Disciplina não encontrada.
 */
router.get('/:id', async (req, res) => {
    const disciplina = await getDisciplinaById(req.params.id);
    if (disciplina) {
        res.send(disciplina);
    } else {
        res.status(404).send({ error: 'Disciplina não encontrada' });
    }
});

/**
 * @swagger
 * /disciplines:
 *   post:
 *     summary: Força a atualização das disciplinas no banco de dados, raspando os dados do Aluno Online.
 *     responses:
 *       200:
 *         description: Disciplinas atualizadas com sucesso.
 */
router.post('/', async (req, res) => {
    const disciplinas = await scrapeDisciplinas(process.env.UERJ_MATRICULA, process.env.UERJ_SENHA);
    res.send({ 'Disciplinas atualizadas': disciplinas });
});

export default router;