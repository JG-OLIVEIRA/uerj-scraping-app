import express from 'express';
import { getAllDisciplines, getDisciplineById } from '../db/mongo.js';
import { scrapeDisciplines } from '../scraping/scraper.js';
import 'dotenv/config';

const router = express.Router();

/**
 * @swagger
 * /disciplines:
 *   get:
 *     summary: Returns all disciplines.
 *     responses:
 *       200:
 *         description: A list of all disciplines.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Discipline'
 */
router.get('/', async (req, res) => {
    const disciplines = await getAllDisciplines();
    res.send(disciplines);
});

/**
 * @swagger
 * /disciplines/{id}:
 *   get:
 *     summary: Returns a discipline by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the discipline.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The discipline corresponding to the ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Discipline'
 *       404:
 *         description: Discipline not found.
 */
router.get('/:id', async (req, res) => {
    const discipline = await getDisciplineById(req.params.id);
    if (discipline) {
        res.send(discipline);
    } else {
        res.status(404).send({ error: 'Discipline not found' });
    }
});

/**
 * @swagger
 * /disciplines:
 *   post:
 *     summary: Forces an update of the disciplines in the database by scraping data from Aluno Online.
 *     responses:
 *       200:
 *         description: Disciplines updated successfully.
 */
router.post('/', async (req, res) => {
    const disciplines = await scrapeDisciplines(process.env.UERJ_MATRICULA, process.env.UERJ_SENHA);
    res.send({ 'Disciplines updated': disciplines });
});

export default router;