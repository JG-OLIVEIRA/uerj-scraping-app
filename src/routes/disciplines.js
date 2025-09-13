import express from 'express';
import { getAllDisciplines, getDisciplineById, updateWhatsappGroup, getStudentById } from '../db/mongo.js';
import { scrapeDisciplines } from '../scraping/scraper.js';
import 'dotenv/config';

const router = express.Router();

/**
 * @swagger
 * /disciplines:
 *   get:
 *     summary: Returns all disciplines.
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *         description: The ID of the student to get the status of the disciplines.
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
    const { studentId } = req.query;
    const disciplines = await getAllDisciplines();

    if (studentId) {
        const student = await getStudentById(studentId);
        if (student) {
            const disciplinesWithStatus = disciplines.map(discipline => {
                let status = 'not_taken';
                if (student.completedDisciplines.includes(discipline.disciplineId)) {
                    status = 'completed';
                } else if (student.currentDisciplines.includes(discipline.disciplineId)) {
                    status = 'in_progress';
                }
                return { ...discipline, status };
            });
            return res.send(disciplinesWithStatus);
        }
    }

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
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *         description: The ID of the student to get the status of the discipline.
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
    const { studentId } = req.query;
    const discipline = await getDisciplineById(req.params.id);
    if (discipline) {
        if (studentId) {
            const student = await getStudentById(studentId);
            if (student) {
                let status = 'not_taken';
                if (student.completedDisciplines.includes(discipline.disciplineId)) {
                    status = 'completed';
                } else if (student.currentDisciplines.includes(discipline.disciplineId)) {
                    status = 'in_progress';
                }
                return res.send({ ...discipline, status });
            }
        }
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

/**
 * @swagger
 * /disciplines/{id}/class/{classNumber}:
 *   put:
 *     summary: Adds a WhatsApp group link to a class.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the discipline.
 *         schema:
 *           type: string
 *       - in: path
 *         name: classNumber
 *         required: true
 *         description: The number of the class.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               whatsappGroup:
 *                 type: string
 *                 description: The WhatsApp group link.
 *     responses:
 *       200:
 *         description: WhatsApp group updated successfully.
 *       404:
 *         description: Discipline or class not found.
 *       500:
 *         description: Error updating the WhatsApp group.
 */
router.put('/:id/class/:classNumber', async (req, res) => {
    const { id, classNumber } = req.params;
    const { whatsappGroup } = req.body;

    try {
        const result = await updateWhatsappGroup({ disciplineId: id, classNumber, whatsappGroup });
        if (result.matchedCount === 0) {
            return res.status(404).send({ error: 'Discipline or class not found' });
        }
        res.status(200).send({ message: `WhatsApp group for class ${classNumber} updated successfully` });
    } catch (error) {
        res.status(500).send({ error: 'Error updating the WhatsApp group' });
    }
});

export default router;