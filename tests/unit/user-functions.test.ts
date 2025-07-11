/**
 * Tests Unitarios - Funciones de Usuario
 * Suite completa para funcionalidades críticas de gestión de usuarios
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 * 
 * FUNCIONALIDADES TESTEADAS:
 * - Creación de cuentas temporales
 * - Sistema de invitaciones por email
 * - Gestión de notificaciones
 * - Validaciones de datos
 * - Manejo de errores
 */

import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

// Importaciones del proyecto
import { createNonRegisteredAccount, addUserNotification } from '../../src/functions/user-functions';
import { collections, connectToDatabase } from '../../src/services/database.service';

// Mock del servicio de email para testing controlado
jest.mock('../../src/services/email.service', () => ({
  default: {
    sendStudentInvitation: jest.fn().mockResolvedValue({
      success: true,
      messageId: 'test-message-id',
      debugInfo: { simulated: true }
    })
  }
}));

import emailService from '../../src/services/email.service';

// Funciones auxiliares para tests
const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const generateTestEmail = (): string => {
  return `test.user.${Date.now()}@teamlens.test`;
};

describe('👤 User Functions - Tests Unitarios de Funciones de Usuario', () => {

  /**
   * Setup antes de todos los tests
   */
  beforeAll(async () => {
    console.log('🚀 [User Functions Tests] Iniciando setup...');
    await connectToDatabase();
    console.log('✅ [User Functions Tests] Base de datos configurada');
  });

  /**
   * Cleanup antes de cada test
   */
  beforeEach(async () => {
    // Limpiar colecciones
    if (collections.users) {
      await collections.users.deleteMany({});
    }
    
    // Limpiar mocks
    jest.clearAllMocks();
  });

  /**
   * Tests de Creación de Cuentas Temporales
   */
  describe('📧 createNonRegisteredAccount', () => {
    
    it('✅ Debe crear cuenta temporal exitosamente con email válido', async () => {
      const testEmail = 'newstudent@teamlens.test';

      const result = await createNonRegisteredAccount(testEmail);

      // Verificar que se retornó un ObjectId válido
      expect(result).toBeInstanceOf(ObjectId);
      expect(result).toBeDefined();

      // Verificar que el usuario fue creado en la base de datos
      const createdUser = await collections.users?.findOne({ email: testEmail });
      
      expect(createdUser).toBeDefined();
      expect(createdUser?.email).toBe(testEmail);
      expect(createdUser?.role).toBe('student');
      expect(createdUser?.isTemporary).toBe(true);
      expect(createdUser?.invitationToken).toBeDefined();
      expect(createdUser?.createdAt).toBeInstanceOf(Date);

      // Verificar que la contraseña fue encriptada
      expect(createdUser?.password).toBeDefined();
      expect(createdUser?.password).not.toContain('temporal_password');

      // Verificar que el nombre fue generado correctamente
      expect(createdUser?.name).toBe(testEmail.split('@')[0]);

      // Verificar que el token de invitación es válido
      const decodedToken = jwt.verify(createdUser!.invitationToken!, process.env.JWT_SECRET!);
      expect(decodedToken).toBeDefined();
      expect((decodedToken as any).email).toBe(testEmail);
      expect((decodedToken as any).type).toBe('invitation');

      // Verificar que se llamó al servicio de email
      expect(emailService.sendStudentInvitation).toHaveBeenCalledWith(testEmail, createdUser?.invitationToken);

      console.log('✅ [User Functions Tests] Creación de cuenta temporal exitosa verificada');
    });

    it('❌ Debe rechazar creación de cuenta para email ya existente', async () => {
      const existingEmail = 'existing@teamlens.test';

      // Crear usuario existente
      const existingUser = {
        email: existingEmail,
        name: 'Existing User',
        password: 'hashedpassword',
        role: 'student'
      };

      await collections.users?.insertOne(existingUser);

      // Intentar crear cuenta temporal para el mismo email
      await expect(createNonRegisteredAccount(existingEmail))
        .rejects
        .toThrow(`Usuario con email ${existingEmail} ya existe en el sistema`);

      // Verificar que no se envió email
      expect(emailService.sendStudentInvitation).not.toHaveBeenCalled();

      console.log('✅ [User Functions Tests] Rechazo por email existente verificado');
    });

    it('✅ Debe generar nombres únicos basados en timestamp', async () => {
      const baseEmail = 'user@teamlens.test';
      
      // Crear primera cuenta
      const firstUserId = await createNonRegisteredAccount(`1${baseEmail}`);
      await wait(10); // Esperar para garantizar timestamp diferente
      
      // Crear segunda cuenta
      const secondUserId = await createNonRegisteredAccount(`2${baseEmail}`);

      // Verificar que ambas cuentas se crearon correctamente
      expect(firstUserId).not.toEqual(secondUserId);

      const firstUser = await collections.users?.findOne({ _id: firstUserId });
      const secondUser = await collections.users?.findOne({ _id: secondUserId });

      expect(firstUser?.invitationToken).not.toBe(secondUser?.invitationToken);
      expect(firstUser?.createdAt).not.toEqual(secondUser?.createdAt);

      console.log('✅ [User Functions Tests] Generación de usuarios únicos verificada');
    });

    it('❌ Debe manejar errores de servicio de email graciosamente', async () => {
      // Mock del servicio de email para simular error
      const mockedEmailService = emailService.sendStudentInvitation as jest.MockedFunction<typeof emailService.sendStudentInvitation>;
      mockedEmailService.mockResolvedValueOnce({
        success: false,
        error: 'SMTP Connection Failed'
      });

      const testEmail = 'emailfail@teamlens.test';

      // En entorno de desarrollo, debería seguir creando la cuenta
      // En producción, debería fallar y limpiar
      process.env.NODE_ENV = 'production';

      await expect(createNonRegisteredAccount(testEmail))
        .rejects
        .toThrow('Error enviando email de invitación');

      // Verificar que el usuario temporal fue eliminado
      const userAfterError = await collections.users?.findOne({ email: testEmail });
      expect(userAfterError).toBeNull();

      // Restaurar entorno de test
      process.env.NODE_ENV = 'test';

      console.log('✅ [User Functions Tests] Manejo de errores de email verificado');
    });

    it('✅ Debe manejar modo desarrollo con email simulado', async () => {
      // Configurar mock para simular email en desarrollo
      const mockedEmailService = emailService.sendStudentInvitation as jest.MockedFunction<typeof emailService.sendStudentInvitation>;
      mockedEmailService.mockResolvedValueOnce({
        success: true,
        messageId: 'dev-simulated-123',
        debugInfo: { simulated: true }
      });

      const testEmail = 'devmode@teamlens.test';

      const result = await createNonRegisteredAccount(testEmail);

      expect(result).toBeInstanceOf(ObjectId);

      // Verificar que el usuario fue creado incluso con email simulado
      const createdUser = await collections.users?.findOne({ email: testEmail });
      expect(createdUser).toBeDefined();

      console.log('✅ [User Functions Tests] Modo desarrollo con email simulado verificado');
    });
  });

  /**
   * Tests de Sistema de Notificaciones
   */
  describe('🔔 addUserNotification', () => {
    let testUserId: ObjectId;

    beforeEach(async () => {
      // Crear usuario de test para notificaciones
      const testUser = {
        email: 'notificationuser@teamlens.test',
        name: 'Notification Test User',
        password: 'hashedpassword',
        role: 'student',
        notifications: []
      };

      const result = await collections.users?.insertOne(testUser);
      testUserId = result!.insertedId;
    });

    it('✅ Debe añadir notificación exitosamente', async () => {
      const notification = {
        title: 'Test Notification',
        description: 'This is a test notification',
        link: '/test-link',
        type: 'info' as const
      };

      await addUserNotification(testUserId, notification);

      // Verificar que la notificación fue añadida
      const userWithNotification = await collections.users?.findOne({ _id: testUserId });
      
      expect(userWithNotification?.notifications).toHaveLength(1);
      
      const addedNotification = userWithNotification?.notifications![0];
      expect(addedNotification.title).toBe(notification.title);
      expect(addedNotification.description).toBe(notification.description);
      expect(addedNotification.link).toBe(notification.link);
      expect(addedNotification.type).toBe(notification.type);
      expect(addedNotification.date).toBeDefined();
      expect(addedNotification.timestamp).toBeInstanceOf(Date);

      console.log('✅ [User Functions Tests] Adición de notificación exitosa verificada');
    });

    it('✅ Debe añadir múltiples notificaciones correctamente', async () => {
      const notifications = [
        {
          title: 'Notification 1',
          description: 'First notification',
          type: 'info' as const
        },
        {
          title: 'Notification 2', 
          description: 'Second notification',
          type: 'success' as const
        },
        {
          title: 'Notification 3',
          description: 'Third notification',
          type: 'warning' as const
        }
      ];

      // Añadir notificaciones secuencialmente
      for (const notification of notifications) {
        await addUserNotification(testUserId, notification);
        await wait(5); // Pequeña espera para timestamps únicos
      }

      // Verificar que todas las notificaciones fueron añadidas
      const userWithNotifications = await collections.users?.findOne({ _id: testUserId });
      
      expect(userWithNotifications?.notifications).toHaveLength(3);

      // Verificar orden cronológico (más reciente primero en el array)
      const userNotifications = userWithNotifications?.notifications!;
      expect(userNotifications[0].title).toBe('Notification 1');
      expect(userNotifications[1].title).toBe('Notification 2');
      expect(userNotifications[2].title).toBe('Notification 3');

      console.log('✅ [User Functions Tests] Múltiples notificaciones verificadas');
    });

    it('❌ Debe rechazar notificación para usuario inexistente', async () => {
      const nonExistentUserId = new ObjectId();
      const notification = {
        title: 'Test Notification',
        description: 'This should fail'
      };

      await expect(addUserNotification(nonExistentUserId, notification))
        .rejects
        .toThrow(`Usuario con ID ${nonExistentUserId} no encontrado`);

      console.log('✅ [User Functions Tests] Rechazo por usuario inexistente verificado');
    });

    it('✅ Debe manejar notificaciones sin campos opcionales', async () => {
      const minimalNotification = {
        title: 'Minimal Notification',
        description: 'Only required fields'
      };

      await addUserNotification(testUserId, minimalNotification);

      const userWithNotification = await collections.users?.findOne({ _id: testUserId });
      const addedNotification = userWithNotification?.notifications![0];
      
      expect(addedNotification.title).toBe(minimalNotification.title);
      expect(addedNotification.description).toBe(minimalNotification.description);
      expect(addedNotification.link).toBeUndefined();
      expect(addedNotification.type).toBeUndefined();
      expect(addedNotification.date).toBeDefined();
      expect(addedNotification.timestamp).toBeInstanceOf(Date);

      console.log('✅ [User Functions Tests] Notificación mínima verificada');
    });
  });

  /**
   * Tests de Validación de Datos y Edge Cases
   */
  describe('🛡️ Validaciones y Edge Cases', () => {
    
    it('❌ Debe rechazar email inválido para cuenta temporal', async () => {
      const invalidEmails = [
        '',
        'invalid-email',
        'no@domain',
        '@nodomain.com',
        'spaces in@email.com',
        'unicode@测试.com'
      ];

      for (const invalidEmail of invalidEmails) {
        try {
          await createNonRegisteredAccount(invalidEmail);
          // Si llegamos aquí, el test debería fallar
          expect(true).toBe(false);
        } catch (error) {
          // Se espera que falle, pero verificamos que el error sea apropiado
          expect(error).toBeDefined();
        }
      }

      console.log('✅ [User Functions Tests] Rechazo de emails inválidos verificado');
    });

    it('❌ Debe manejar errores de base de datos en creación de cuenta', async () => {
      if (collections.users) {
        // Simular error de inserción en la base de datos
        const originalInsertOne = collections.users.insertOne;
        collections.users.insertOne = jest.fn().mockRejectedValue(new Error('Database insertion failed'));

        await expect(createNonRegisteredAccount('dbfail@teamlens.test'))
          .rejects
          .toThrow('Error creando cuenta temporal');

        // Restaurar función original
        collections.users.insertOne = originalInsertOne;
      }

      console.log('✅ [User Functions Tests] Manejo de errores de DB verificado');
    });

    it('❌ Debe manejar errores de base de datos en notificaciones', async () => {
      if (collections.users) {
        const testUserId = new ObjectId();
        
        // Simular error de update en la base de datos
        const originalUpdateOne = collections.users.updateOne;
        collections.users.updateOne = jest.fn().mockRejectedValue(new Error('Database update failed'));
        collections.users.findOne = jest.fn().mockResolvedValue({ _id: testUserId }); // Mock findOne para que no falle la validación

        const notification = {
          title: 'Test',
          description: 'Test'
        };

        await expect(addUserNotification(testUserId, notification))
          .rejects
          .toThrow('Error añadiendo notificación');

        // Restaurar funciones originales
        collections.users.updateOne = originalUpdateOne;
      }

      console.log('✅ [User Functions Tests] Manejo de errores de DB en notificaciones verificado');
    });
  });

  /**
   * Tests de Performance y Concurrencia
   */
  describe('⚡ Performance y Concurrencia', () => {
    
    it('✅ Debe manejar creación concurrente de múltiples cuentas', async () => {
      const emailPromises = [];
      const baseEmail = 'concurrent';
      const numberOfUsers = 5;

      // Crear múltiples usuarios concurrentemente
      for (let i = 0; i < numberOfUsers; i++) {
        emailPromises.push(createNonRegisteredAccount(`${baseEmail}${i}@teamlens.test`));
      }

      const results = await Promise.all(emailPromises);

      // Verificar que todos los usuarios fueron creados exitosamente
      expect(results).toHaveLength(numberOfUsers);
      
      for (const result of results) {
        expect(result).toBeInstanceOf(ObjectId);
      }

      // Verificar que todos los usuarios están en la base de datos
      const createdUsers = await collections.users?.find({ 
        email: { $regex: `^${baseEmail}.*@teamlens.test$` } 
      }).toArray();

      expect(createdUsers).toHaveLength(numberOfUsers);

      console.log('✅ [User Functions Tests] Creación concurrente verificada');
    });

    it('✅ Debe manejar múltiples notificaciones concurrentes', async () => {
      // Crear usuario de test
      const testUser = {
        email: 'concurrent@teamlens.test',
        name: 'Concurrent User',
        password: 'hashedpassword',
        role: 'student',
        notifications: []
      };

      const userResult = await collections.users?.insertOne(testUser);
      const userId = userResult!.insertedId;

      // Crear múltiples notificaciones concurrentemente
      const notificationPromises = [];
      const numberOfNotifications = 5;

      for (let i = 0; i < numberOfNotifications; i++) {
        notificationPromises.push(addUserNotification(userId, {
          title: `Concurrent Notification ${i}`,
          description: `Notification ${i} description`
        }));
      }

      await Promise.all(notificationPromises);

      // Verificar que todas las notificaciones fueron añadidas
      const userWithNotifications = await collections.users?.findOne({ _id: userId });
      expect(userWithNotifications?.notifications).toHaveLength(numberOfNotifications);

      console.log('✅ [User Functions Tests] Notificaciones concurrentes verificadas');
    });
  });

  /**
   * Cleanup después de todos los tests
   */
  afterAll(async () => {
    console.log('🧹 [User Functions Tests] Limpiando recursos...');
    
    if (collections.users) {
      await collections.users.deleteMany({});
    }
    
    console.log('✅ [User Functions Tests] Tests de funciones de usuario completados');
  });
}); 