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
    console.log(`🏗️ [CreateGroup] Iniciando creación de grupo: ${groupData.name} para actividad: ${activityId}`);
    console.log(`👥 [CreateGroup] Estudiantes a agregar: ${groupData.students.length}`);

    //session.startTransaction();
    // {session: session} -> MongoError: Transaction numbers are only allowed on a replica set member or mongos.

    const studentsIds = groupData.students.map(student => new ObjectId(student));
    console.log(`🔍 [CreateGroup] IDs convertidos a ObjectId: ${studentsIds.length}`);

    groupData.activity = new ObjectId(activityId);

    //Check if students exist before adding them to the group
    const users = await collections.users?.find({ _id: { $in: studentsIds } }).toArray();
    console.log(`👤 [CreateGroup] Usuarios encontrados en BD: ${users?.length}/${studentsIds.length}`);

    const existingUserIds = users?.map(user => user._id);

    // CORREGIDO: Verificar pertenencia usando la actividad como fuente de verdad
    console.log(`🔍 [CreateGroup] Verificando pertenencia a actividad...`);
    
    // Obtener la actividad para verificar qué estudiantes pertenecen a ella
    const activity = await collections.activities?.findOne({ _id: new ObjectId(activityId) });
    
    if (!activity) {
        console.error(`❌ [CreateGroup] Actividad no encontrada: ${activityId}`);
        throw new NotFoundError("Activity does not exist");
    }

    console.log(`📋 [CreateGroup] Actividad encontrada: ${activity.title}`);
    console.log(`👥 [CreateGroup] Estudiantes en actividad: ${activity.students?.length}`);

    // Verificar que todos los estudiantes del grupo pertenecen a la actividad
    const belongUsersIds: ObjectId[] = [];
    studentsIds.forEach(studentId => {
        const belongsToActivity = activity.students?.some(activityStudentId => 
            activityStudentId.toString() === studentId.toString()
        );
        
        if (belongsToActivity) {
            belongUsersIds.push(studentId);
            console.log(`✅ [CreateGroup] Estudiante ${studentId} pertenece a la actividad`);
        } else {
            console.error(`❌ [CreateGroup] Estudiante ${studentId} NO pertenece a la actividad`);
        }
    });

    console.log(`📊 [CreateGroup] Estudiantes válidos: ${belongUsersIds.length}/${studentsIds.length}`);

    if (belongUsersIds.length !== groupData.students.length) {
        console.error(`💥 [CreateGroup] Error de validación: ${belongUsersIds.length} válidos vs ${groupData.students.length} solicitados`);
        throw new Error("Some students do not belong to the activity");
    }

    console.log(`✅ [CreateGroup] Todos los estudiantes pertenecen a la actividad`);

    //Check if students belong to another groups before adding them
    let freeStudents: ObjectId[] = belongUsersIds
    if (activity?.groups) {
        console.log(`🔍 [CreateGroup] Verificando grupos existentes: ${activity.groups.length}`);

        const groups = await collections.groups?.find({ _id: { $in: activity?.groups } }).toArray();

        // Remove students that are already in another group of the activity
        groups?.forEach(group => {
            belongUsersIds.forEach(belongUser => {
                group.students.forEach(student => {
                    if (student.equals(belongUser)) {
                        freeStudents = freeStudents.filter(user => !user.equals(belongUser))
                        console.log(`⚠️ [CreateGroup] Estudiante ${belongUser} ya está en grupo: ${group.name}`);
                    }
                })
            });
        });
    }

    console.log(`🆓 [CreateGroup] Estudiantes libres: ${freeStudents.length}`);

    if (freeStudents.length === 0) {
        console.error(`💥 [CreateGroup] Todos los estudiantes ya están en grupos`);
        throw new Error("All students are already in a group of the activity");
    }

    groupData.students = freeStudents;

    // INSERT GROUP
    console.log(`💾 [CreateGroup] Insertando grupo en BD...`);
    const resultInsert = await collections.groups?.insertOne(groupData);
    console.log(`✅ [CreateGroup] Grupo insertado con ID: ${resultInsert?.insertedId}`);

    // push group into activity
    console.log(`🔗 [CreateGroup] Agregando grupo a actividad...`);
    const resultPush = await collections.activities?.updateOne({ _id: new ObjectId(activityId) }, { $push: { groups: resultInsert?.insertedId } });
    console.log(`✅ [CreateGroup] Grupo agregado a actividad: ${resultPush?.modifiedCount} documentos modificados`);

    // add group to students (OPCIONAL: solo si el modelo lo requiere)
    console.log(`👥 [CreateGroup] Actualizando estudiantes...`);
    await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
        $addToSet: { groups: new ObjectId(resultInsert?.insertedId) }
    });
    console.log(`✅ [CreateGroup] Estudiantes actualizados`);

    if (!resultPush) {
        console.error(`💥 [CreateGroup] Error agregando grupo a actividad - rollback`);
        collections.groups?.deleteOne({ _id: resultInsert?.insertedId });
        await collections.users?.updateMany({ _id: { $in: belongUsersIds } }, {
            $pull: { groups: new ObjectId(resultInsert?.insertedId) }
        });
        throw new Error("Failed to add group to activity");
    }

    // send notification to users added to the group
    console.log(`📨 [CreateGroup] Enviando notificaciones...`);
    belongUsersIds.forEach(async (id) => {
        await addUserNotification(id, {
            title: "Group",
            description: `You have been added to a new group!`,
            link: `/activities/${activityId}/${resultInsert?.insertedId}`
        })
    });

    //await session.commitTransaction();
    if (resultInsert && resultInsert.insertedId) {
        console.log(`🎉 [CreateGroup] Grupo creado exitosamente: ${groupData.name}`);
        const groups = await getGroupsWithStudents([resultInsert!.insertedId]) || [];
        return groups[0];

    } else {
        console.error(`💥 [CreateGroup] Error crítico: no se obtuvo insertedId`);
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