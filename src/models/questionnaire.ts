import { ObjectId } from "mongodb";

export default class Questionnaire {
    constructor(
        public title: string,
        public description: string,
        public questions: Question[],
        public id?: ObjectId
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
    Rating = "Rating"
}