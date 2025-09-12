import express from 'express';
import { createStudent, updateStudent } from '../db/mongo.js';

const router = express.Router();

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