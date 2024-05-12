import { ObjectId } from "mongodb";

export default class Activity {
    constructor(
        public title: string,
        public description: string,
        public students?: ObjectId[],
        public groups?: ObjectId[],
        public id?: ObjectId
    ) { }
}