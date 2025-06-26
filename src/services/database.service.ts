import * as mongoDB from "mongodb";
import User from "../models/user";
import Activity from "../models/activity";
import Group from "../models/group";
import Questionnaire, { QuestionType } from "../models/questionnaire";

export const collections: { 
    users?: mongoDB.Collection<User>, 
    activities?: mongoDB.Collection<Activity>,
    groups?: mongoDB.Collection<Group>,
    questionnaires?: mongoDB.Collection<Questionnaire>
} = {}

export var client: mongoDB.MongoClient;

/**
 * Inicializa datos básicos del sistema que deben existir siempre
 * Se ejecuta automáticamente al conectar a la base de datos
 */
async function initializeSystemData() {
    console.log('🔧 [Database] Verificando datos básicos del sistema...');
    
    try {
        // Verificar si existe el cuestionario BELBIN
        const existingBelbin = await collections.questionnaires?.findOne({ 
            questionnaireType: "BELBIN" 
        });
        
        if (!existingBelbin) {
            console.log('📝 [Database] Creando cuestionario BELBIN automáticamente...');
            
            // Datos del cuestionario BELBIN
            const belbinQuestionnaire = {
                title: "BELBIN Test",
                description: "Trata de responder teniendo en cuenta tu comportamiento real y no cómo te gustaría comportarte. Distribuye un total de DIEZ puntos en cada sección entre las frases que definen mejor tu comportamiento.",
                questionnaireType: "BELBIN",
                enabled: true,
                questions: [
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Cómo creo que puedo contribuir a un grupo de trabajo:",
                        options: [
                            "Veo fácilmente y aprovecho nuevas oportunidades",
                            "Trabajo bien con muchos tipos de gente",
                            "Dar ideas es uno de mis rasgos fundamentales",
                            "Tengo habilidad para organizar las tareas de un equipo",
                            "Me gusta ser el último que eche un vistazo al trabajo antes de entregarlo",
                            "No me sabe mal que me critiquen por algo que diga o haga si al final los resultados compensan",
                            "Puedo ver fácilmente qué cosas son realizables y cuáles no",
                            "Puedo ser objetivo a la hora de tomar decisiones"
                        ]
                    },
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Si tengo alguna deficiencia cuando trabajo con los demás, ésta podría ser:",
                        options: [
                            "No estoy tranquilo y cómodo a no ser que la reunión esté bien estructurada",
                            "Me suelo poner de parte de gente que puede tener un punto de vista particular, pero que no lo ha explicado correctament",
                            "Tengo tendencia a hablar demasiado una vez el grupo ha aportado ideas",
                            "Mis objetivos personales hacen que no le ponga mucho entusiasmo a trabajar con otros compañeros",
                            "A veces puedo parecer autoritario si hay necesidad de tener algo hecho",
                            "Para mi es difícil liderar el funcionamiento del grupo",
                            "Me centro en ideas que se me ocurren a mi, lo que hace que pierda el hilo de lo que pasa realmente en el grupo",
                            "Mis compañeros suelen verme como demasiado preocupado por detalles sin importancia"
                        ]
                    },
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Cuando estoy trabajando en un proyecto con otras personas:",
                        options: [
                            "Los compañeros aceptan mis sugerencias positivamente",
                            "Intento llevar control de lo que pasa en el grupo para evitar que aparezcan errores",
                            "Suelo centrar al grupo en lo que tenemos que hacer para no perder tiempo",
                            "Pueden contar conmigo si necesitan alguna idea original",
                            "Siempre apoyo una buena sugerencia por el bien del equipo",
                            "Me gusta enterarme de las nuevas ideas y desarrollos que puedan ser buenas",
                            "Confío en mi capacidad para valorar las cosas y que se tomen las mejores decisiones",
                            "Pueden confiar en mi para que todo el trabajo esté bien organizado"
                        ]
                    },
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Un enfoque típico personal cuando trabajo en grupo es:",
                        options: [
                            "Tengo interés en conocer mejor a los compañeros",
                            "Me gusta comentar mis ideas con los otros miembros del equipo",
                            "Puedo justificar con argumentos opiniones no válidas",
                            "Llevo a cabo las acciones que se han planificado",
                            "Tengo facilidad para enfrentarme a problemas inesperados",
                            "Pongo un toque de perfección a todo lo que toco",
                            "Suelo contactar con gente que no es del grupo para ver qué puedo aportar para el equipo",
                            "Me gusta tomar decisiones cuando hay que hacer algo en el grupo"
                        ]
                    },
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Una cosa que me gusta cuando trabajo es:",
                        options: [
                            "Poder analizar todas las alternativas",
                            "Encontrar soluciones a problemas",
                            "Promover buenas relaciones",
                            "Tomar decisiones importantes",
                            "Conocer a gente que pueda aportarnos algo que nos sirva",
                            "Poner de acuerdo a personas para que el trabajo vaya adelante",
                            "Poder poner toda mi atención en una tarea concreta",
                            "Poder poner a trabajar a mi imaginación"
                        ]
                    },
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Si encontrase alguna dificultad porque el tiempo se nos echa encima o porque hay personas problemáticas...",
                        options: [
                            "Me gustaría apartarme y pensar tranquilamente",
                            "Me pondría a trabajar con las personas que más se involucren",
                            "Encontraría alguna forma de reducir la carga de trabajo y que cada uno aporte su parte",
                            "Mi sentido natural de urgencia haría que llegásemos a tiempo",
                            "Me mantendría tranquilo y podría pensar fríamente",
                            "Continuaría trabajando a mi marcha a pesar de las presiones",
                            "Me pondría a liderar el grupo porque veo que no progresamos",
                            "Abriría debates para ver si surgen ideas"
                        ]
                    },
                    {
                        type: QuestionType.MultipleChoice,
                        question: "Si pienso en los problemas que he tenido cuando he trabajado con otros, veo que...",
                        options: [
                            "Me impaciento con aquellos que impiden que avancemos en el trabajo",
                            "Los otros me dicen que le doy demasiado vueltas a las cosas y soy poco intuitivo",
                            "Mi perfeccionismo hace que el trabajo vaya lento",
                            "Me aburro con facilidad y necesito que alguien me espabile",
                            "Me cuesta empezar cuando ya está claro lo que hay que hacer",
                            "Me cuesta explicar las cosas que se me ocurren",
                            "Me doy cuenta que necesito de otras personas para hacer trabajo que yo no puedo",
                            "Odio discutir con los demás"
                        ]
                    }
                ]
            };
            
            const result = await collections.questionnaires?.insertOne(belbinQuestionnaire);
            
            if (result?.insertedId) {
                console.log('✅ [Database] Cuestionario BELBIN creado automáticamente');
            } else {
                console.warn('⚠️  [Database] No se pudo crear el cuestionario BELBIN automáticamente');
            }
        } else {
            // Verificar que esté habilitado
            if (!existingBelbin.enabled) {
                await collections.questionnaires?.updateOne(
                    { questionnaireType: "BELBIN" },
                    { $set: { enabled: true } }
                );
                console.log('✅ [Database] Cuestionario BELBIN habilitado automáticamente');
            } else {
                console.log('✅ [Database] Cuestionario BELBIN ya disponible');
            }
        }
        
        console.log('✅ [Database] Inicialización de datos básicos completada');
        
    } catch (error) {
        console.error('❌ [Database] Error en inicialización de datos básicos:', error);
        // No fallar el startup por esto, solo logear el error
    }
}

export async function connectToDatabase() {

    client = new mongoDB.MongoClient(process.env.MONGO_URI as string);

    await client.connect();

    const db: mongoDB.Db = client.db(process.env.DB_NAME);

    const usersCollection: mongoDB.Collection<User> = db.collection<User>('users');
    const activitiesCollection: mongoDB.Collection<Activity> = db.collection<Activity>('activities');
    const groupsCollection: mongoDB.Collection<Group> = db.collection<Group>('groups');

    const questionnairesCollection: mongoDB.Collection<Questionnaire> = db.collection<Questionnaire>('questionnaires');

    collections.users = usersCollection;
    collections.activities = activitiesCollection;
    collections.groups = groupsCollection;    
    collections.questionnaires = questionnairesCollection;

    console.log(`MongoDB: Successfully connected to database: ${db.databaseName}`);
    
    // Inicializar datos básicos del sistema automáticamente
    await initializeSystemData();
}