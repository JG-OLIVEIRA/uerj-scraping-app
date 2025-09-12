import express from 'express';
import { createStudent, getStudentById, updateStudent } from '../db/mongo.js';

const router = express.Router();

/**
 * @swagger
 * /students/{studentId}:
 *   get:
 *     summary: Retorna um estudante pelo ID.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         description: ID do estudante a ser retornado.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estudante retornado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Student'
 *       404:
 *         description: Estudante não encontrado.
 *       500:
 *         description: Erro ao buscar o estudante.
 */
router.get('/:studentId', async (req, res) => {
    const { studentId } = req.params;

    try {
        const student = await getStudentById(studentId);
        if (!student) {
            return res.status(404).send({ error: 'Estudante não encontrado' });
        }
        res.status(200).send(student);
    } catch (error) {
        res.status(500).send({ error: 'Erro ao buscar o estudante' });
    }
});

/**
 * @swagger
 * /students:
 *   post:
 *     summary: Cria um novo estudante.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Student'
 *     responses:
 *       201:
 *         description: Estudante criado com sucesso.
 *       400:
 *         description: O ID do estudante é obrigatório.
 *       500:
 *         description: Erro ao criar o estudante.
 */
router.post('/', async (req, res) => {
    const { studentId, disciplines } = req.body;

    if (!studentId) {
        return res.status(400).send({ error: 'studentId é obrigatório' });
    }

    try {
        await createStudent({ studentId, disciplines });
        res.status(201).send({ message: `Estudante ${studentId} criado com sucesso` });
    } catch (error) {
        res.status(500).send({ error: 'Erro ao criar estudante' });
    }
});

/**
 * @swagger
 * /students/{studentId}:
 *   put:
 *     summary: Adiciona ou remove disciplinas de um estudante.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         description: ID do estudante.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               add:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Uma lista de IDs de disciplinas para adicionar.
 *               remove:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Uma lista de IDs de disciplinas para remover.
 *     responses:
 *       200:
 *         description: Estudante atualizado com sucesso.
 *       500:
 *         description: Erro ao atualizar o estudante.
 */
router.put('/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { add, remove } = req.body;

    try {
        const result = await updateStudent({ studentId, add, remove });
        if (result.matchedCount === 0) {
            return res.status(404).send({ error: 'Estudante não encontrado' });
        }
        res.status(200).send({ message: `Estudante ${studentId} atualizado com sucesso` });
    } catch (error) {
        res.status(500).send({ error: 'Erro ao atualizar o estudante' });
    }
});

export default router;