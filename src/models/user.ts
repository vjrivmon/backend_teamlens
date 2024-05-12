import { ObjectId } from "mongodb";

export default class User {
    constructor(
        public email: string,
        public password: string,
        public role: string,
        public askedQuestionnaires?: AskedQuestionnaire[],
        public activities?: ObjectId[],
        public groups?: ObjectId[],
        public id?: ObjectId
    ) { }
}

export interface AskedQuestionnaire {
    questionnaire: ObjectId;
    result: string;
}
