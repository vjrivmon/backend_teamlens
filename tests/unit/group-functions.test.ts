/**
 * Tests Unitarios - Funciones de Grupo
 * Suite completa para funcionalidades críticas de gestión de grupos
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 * 
 * FUNCIONALIDADES TESTEADAS:
 * - Creación de grupos con validaciones de negocio
 * - Gestión de estudiantes en grupos
 * - Prevención de duplicados y conflictos
 * - Eliminación de grupos
 * - Notificaciones automáticas
 * - Validaciones de integridad referencial
 */

import { ObjectId } from 'mongodb';

// Importaciones del proyecto
import { 
  createGroup, 
  deleteGroup, 
  addStudentsToGroup, 
  getGroupsWithStudents 
} from '../../src/functions/group-functions';
import { collections, connectToDatabase } from '../../src/services/database.service';
import NotFoundError from '../../src/functions/exceptions/NotFoundError';

// Mock de las funciones de usuario para evitar dependencias
jest.mock('../../src/functions/user-functions', () => ({
  addUserNotification: jest.fn().mockResolvedValue(undefined)
}));

import { addUserNotification } from '../../src/functions/user-functions';

describe('👥 Group Functions - Tests Unitarios de Funciones de Grupo', () => {
  let testTeacherId: ObjectId;
  let testActivityId: ObjectId;
  let testStudentIds: ObjectId[] = [];

  /**
   * Setup antes de todos los tests
   */
  beforeAll(async () => {
    console.log('🚀 [Group Functions Tests] Iniciando setup...');
    await connectToDatabase();
    console.log('✅ [Group Functions Tests] Base de datos configurada');
  });

  /**
   * Setup antes de cada test
   */
  beforeEach(async () => {
    // Limpiar todas las colecciones
    if (collections.users) await collections.users.deleteMany({});
    if (collections.activities) await collections.activities.deleteMany({});
    if (collections.groups) await collections.groups.deleteMany({});

    // Crear profesor de test
    const teacher = {
      email: 'teacher@teamlens.test',
      name: 'Test Teacher',
      password: 'hashedpassword',
      role: 'teacher'
    };
    const teacherResult = await collections.users?.insertOne(teacher);
    testTeacherId = teacherResult!.insertedId;

    // Crear actividad de test
    const activity = {
      title: 'Test Activity',
      description: 'Activity for testing groups',
      teacher: testTeacherId,
      students: [],
      groups: []
    };
    const activityResult = await collections.activities?.insertOne(activity);
    testActivityId = activityResult!.insertedId;

    // Crear estudiantes de test
    testStudentIds = [];
    for (let i = 1; i <= 5; i++) {
      const student = {
        email: `student${i}@teamlens.test`,
        name: `Test Student ${i}`,
        password: 'hashedpassword',
        role: 'student',
        activities: [testActivityId],
        groups: []
      };
      const studentResult = await collections.users?.insertOne(student);
      testStudentIds.push(studentResult!.insertedId);
    }

    // Añadir estudiantes a la actividad
    await collections.activities?.updateOne(
      { _id: testActivityId },
      { $set: { students: testStudentIds } }
    );

    // Limpiar mocks
    jest.clearAllMocks();
  });

  /**
   * Tests de Creación de Grupos
   */
  describe('➕ createGroup', () => {
    
    it('✅ Debe crear grupo exitosamente con estudiantes válidos', async () => {
      const groupData = {
        name: 'Test Group 1',
        students: [testStudentIds[0], testStudentIds[1], testStudentIds[2]],
        activity: testActivityId
      };

      const createdGroup = await createGroup(testActivityId.toString(), groupData);

      // Verificar que el grupo fue creado
      expect(createdGroup).toBeDefined();
      expect(createdGroup._id).toBeDefined();
      expect(createdGroup.name).toBe(groupData.name);
      expect(createdGroup.students).toHaveLength(3);

      // Verificar que el grupo fue añadido a la actividad
      const updatedActivity = await collections.activities?.findOne({ _id: testActivityId });
      expect(updatedActivity?.groups).toContain(createdGroup._id);

      // Verificar que los estudiantes fueron añadidos al grupo
      for (const studentId of groupData.students) {
        const student = await collections.users?.findOne({ _id: studentId });
        expect(student?.groups).toContain(createdGroup._id);
      }

      // Verificar que se enviaron notificaciones
      expect(addUserNotification).toHaveBeenCalledTimes(3);

      console.log('✅ [Group Functions Tests] Creación de grupo exitosa verificada');
    });

    it('❌ Debe rechazar creación con estudiantes que no pertenecen a la actividad', async () => {
      // Crear estudiante que no pertenece a la actividad
      const outsideStudent = {
        email: 'outside@teamlens.test',
        name: 'Outside Student',
        password: 'hashedpassword',
        role: 'student',
        activities: [], // No pertenece a la actividad
        groups: []
      };
      const outsideResult = await collections.users?.insertOne(outsideStudent);

      const groupData = {
        name: 'Invalid Group',
        students: [testStudentIds[0], outsideResult!.insertedId],
        activity: testActivityId
      };

      await expect(createGroup(testActivityId.toString(), groupData))
        .rejects
        .toThrow('Some students do not belong to the activity');

      console.log('✅ [Group Functions Tests] Rechazo por estudiantes no pertenecientes verificado');
    });

    it('❌ Debe rechazar creación con actividad inexistente', async () => {
      const nonExistentActivityId = new ObjectId();
      
      const groupData = {
        name: 'Test Group',
        students: [testStudentIds[0]],
        activity: nonExistentActivityId
      };

      await expect(createGroup(nonExistentActivityId.toString(), groupData))
        .rejects
        .toThrow('Activity does not exist');

      console.log('✅ [Group Functions Tests] Rechazo por actividad inexistente verificado');
    });

    it('❌ Debe rechazar estudiantes ya asignados a otro grupo', async () => {
      // Crear primer grupo
      const firstGroupData = {
        name: 'First Group',
        students: [testStudentIds[0], testStudentIds[1]],
        activity: testActivityId
      };
      await createGroup(testActivityId.toString(), firstGroupData);

      // Intentar crear segundo grupo con estudiante ya asignado
      const secondGroupData = {
        name: 'Second Group',
        students: [testStudentIds[0], testStudentIds[2]], // testStudentIds[0] ya está asignado
        activity: testActivityId
      };

      await expect(createGroup(testActivityId.toString(), secondGroupData))
        .rejects
        .toThrow('All students are already in a group of the activity');

      console.log('✅ [Group Functions Tests] Rechazo por estudiantes ya asignados verificado');
    });

    it('✅ Debe crear grupo solo con estudiantes libres cuando algunos están ocupados', async () => {
      // Crear primer grupo con algunos estudiantes
      const firstGroupData = {
        name: 'First Group',
        students: [testStudentIds[0], testStudentIds[1]],
        activity: testActivityId
      };
      await createGroup(testActivityId.toString(), firstGroupData);

      // Crear segundo grupo incluyendo estudiantes ocupados y libres
      const secondGroupData = {
        name: 'Second Group',
        students: [testStudentIds[0], testStudentIds[1], testStudentIds[2], testStudentIds[3]], // 0,1 ocupados, 2,3 libres
        activity: testActivityId
      };

      const createdGroup = await createGroup(testActivityId.toString(), secondGroupData);

      // Verificar que solo se añadieron los estudiantes libres
      expect(createdGroup.students).toHaveLength(2);
      
      // Verificar que los estudiantes libres fueron añadidos
      const groupStudentIds = createdGroup.students.map((s: any) => s._id.toString());
      expect(groupStudentIds).toContain(testStudentIds[2].toString());
      expect(groupStudentIds).toContain(testStudentIds[3].toString());

      console.log('✅ [Group Functions Tests] Creación con filtrado de estudiantes libres verificada');
    });
  });

  /**
   * Tests de Eliminación de Grupos
   */
  describe('🗑️ deleteGroup', () => {
    
    it('✅ Debe eliminar grupo exitosamente', async () => {
      // Crear grupo primero
      const groupData = {
        name: 'Group to Delete',
        students: [testStudentIds[0], testStudentIds[1]],
        activity: testActivityId
      };
      const createdGroup = await createGroup(testActivityId.toString(), groupData);

      // Eliminar el grupo
      const result = await deleteGroup(createdGroup._id.toString());

      expect(result).toBe(true);

      // Verificar que el grupo fue eliminado de la base de datos
      const deletedGroup = await collections.groups?.findOne({ _id: createdGroup._id });
      expect(deletedGroup).toBeNull();

      // Verificar que el grupo fue removido de la actividad
      const updatedActivity = await collections.activities?.findOne({ _id: testActivityId });
      expect(updatedActivity?.groups).not.toContain(createdGroup._id);

      // Verificar que el grupo fue removido de los estudiantes
      for (const studentId of testStudentIds.slice(0, 2)) {
        const student = await collections.users?.findOne({ _id: studentId });
        expect(student?.groups).not.toContain(createdGroup._id);
      }

      console.log('✅ [Group Functions Tests] Eliminación de grupo exitosa verificada');
    });

    it('❌ Debe rechazar eliminación de grupo inexistente', async () => {
      const nonExistentGroupId = new ObjectId();

      await expect(deleteGroup(nonExistentGroupId.toString()))
        .rejects
        .toThrow(`Group with id ${nonExistentGroupId} does not exist`);

      console.log('✅ [Group Functions Tests] Rechazo por grupo inexistente verificado');
    });
  });

  /**
   * Tests de Adición de Estudiantes a Grupos
   */
  describe('➕ addStudentsToGroup', () => {
    let testGroupId: ObjectId;

    beforeEach(async () => {
      // Crear grupo base para los tests
      const groupData = {
        name: 'Base Group',
        students: [testStudentIds[0]],
        activity: testActivityId
      };
      const createdGroup = await createGroup(testActivityId.toString(), groupData);
      testGroupId = createdGroup._id;
    });

    it('✅ Debe añadir estudiantes exitosamente al grupo', async () => {
      const studentsToAdd = [testStudentIds[1].toString(), testStudentIds[2].toString()];

      const result = await addStudentsToGroup(testGroupId.toString(), studentsToAdd);

      expect(result.resultPush).toBeDefined();
      expect(result.members).toHaveLength(2);

      // Verificar que los estudiantes fueron añadidos al grupo
      const updatedGroup = await collections.groups?.findOne({ _id: testGroupId });
      expect(updatedGroup?.students).toHaveLength(3); // 1 inicial + 2 añadidos

      // Verificar que el grupo fue añadido a los estudiantes
      for (const studentIdStr of studentsToAdd) {
        const student = await collections.users?.findOne({ _id: new ObjectId(studentIdStr) });
        expect(student?.groups).toContain(testGroupId);
      }

      // Verificar que se enviaron notificaciones
      expect(addUserNotification).toHaveBeenCalledTimes(2);

      console.log('✅ [Group Functions Tests] Adición de estudiantes exitosa verificada');
    });

    it('❌ Debe rechazar estudiantes que no pertenecen a la actividad', async () => {
      // Crear estudiante que no pertenece a la actividad
      const outsideStudent = {
        email: 'outside2@teamlens.test',
        name: 'Outside Student 2',
        password: 'hashedpassword',
        role: 'student',
        activities: [],
        groups: []
      };
      const outsideResult = await collections.users?.insertOne(outsideStudent);

      const studentsToAdd = [outsideResult!.insertedId.toString()];

      await expect(addStudentsToGroup(testGroupId.toString(), studentsToAdd))
        .rejects
        .toThrow('Some students do not belong to the activity');

      console.log('✅ [Group Functions Tests] Rechazo por estudiantes no pertenecientes en adición verificado');
    });

    it('❌ Debe rechazar estudiantes ya en el grupo', async () => {
      const studentsToAdd = [testStudentIds[0].toString()]; // Ya está en el grupo

      await expect(addStudentsToGroup(testGroupId.toString(), studentsToAdd))
        .rejects
        .toThrow('Some students are already in the group');

      console.log('✅ [Group Functions Tests] Rechazo por estudiantes duplicados verificado');
    });

    it('❌ Debe rechazar adición a grupo inexistente', async () => {
      const nonExistentGroupId = new ObjectId();
      const studentsToAdd = [testStudentIds[1].toString()];

      await expect(addStudentsToGroup(nonExistentGroupId.toString(), studentsToAdd))
        .rejects
        .toThrow(`Group with id ${nonExistentGroupId} does not exist`);

      console.log('✅ [Group Functions Tests] Rechazo por grupo inexistente en adición verificado');
    });
  });

  /**
   * Tests de Obtención de Grupos con Estudiantes
   */
  describe('📋 getGroupsWithStudents', () => {
    
    it('✅ Debe obtener grupos con información de estudiantes', async () => {
      // Crear grupos con estudiantes
      const group1Data = {
        name: 'Group 1',
        students: [testStudentIds[0], testStudentIds[1]],
        activity: testActivityId
      };
      const group2Data = {
        name: 'Group 2',
        students: [testStudentIds[2], testStudentIds[3]],
        activity: testActivityId
      };

      const createdGroup1 = await createGroup(testActivityId.toString(), group1Data);
      const createdGroup2 = await createGroup(testActivityId.toString(), group2Data);

      // Obtener grupos con estudiantes
      const groupsWithStudents = await getGroupsWithStudents([createdGroup1._id, createdGroup2._id]);

      expect(groupsWithStudents).toHaveLength(2);

      // Verificar que cada grupo tiene información de estudiantes
      for (const group of groupsWithStudents!) {
        expect(group.students).toBeDefined();
        expect(group.students).toHaveLength(2);
        
        // Verificar que no se retornan campos sensibles
        for (const student of group.students) {
          expect(student.password).toBeUndefined();
          expect(student.activities).toBeUndefined();
          expect(student.groups).toBeUndefined();
        }
      }

      console.log('✅ [Group Functions Tests] Obtención de grupos con estudiantes verificada');
    });

    it('✅ Debe manejar array vacío de grupos', async () => {
      const result = await getGroupsWithStudents([]);

      expect(result).toEqual([]);

      console.log('✅ [Group Functions Tests] Manejo de array vacío verificado');
    });

    it('✅ Debe manejar grupos inexistentes sin fallar', async () => {
      const nonExistentGroupIds = [new ObjectId(), new ObjectId()];

      const result = await getGroupsWithStudents(nonExistentGroupIds);

      expect(result).toEqual([]);

      console.log('✅ [Group Functions Tests] Manejo de grupos inexistentes verificado');
    });
  });

  /**
   * Tests de Validaciones de Integridad
   */
  describe('🛡️ Validaciones de Integridad', () => {
    
    it('❌ Debe manejar estudiantes inexistentes graciosamente', async () => {
      const nonExistentStudentId = new ObjectId();
      
      const groupData = {
        name: 'Group with Nonexistent Student',
        students: [testStudentIds[0], nonExistentStudentId],
        activity: testActivityId
      };

      await expect(createGroup(testActivityId.toString(), groupData))
        .rejects
        .toThrow('Some students do not belong to the activity');

      console.log('✅ [Group Functions Tests] Manejo de estudiantes inexistentes verificado');
    });

    it('❌ Debe manejar errores de base de datos graciosamente', async () => {
      if (collections.groups) {
        // Simular error de inserción
        const originalInsertOne = collections.groups.insertOne;
        collections.groups.insertOne = jest.fn().mockRejectedValue(new Error('Database insertion failed'));

        const groupData = {
          name: 'DB Error Group',
          students: [testStudentIds[0]],
          activity: testActivityId
        };

        await expect(createGroup(testActivityId.toString(), groupData))
          .rejects
          .toThrow('Database insertion failed');

        // Restaurar función original
        collections.groups.insertOne = originalInsertOne;
      }

      console.log('✅ [Group Functions Tests] Manejo de errores de DB verificado');
    });

    it('✅ Debe mantener consistencia en operaciones complejas', async () => {
      // Crear múltiples grupos y verificar que no hay inconsistencias
      const operations = [];

      for (let i = 0; i < 3; i++) {
        const groupData = {
          name: `Consistency Group ${i}`,
          students: [testStudentIds[i]],
          activity: testActivityId
        };
        operations.push(createGroup(testActivityId.toString(), groupData));
      }

      const createdGroups = await Promise.all(operations);

      // Verificar que todos los grupos fueron creados
      expect(createdGroups).toHaveLength(3);

      // Verificar que la actividad tiene todos los grupos
      const updatedActivity = await collections.activities?.findOne({ _id: testActivityId });
      expect(updatedActivity?.groups).toHaveLength(3);

      // Verificar que cada estudiante está en su grupo correspondiente
      for (let i = 0; i < 3; i++) {
        const student = await collections.users?.findOne({ _id: testStudentIds[i] });
        expect(student?.groups).toContain(createdGroups[i]._id);
      }

      console.log('✅ [Group Functions Tests] Consistencia en operaciones complejas verificada');
    });
  });

  /**
   * Tests de Performance y Casos Edge
   */
  describe('⚡ Performance y Edge Cases', () => {
    
    it('✅ Debe manejar grupos con muchos estudiantes', async () => {
      // Crear más estudiantes para el test
      const manyStudentIds = [...testStudentIds];
      
      for (let i = 6; i <= 15; i++) {
        const student = {
          email: `student${i}@teamlens.test`,
          name: `Test Student ${i}`,
          password: 'hashedpassword',
          role: 'student',
          activities: [testActivityId],
          groups: []
        };
        const result = await collections.users?.insertOne(student);
        manyStudentIds.push(result!.insertedId);
      }

      // Actualizar actividad con todos los estudiantes
      await collections.activities?.updateOne(
        { _id: testActivityId },
        { $set: { students: manyStudentIds } }
      );

      const groupData = {
        name: 'Large Group',
        students: manyStudentIds,
        activity: testActivityId
      };

      const createdGroup = await createGroup(testActivityId.toString(), groupData);

      expect(createdGroup.students).toHaveLength(manyStudentIds.length);

      console.log('✅ [Group Functions Tests] Manejo de grupos grandes verificado');
    });

    it('✅ Debe manejar operaciones concurrentes sin conflictos', async () => {
      // Crear múltiples grupos concurrentemente con estudiantes diferentes
      const groupPromises = [];

      for (let i = 0; i < 3; i++) {
        const groupData = {
          name: `Concurrent Group ${i}`,
          students: [testStudentIds[i]],
          activity: testActivityId
        };
        groupPromises.push(createGroup(testActivityId.toString(), groupData));
      }

      const results = await Promise.all(groupPromises);

      // Verificar que todos los grupos fueron creados correctamente
      expect(results).toHaveLength(3);
      
      for (const result of results) {
        expect(result._id).toBeDefined();
        expect(result.students).toHaveLength(1);
      }

      console.log('✅ [Group Functions Tests] Operaciones concurrentes verificadas');
    });
  });

  /**
   * Cleanup después de todos los tests
   */
  afterAll(async () => {
    console.log('🧹 [Group Functions Tests] Limpiando recursos...');
    
    // Limpiar todas las colecciones
    if (collections.users) await collections.users.deleteMany({});
    if (collections.activities) await collections.activities.deleteMany({});
    if (collections.groups) await collections.groups.deleteMany({});
    
    console.log('✅ [Group Functions Tests] Tests de funciones de grupo completados');
  });
}); 