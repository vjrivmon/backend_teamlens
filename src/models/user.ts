import { ObjectId } from "mongodb";

export default class User {
    constructor(
        public email: string,
        public name: string,
        public password: string,
        public role: string,
        public askedQuestionnaires?: AskedQuestionnaire[],
        public activities?: ObjectId[],
        public groups?: ObjectId[],
        public resetToken?: string,
        public invitationToken?: string,
        public notifications?: INotification[],
        public _id?: ObjectId
    ) { }
}

export interface AskedQuestionnaire {
    questionnaire: ObjectId;
    result: string;
}

export interface INotification {
    title: string;
    description: string;
    date?: string;
    link?: string;
}