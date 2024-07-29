import { ObjectId } from "mongodb";
import Group from "../models/group";
import { collections } from "../services/database.service";
import NotFoundError from "./exceptions/NotFoundError";
import { addUserNotification } from "./user-functions";


export const deleteGroup = async (groupId: string) => {

    const groupObjectId = new ObjectId(groupId);

    const group = await collections.groups?.findOne<Group>({ _id: groupObjectId });

    if (!group) {
        throw new NotFoundError(`Group with id ${groupId} does not exist`);
    }

    const resultDelete = await collections.groups?.deleteOne({ _id: groupObjectId });

    await collections.users?.updateMany({ _id: { $in: group?.students } }, { $pull: { groups: groupObjectId } });
    await collections.activities?.updateOne({ _id: group.activity }, { $pull: { groups: groupObjectId } });

    if (!resultDelete) {
        throw new Error(`Failed to remove group with id ${groupId}`);
    } else if (!resultDelete.deletedCount) {
        throw new NotFoundError(`Group with id ${groupId} does not exist`);
    }

    return (resultDelete && resultDelete.deletedCount); // should be always true

}

export const createGroup = async (activityId: string, groupData: Group) => {

    //session.startTransaction();
    // {session: session} -> MongoError: Transaction numbers are only allowed on a replica set member or mongos.

    const studentsIds = groupData.students.map(student => new ObjectId(student));

    groupData.activity = new ObjectId(activityId);


    //Check if students exist before adding them to the group
    const users = await collections.users?.find({ _id: { $in: studentsIds } }).toArray();

    const existingUserIds = users?.map(user => user._id);

    //Check if students belong to the activity before adding them to the group
    const belongUsers = await collections.users?.find({ _id: { $in: existingUserIds }, activities: new ObjectId(activityId) }).toArray();
    const belongUsersIds = belongUsers?.map(user => new ObjectId(user._id));

    if (belongUsersIds?.length !== groupData.students.length) {
        throw new Error("Some students do not belong to the activity");
    }

    //Check if students belong to another groups before adding them
    const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });

    if (!activity) {
        throw new NotFoundError("Activity does not exist");
    }


    let freeStudents: ObjectId[] = belongUsersIds
    if (activity?.groups) {

        const groups = await collections.groups?.find({ _id: { $in: activity?.groups } }).toArray();

        // Remove students that are already in another group of the activity
        groups?.forEach(group => {
            belongUsersIds.forEach(belongUser => {
                group.students.forEach(student => {
                    if (student.equals(belongUser)) {
                        freeStudents = freeStudents.filter(user => !user.equals(belongUser))
                    }
                })
            });
        });
    }

    if (freeStudents.length === 0) {
        throw new Error("All students are already in a group of the activity");
    }

    groupData.students = freeStudents;

    // INSERT GROUP
    const resultInsert = await collections.groups?.insertOne(groupData);

    // push group into activity
    const resultPush = await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, { $push: { groups: resultInsert?.insertedId } });

    // add group to students
    await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
        $addToSet: { groups: new ObjectId(resultInsert?.insertedId) }
    });


    if (!resultPush) {
        collections.groups?.deleteOne({ _id: resultInsert?.insertedId });
        await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
            $push: { groups: new ObjectId(resultInsert?.insertedId) }
        });
        throw new Error("Failed to add group to activity");
    }

    // send notification to users added to the group
    belongUsersIds.forEach(async (id) => {
        await addUserNotification(id, {
            title: "Group",
            description: `You have been added to a new group!`,
            link: `/activities/${activityId}/${resultInsert?.insertedId}`
        })
    });

    //await session.commitTransaction();
    if (resultInsert && resultInsert.insertedId) {
        const groups = await getGroupsWithStudents([resultInsert!.insertedId]) || [];
        return groups[0];

    } else {
        throw new Error("Failed to create a new group.");
    }
}


export const getGroupsWithStudents = async (groupsId: ObjectId[]) => {

    const groups = await collections.groups?.aggregate<Group>([
        {
            $match: { _id: { $in: groupsId! } }
        },
        {
            $lookup: {
                from: "users",
                let: { userIds: "$students" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $in: ["$_id", "$$userIds"]
                            }
                        }
                    }
                ],
                as: "students"
            }
        },
        {
            $project: {
                'students.password': 0,
                'students.activities': 0,
                'students.groups': 0,
            }
        }
    ]).toArray()

    return groups
}

export const addStudentsToGroup = async (groupId: string, studentsIds: string[]) => {

    const groupObjectId = new ObjectId(groupId);
    const studentsObjectIds = studentsIds.map(student => new ObjectId(student));

    const group = await collections.groups?.findOne<Group>({ _id: groupObjectId });

    if (!group) {
        throw new NotFoundError(`Group with id ${groupId} does not exist`);
    }

    // check if students exist before adding them to the group
    const users = await collections.users?.find({ _id: { $in: studentsObjectIds } }).toArray();

    const existingUserIds = users?.map(user => user._id);

    // check if students belong to the activity before adding them to the group
    const belongUsers = await collections.users?.find({ _id: { $in: existingUserIds }, activities: group.activity }).toArray();
    const belongUsersIds = belongUsers?.map(user => new ObjectId(user._id));

    if (belongUsersIds?.length !== studentsIds.length) {
        throw Error("Some students do not belong to the activity");
    }

    // check if students belong to another groups before adding them
    if (group.students) {
        group.students.forEach(student => {
            studentsObjectIds.forEach(stud => {
                if (student.equals(stud)) {
                    throw Error("Some students are already in the group");
                }
            });
        });
    }

    // add group to students
    await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
        $addToSet: { groups: groupObjectId }
    });

    // add students to group
    const resultPush = await collections.groups?.updateOne({ _id: groupObjectId }, { $push: { students: { $each: studentsObjectIds } } });

    // send notification to users added to the group
    studentsObjectIds.forEach(async (id) => {
        await addUserNotification(id, {
            title: "Group",
            description: `You have been added to a new group!`,
            link: `/activities/${group.activity}/${groupId}`
        })
    });

    if (!resultPush) {
        await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
            $pull: { groups: groupObjectId }
        });
        throw Error("Failed to add students to group");
    }

    return {
        resultPush,
        members: belongUsers?.map(user => {
            const { password, activities, groups, ...userFiltered } = user;
            return userFiltered;
        }),
    };
}