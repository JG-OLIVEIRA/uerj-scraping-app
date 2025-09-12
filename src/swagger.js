import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'UERJ Scraping API',
            version: '1.0.0',
            description: 'API para raspar dados do Aluno Online da UERJ e armazená-los em um banco de dados MongoDB.',
        },
        components: {
            schemas: {
                Discipline: {
                    type: 'object',
                    properties: {
                        discipline_id: {
                            type: 'string',
                            description: 'O ID da disciplina.',
                        },
                        name: {
                            type: 'string',
                            description: 'O nome da disciplina.',
                        },
                        class_times: {
                            type: 'array',
                            items: {
                                type: 'string',
                            },
                            description: 'Os horários das aulas.',
                        },
                        class_location: {
                            type: 'string',
                            description: 'O local da aula.',
                        },
                        teacher: {
                            type: 'string',
                            description: 'O nome do professor.',
                        },
                        description: {
                            type: 'string',
                            description: 'A descrição da disciplina.',
                        },
                        credits: {
                            type: 'integer',
                            description: 'O número de créditos da disciplina.',
                        },
                        last_update: {
                            type: 'string',
                            format: 'date-time',
                            description: 'A data e hora da última atualização.',
                        },
                    },
                },
                Student: {
                    type: 'object',
                    properties: {
                        studentId: {
                            type: 'string',
                            description: 'O ID do estudante.',
                        },
                        disciplines: {
                            type: 'array',
                            items: {
                                type: 'string',
                            },
                            description: 'Uma lista de IDs de disciplinas que o estudante já completou.',
                        },
                    },
                },
            },
        },
    },
    apis: ['./src/routes/*.js'], // Caminho para os arquivos que contêm as anotações da API
};

const specs = swaggerJsdoc(options);

export default specs;