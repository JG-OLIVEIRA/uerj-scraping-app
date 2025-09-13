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
            const newClasses = discipline.classes || [];
            const existingClasses = existing.classes || [];

            // Preserve whatsappGroup links from existing classes
            if (existingClasses.length > 0) {
                const existingClassMap = new Map(existingClasses.map(c => [c.number, c]));
                for (const newClass of newClasses) {
                    const existingClass = existingClassMap.get(newClass.number);
                    if (existingClass && existingClass.whatsappGroup) {
                        newClass.whatsappGroup = existingClass.whatsappGroup;
                    }
                }
            }
            
            const updatedDiscipline = { ...discipline, classes: newClasses };
            const updates = {};
            for (const key in updatedDiscipline) {
                if (key === '_id') continue; // Do not compare or update the _id field
                if (JSON.stringify(updatedDiscipline[key]) !== JSON.stringify(existing[key])) {
                    updates[key] = updatedDiscipline[key];
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

async function createStudent({ studentId, completedDisciplines }) {
    try {
        const studentData = {
            studentId,
            completedDisciplines: completedDisciplines || [],
            currentDisciplines: []
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

        const allDisciplineIds = (add || []).concat(remove || []);
        const invalidIds = allDisciplineIds.filter(id => typeof id !== 'string' || !/^[\w-]+$/.test(id));

        if (invalidIds.length > 0) {
            throw new Error(`Invalid discipline IDs: ${invalidIds.join(', ')}`);
        }

        let disciplinesExpr = { $ifNull: ["$completedDisciplines", []] };

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

        const updatePipeline = [{ $set: { completedDisciplines: disciplinesExpr } }];

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

async function updateCurrentDisciplines({ studentId, disciplines }) {
    try {
        const invalidIds = disciplines.filter(id => typeof id !== 'string' || !/^[\w-]+$/.test(id));
        if (invalidIds.length > 0) {
            throw new Error(`Invalid discipline IDs: ${invalidIds.join(', ')}`);
        }

        const result = await studentsCollection.updateOne(
            { studentId: studentId },
            { $set: { currentDisciplines: disciplines } }
        );
        console.log(`Student ${studentId} current disciplines updated.`);
        return result;
    } catch (err) {
        console.error(`Error updating current disciplines: ${err}`);
        throw err;
    }
}

async function updateWhatsappGroup({ disciplineId, classNumber, whatsappGroup }) {
    try {
        const result = await disciplinesCollection.updateOne(
            { disciplineId: disciplineId, "classes.number": classNumber },
            { $set: { "classes.$.whatsappGroup": whatsappGroup } }
        );
        console.log(`Discipline ${disciplineId}, Class ${classNumber} updated with new WhatsApp group.`);
        return result;
    } catch (err) {
        console.error(`Error updating WhatsApp group: ${err}`);
        throw err;
    }
}

async function deleteStudent(studentId) {
    try {
        const result = await studentsCollection.deleteOne({ studentId: studentId });
        console.log(`Student ${studentId} deleted.`);
        return result;
    } catch (err) {
        console.error(`Error deleting student: ${err}`);
        throw err;
    }
}

export { initMongo, upsertDiscipline, getAllDisciplines, getDisciplineById, createStudent, getStudentById, updateStudent, updateWhatsappGroup, updateCurrentDisciplines, deleteStudent };