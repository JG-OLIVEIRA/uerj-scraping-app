import { MongoClient } from "mongodb";
import 'dotenv/config';

const dbName = "uerjScrapingDatabase";
const disciplinesCollectionName = "disciplines";
const studentsCollectionName = "students";


const client = new MongoClient(process.env.URL_MONGODB);
let disciplinesCollection;
let studentsCollection;

// Inicializa MongoDB no startup
async function initMongo() {
    await client.connect();
    const db = client.db(dbName);
    disciplinesCollection = db.collection(disciplinesCollectionName);
    studentsCollection = db.collection(studentsCollectionName);
    console.log("✅ MongoDB conectado");
}

// Upsert refinado: atualiza só campos que mudaram
async function upsertDisciplinaRefinada(disciplina) {
    try {
        const existing = await disciplinesCollection.findOne({ discipline_id: disciplina.discipline_id });

        if (existing) {
            const updates = {};
            for (const key in disciplina) {
                if (JSON.stringify(disciplina[key]) !== JSON.stringify(existing[key])) {
                    updates[key] = disciplina[key];
                }
            }

            if (Object.keys(updates).length > 0) {
                await disciplinesCollection.updateOne(
                    { discipline_id: disciplina.discipline_id },
                    { $set: updates }
                );
                console.log(`${disciplina.name} atualizada com campos modificados:`, Object.keys(updates));
            } else {
                console.log(`${disciplina.name} não teve alterações.`);
            }
        } else {
            await disciplinesCollection.insertOne(disciplina);
            console.log(`${disciplina.name} inserida.`);
        }
    } catch (err) {
        console.error(`Erro ao inserir/atualizar disciplina: ${err}`);
    }
}

// Buscar todas as disciplinas
async function getAllDisciplinas() {
    try {
        return await disciplinesCollection.find({}).toArray();
    } catch (err) {
        console.error(`Erro ao buscar disciplinas: ${err}\n`);
        return [];
    }
}

// Buscar disciplina por id
async function getDisciplinaById(id) {
    try {
        return await disciplinesCollection.findOne({ discipline_id: id });
    } catch (err) {
        console.error(`Erro ao buscar disciplina ${id}: ${err}\n`);
        return null;
    }
}

async function createStudent({ studentId, disciplines }) {
    try {
        const result = await studentsCollection.insertOne({ studentId, disciplines });
        console.log(`Estudante ${studentId} inserido.`);
        return result;
    } catch (err) {
        console.error(`Erro ao inserir estudante: ${err}`);
        throw err; // re-throw the error to be caught by the route handler
    }
}

async function getStudentById(studentId) {
    try {
        return await studentsCollection.findOne({ studentId: studentId });
    } catch (err) {
        console.error(`Erro ao buscar estudante ${studentId}: ${err}\n`);
        return null;
    }
}

async function updateStudent({ studentId, add, remove }) {
    try {
        const update = {};
        if (add && add.length > 0) {
            update.$addToSet = { disciplines: { $each: add } };
        }
        if (remove && remove.length > 0) {
            update.$pull = { disciplines: { $in: remove } };
        }

        if (Object.keys(update).length === 0) {
            console.log(`Nenhuma alteração para o estudante ${studentId}`);
            return { matchedCount: 1, modifiedCount: 0 };
        }

        const result = await studentsCollection.updateOne(
            { studentId: studentId },
            update
        );
        console.log(`Estudante ${studentId} atualizado.`);
        return result;
    } catch (err) {
        console.error(`Erro ao atualizar estudante: ${err}`);
        throw err;
    }
}


export { initMongo, upsertDisciplinaRefinada, getAllDisciplinas, getDisciplinaById, createStudent, getStudentById, updateStudent };