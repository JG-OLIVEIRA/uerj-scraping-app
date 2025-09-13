import express from 'express';
import { createStudent, getStudentById, updateStudent, updateCurrentDisciplines, deleteStudent } from '../db/mongo.js';

const router = express.Router();

/**
 * @swagger
 * /students/{studentId}:
 *   get:
 *     summary: Returns a student by their ID.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         description: The ID of the student to be returned.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Student'
 *       404:
 *         description: Student not found.
 *       500:
 *         description: Error retrieving the student.
 */
router.get('/:studentId', async (req, res) => {
    const { studentId } = req.params;

    try {
        const student = await getStudentById(studentId);
        if (!student) {
            return res.status(404).send({ error: 'Student not found' });
        }
        res.status(200).send(student);
    } catch (error) {
        res.status(500).send({ error: 'Error retrieving the student' });
    }
});

/**
 * @swagger
 * /students:
 *   post:
 *     summary: Creates a new student.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Student'
 *     responses:
 *       201:
 *         description: Student created successfully.
 *       400:
 *         description: The student ID is required.
 *       409:
 *         description: A student with the same ID already exists.
 *       500:
 *         description: Error creating the student.
 */
router.post('/', async (req, res) => {
    const { studentId, completedDisciplines } = req.body;

    if (!studentId) {
        return res.status(400).send({ error: 'studentId is required' });
    }

    try {
        const existingStudent = await getStudentById(studentId);
        if (existingStudent) {
            return res.status(409).send({ error: `Student with ID ${studentId} already exists` });
        }

        await createStudent({ studentId, completedDisciplines });
        res.status(201).send({ message: `Student ${studentId} created successfully` });
    } catch (error) {
        res.status(500).send({ error: 'Error creating student' });
    }
});

/**
 * @swagger
 * /students/{studentId}:
 *   put:
 *     summary: Adds or removes disciplines from a student.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         description: The student's ID.
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
 *                 description: A list of discipline IDs to add.
 *               remove:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: A list of discipline IDs to remove.
 *     responses:
 *       200:
 *         description: Student updated successfully.
 *       500:
 *         description: Error updating the student.
 */
router.put('/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { add, remove } = req.body;

    try {
        const result = await updateStudent({ studentId, add, remove });
        if (result.matchedCount === 0) {
            return res.status(404).send({ error: 'Student not found' });
        }
        res.status(200).send({ message: `Student ${studentId} updated successfully` });
    } catch (error) {
        res.status(500).send({ error: 'Error updating the student' });
    }
});

/**
 * @swagger
 * /students/{studentId}/current-disciplines:
 *   put:
 *     summary: Sets the disciplines a student is currently taking.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         description: The student's ID.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               disciplines:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: A list of discipline IDs that the student is currently taking.
 *     responses:
 *       200:
 *         description: Student's current disciplines updated successfully.
 *       500:
 *         description: Error updating the student's current disciplines.
 */
router.put('/:studentId/current-disciplines', async (req, res) => {
    const { studentId } = req.params;
    const { disciplines } = req.body;

    try {
        const result = await updateCurrentDisciplines({ studentId, disciplines });
        if (result.matchedCount === 0) {
            return res.status(404).send({ error: 'Student not found' });
        }
        res.status(200).send({ message: `Student ${studentId}'s current disciplines updated successfully` });
    } catch (error) {
        res.status(500).send({ error: 'Error updating the student\'s current disciplines' });
    }
});

/**
 * @swagger
 * /students/{studentId}:
 *   delete:
 *     summary: Deletes a student by their ID.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         description: The ID of the student to be deleted.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student deleted successfully.
 *       404:
 *         description: Student not found.
 *       500:
 *         description: Error deleting the student.
 */
router.delete('/:studentId', async (req, res) => {
    const { studentId } = req.params;

    try {
        const result = await deleteStudent(studentId);
        if (result.deletedCount === 0) {
            return res.status(404).send({ error: 'Student not found' });
        }
        res.status(200).send({ message: `Student ${studentId} deleted successfully` });
    } catch (error) {
        res.status(500).send({ error: 'Error deleting the student' });
    }
});

export default router;