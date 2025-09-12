import express from 'express';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
import specs from './swagger.js';
import { initMongo } from './db/mongo.js';
import disciplinesRouter from './routes/disciplines.js';
import studentsRouter from './routes/students.js';

const app = express();

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
app.use('/disciplines', disciplinesRouter);
app.use('/students', studentsRouter);

initMongo().then(() => {
    app.listen(process.env.PORT || 3000, () => {
        console.log("🚀 Server rodando");
    });
}).catch(err => {
    console.error("❌ Falha ao conectar no MongoDB:", err);
});