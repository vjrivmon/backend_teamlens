import { ObjectId } from "mongodb";

export default class Activity {
    constructor(
        public title: string,
        public description: string,
        public teacher: ObjectId,
        public students?: ObjectId[],
        public groups?: ObjectId[],
        public _id?: ObjectId
    ) { }
}