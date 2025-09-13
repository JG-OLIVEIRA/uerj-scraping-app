import { MongoClient } from "mongodb";
import 'dotenv/config';

const dbName = "uerjScrapingDatabase";
const disciplinesCollectionName = "disciplines";
const studentsCollectionName = "students";


const client = new MongoClient(process.env.URL_MONGODB);
let disciplinesCollection;
let studentsCollection;

// Initializes MongoDB on startup
async function initMongo() {
    await client.connect();
    const db = client.db(dbName);
    disciplinesCollection = db.collection(disciplinesCollectionName);
    studentsCollection = db.collection(studentsCollectionName);
    console.log("✅ MongoDB connected");
}

// Refined upsert: only updates fields that have changed
async function upsertDiscipline(discipline) {
    try {
        const existing = await disciplinesCollection.findOne({ disciplineId: discipline.disciplineId });

        if (existing) {
            const updates = {};
            for (const key in discipline) {
                if (JSON.stringify(discipline[key]) !== JSON.stringify(existing[key])) {
                    updates[key] = discipline[key];
                }
            }

            if (Object.keys(updates).length > 0) {
                await disciplinesCollection.updateOne(
                    { disciplineId: discipline.disciplineId },
                    { $set: updates }
                );
                console.log(`${discipline.name} updated with modified fields:`, Object.keys(updates));
            } else {
                console.log(`${discipline.name} had no changes.`);
            }
        } else {
            await disciplinesCollection.insertOne(discipline);
            console.log(`${discipline.name} inserted.`);
        }
    } catch (err) {
        console.error(`Error inserting/updating discipline: ${err}`);
    }
}

// Fetch all disciplines
async function getAllDisciplines() {
    try {
        return await disciplinesCollection.find({}).toArray();
    } catch (err) {
        console.error(`Error fetching disciplines: ${err}\n`);
        return [];
    }
}

// Fetch discipline by id
async function getDisciplineById(id) {
    try {
        return await disciplinesCollection.findOne({ disciplineId: id });
    } catch (err) {
        console.error(`Error fetching discipline ${id}: ${err}\n`);
        return null;
    }
}

async function createStudent({ studentId, disciplines }) {
    try {
        const studentData = {
            studentId,
            disciplines: disciplines || []
        };
        const result = await studentsCollection.insertOne(studentData);
        console.log(`Student ${studentId} inserted.`);
        return result;
    } catch (err) {
        console.error(`Error inserting student: ${err}`);
        throw err; // re-throw the error to be caught by the route handler
    }
}

async function getStudentById(studentId) {
    try {
        return await studentsCollection.findOne({ studentId: studentId });
    } catch (err) {
        console.error(`Error fetching student ${studentId}: ${err}\n`);
        return null;
    }
}

async function updateStudent({ studentId, add, remove }) {
    try {
        if ((!add || add.length === 0) && (!remove || remove.length === 0)) {
            console.log(`No changes for student ${studentId}`);
            return { matchedCount: 1, modifiedCount: 0 };
        }

        let disciplinesExpr = { $ifNull: ["$disciplines", []] };

        if (add && add.length > 0) {
            disciplinesExpr = { $setUnion: [disciplinesExpr, add] };
        }

        if (remove && remove.length > 0) {
            disciplinesExpr = {
                $filter: {
                    input: disciplinesExpr,
                    as: "discipline",
                    cond: { $not: { $in: ["$$discipline", remove] } }
                }
            };
        }

        const updatePipeline = [{ $set: { disciplines: disciplinesExpr } }];

        const result = await studentsCollection.updateOne(
            { studentId: studentId },
            updatePipeline
        );
        console.log(`Student ${studentId} updated.`);
        return result;
    } catch (err) {
        console.error(`Error updating student: ${err}`);
        throw err;
    }
}


export { initMongo, upsertDiscipline, getAllDisciplines, getDisciplineById, createStudent, getStudentById, updateStudent };