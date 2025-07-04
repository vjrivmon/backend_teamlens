import { ObjectId } from "mongodb";

export default class Questionnaire {
    constructor(
        public title: string,
        public description: string,
        public questions: Question[],
        public questionnaireType: string,
        public enabled?: boolean,
        public _id?: ObjectId
    ) { }
}

export interface Question {
    question: string;
    type: QuestionType;
    options?: string[];
}

export enum QuestionType {
    MultipleChoice = "MultipleChoice",
    OpenText = "OpenText",
    Rating = "Rating",
    Distribution = "Distribution"
}