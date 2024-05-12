import * as mongoDB from "mongodb";
import User from "../models/user";
import Activity from "../models/activity";
import Group from "../models/group";
import Questionnaire from "../models/questionnaire";

export const collections: { 
    users?: mongoDB.Collection<User>, 
    activities?: mongoDB.Collection<Activity>,
    groups?: mongoDB.Collection<Group>,
    questionnaires?: mongoDB.Collection<Questionnaire>
} = {}

export var client: mongoDB.MongoClient;

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
}