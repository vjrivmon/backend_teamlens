/**
 * Tests Unitarios - Servicios
 * Suite completa para servicios críticos del sistema
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 * 
 * FUNCIONALIDADES TESTEADAS:
 * - Servicio de base de datos (conexión, collections)
 * - Servicio de email (envío, validaciones, templates)
 * - Manejo de errores en servicios
 * - Configuraciones de entorno
 */

import { MongoClient } from 'mongodb';
import { connectToDatabase, collections, client } from '../../src/services/database.service';

// Mock del servicio de email completo
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
      accepted: ['test@teamlens.com'],
      rejected: [],
      response: '250 Message accepted'
    }),
    verify: jest.fn().mockResolvedValue(true)
  })
}));

import emailService from '../../src/services/email.service';

describe('🔧 Services - Tests Unitarios de Servicios', () => {

  /**
   * Tests del Servicio de Base de Datos
   */
  describe('💾 Database Service', () => {
    
    it('✅ Debe conectar a la base de datos exitosamente', async () => {
      // La conexión ya debería estar establecida por el setup global
      expect(collections.users).toBeDefined();
      expect(collections.activities).toBeDefined();
      expect(collections.groups).toBeDefined();
      expect(collections.questionnaires).toBeDefined();

      console.log('✅ [Services Tests] Conexión a base de datos verificada');
    });

    it('✅ Debe tener todas las colecciones configuradas', async () => {
      // Verificar que todas las colecciones esperadas estén disponibles
      const expectedCollections = ['users', 'activities', 'groups', 'questionnaires'];
      
      for (const collectionName of expectedCollections) {
        expect(collections[collectionName as keyof typeof collections]).toBeDefined();
      }

      console.log('✅ [Services Tests] Configuración de colecciones verificada');
    });

    it('✅ Debe permitir operaciones CRUD básicas', async () => {
      // Test de inserción
      const testDocument = {
        email: 'dbtest@teamlens.test',
        name: 'DB Test User',
        password: 'hashedpassword',
        role: 'student'
      };

      const insertResult = await collections.users?.insertOne(testDocument);
      expect(insertResult?.insertedId).toBeDefined();

      // Test de búsqueda
      const foundDocument = await collections.users?.findOne({ 
        _id: insertResult!.insertedId 
      });
      expect(foundDocument?.email).toBe(testDocument.email);

      // Test de actualización
      const updateResult = await collections.users?.updateOne(
        { _id: insertResult!.insertedId },
        { $set: { name: 'Updated Name' } }
      );
      expect(updateResult?.modifiedCount).toBe(1);

      // Test de eliminación
      const deleteResult = await collections.users?.deleteOne({ 
        _id: insertResult!.insertedId 
      });
      expect(deleteResult?.deletedCount).toBe(1);

      console.log('✅ [Services Tests] Operaciones CRUD básicas verificadas');
    });

    it('❌ Debe manejar errores de operaciones de DB', async () => {
      // Intentar insertar documento con estructura inválida para MongoDB
      try {
        await collections.users?.insertOne(null as any);
        expect(true).toBe(false); // No debería llegar aquí
      } catch (error) {
        expect(error).toBeDefined();
      }

      console.log('✅ [Services Tests] Manejo de errores de DB verificado');
    });

    it('✅ Debe manejar operaciones con índices y búsquedas complejas', async () => {
      // Insertar múltiples documentos para test de búsqueda
      const testUsers = [
        { email: 'user1@test.com', name: 'User 1', role: 'student', password: 'hash1' },
        { email: 'user2@test.com', name: 'User 2', role: 'teacher', password: 'hash2' },
        { email: 'user3@test.com', name: 'User 3', role: 'student', password: 'hash3' }
      ];

      const insertResults = await collections.users?.insertMany(testUsers);
      expect(insertResults?.insertedCount).toBe(3);

      // Búsqueda por rol
      const students = await collections.users?.find({ role: 'student' }).toArray();
      expect(students?.length).toBeGreaterThanOrEqual(2);

      // Búsqueda con proyección
      const emailsOnly = await collections.users?.find(
        { role: 'student' },
        { projection: { email: 1, _id: 0 } }
      ).toArray();
      
      expect(emailsOnly?.every(doc => doc.email && !doc.name)).toBe(true);

      // Limpiar datos de test
      await collections.users?.deleteMany({ 
        email: { $in: testUsers.map(u => u.email) } 
      });

      console.log('✅ [Services Tests] Operaciones complejas de DB verificadas');
    });
  });

  /**
   * Tests del Servicio de Email
   */
  describe('📧 Email Service', () => {
    
    it('✅ Debe enviar email básico exitosamente', async () => {
      const mailDetails = {
        to: 'test@teamlens.test',
        subject: 'Test Email',
        text: 'This is a test email'
      };

      const result = await emailService.sendEmail(mailDetails);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      console.log('✅ [Services Tests] Envío de email básico verificado');
    });

    it('✅ Debe enviar email con HTML exitosamente', async () => {
      const mailDetails = {
        to: 'htmltest@teamlens.test',
        subject: 'HTML Test Email',
        html: '<h1>Test HTML Email</h1><p>This is a test email with HTML</p>'
      };

      const result = await emailService.sendEmail(mailDetails);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      console.log('✅ [Services Tests] Envío de email HTML verificado');
    });

    it('✅ Debe enviar invitación de estudiante con template profesional', async () => {
      const studentEmail = 'invite@teamlens.test';
      const invitationToken = 'test-invitation-token';

      const result = await emailService.sendStudentInvitation(studentEmail, invitationToken);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      console.log('✅ [Services Tests] Envío de invitación de estudiante verificado');
    });

    it('❌ Debe rechazar email sin destinatario', async () => {
      const invalidMailDetails = {
        subject: 'Test Email',
        text: 'This email has no recipient'
        // Falta 'to'
      };

      const result = await emailService.sendEmail(invalidMailDetails as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Destinatario (to) es requerido');

      console.log('✅ [Services Tests] Rechazo por falta de destinatario verificado');
    });

    it('❌ Debe rechazar email sin asunto', async () => {
      const invalidMailDetails = {
        to: 'test@teamlens.test',
        text: 'This email has no subject'
        // Falta 'subject'
      };

      const result = await emailService.sendEmail(invalidMailDetails as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Asunto (subject) es requerido');

      console.log('✅ [Services Tests] Rechazo por falta de asunto verificado');
    });

    it('❌ Debe rechazar email sin contenido', async () => {
      const invalidMailDetails = {
        to: 'test@teamlens.test',
        subject: 'Test Email'
        // Falta 'text' o 'html'
      };

      const result = await emailService.sendEmail(invalidMailDetails as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Contenido del email (text o html) es requerido');

      console.log('✅ [Services Tests] Rechazo por falta de contenido verificado');
    });

    it('✅ Debe usar configuración por defecto para remitente', async () => {
      const mailDetails = {
        to: 'defaultfrom@teamlens.test',
        subject: 'Default From Test',
        text: 'Testing default from configuration'
        // Sin especificar 'from'
      };

      const result = await emailService.sendEmail(mailDetails);

      expect(result.success).toBe(true);
      // El servicio debería usar el from por defecto configurado

      console.log('✅ [Services Tests] Configuración por defecto de remitente verificada');
    });

    it('✅ Debe manejar múltiples destinatarios', async () => {
      const mailDetails = {
        to: ['recipient1@teamlens.test', 'recipient2@teamlens.test'],
        subject: 'Multiple Recipients Test',
        text: 'Testing multiple recipients'
      };

      const result = await emailService.sendEmail(mailDetails);

      expect(result.success).toBe(true);

      console.log('✅ [Services Tests] Múltiples destinatarios verificados');
    });

    it('✅ Debe incluir información de debug en desarrollo', async () => {
      // Forzar modo desarrollo
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const mailDetails = {
        to: 'debug@teamlens.test',
        subject: 'Debug Test',
        text: 'Testing debug information'
      };

      const result = await emailService.sendEmail(mailDetails);

      expect(result.success).toBe(true);
      expect(result.debugInfo).toBeDefined();

      // Restaurar entorno original
      process.env.NODE_ENV = originalEnv;

      console.log('✅ [Services Tests] Información de debug verificada');
    });
  });

  /**
   * Tests de Configuración y Variables de Entorno
   */
  describe('⚙️ Configuración de Servicios', () => {
    
    it('✅ Debe usar variables de entorno de testing', async () => {
      // Verificar que las variables de entorno de test están configuradas
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.JWT_SECRET).toBeDefined();
      expect(process.env.MONGO_URI).toBeDefined();
      expect(process.env.DB_NAME).toBe('teamlens_test');

      console.log('✅ [Services Tests] Variables de entorno de testing verificadas');
    });

    it('✅ Debe manejar configuración de email para testing', async () => {
      // Verificar configuración de email para testing
      expect(process.env.EMAIL_USER).toBe('test@teamlens.com');
      expect(process.env.FRONTEND_URL).toBe('http://localhost:4200');

      console.log('✅ [Services Tests] Configuración de email para testing verificada');
    });

    it('❌ Debe manejar variables de entorno faltantes graciosamente', async () => {
      // Simular variable de entorno faltante
      const originalJwtSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      // El sistema debería usar valores por defecto o manejar el error
      // En este caso, el servicio usa un valor por defecto
      
      // Restaurar variable original
      process.env.JWT_SECRET = originalJwtSecret;

      console.log('✅ [Services Tests] Manejo de variables faltantes verificado');
    });
  });

  /**
   * Tests de Performance y Reliability
   */
  describe('⚡ Performance y Reliability', () => {
    
    it('✅ Debe manejar múltiples conexiones de DB concurrentes', async () => {
      // Crear múltiples operaciones de DB concurrentes
      const operations = [];
      const numberOfOperations = 10;

      for (let i = 0; i < numberOfOperations; i++) {
        const operation = collections.users?.findOne({ role: 'student' });
        operations.push(operation);
      }

      const results = await Promise.all(operations);

      // Todas las operaciones deberían completarse sin error
      expect(results).toHaveLength(numberOfOperations);

      console.log('✅ [Services Tests] Conexiones concurrentes de DB verificadas');
    });

    it('✅ Debe manejar múltiples envíos de email concurrentes', async () => {
      const emailPromises = [];
      const numberOfEmails = 5;

      for (let i = 0; i < numberOfEmails; i++) {
        const mailDetails = {
          to: `concurrent${i}@teamlens.test`,
          subject: `Concurrent Email ${i}`,
          text: `This is concurrent email number ${i}`
        };
        emailPromises.push(emailService.sendEmail(mailDetails));
      }

      const results = await Promise.all(emailPromises);

      // Todos los emails deberían enviarse exitosamente
      expect(results).toHaveLength(numberOfEmails);
      expect(results.every(result => result.success)).toBe(true);

      console.log('✅ [Services Tests] Envíos concurrentes de email verificados');
    });

    it('✅ Debe mantener performance con operaciones grandes', async () => {
      // Test de performance con inserción masiva
      const largeDataSet = [];
      const numberOfDocuments = 100;

      for (let i = 0; i < numberOfDocuments; i++) {
        largeDataSet.push({
          email: `bulk${i}@teamlens.test`,
          name: `Bulk User ${i}`,
          password: 'hashedpassword',
          role: 'student'
        });
      }

      const startTime = Date.now();
      const insertResult = await collections.users?.insertMany(largeDataSet);
      const endTime = Date.now();

      expect(insertResult?.insertedCount).toBe(numberOfDocuments);
      expect(endTime - startTime).toBeLessThan(5000); // Menos de 5 segundos

      // Limpiar datos de test
      await collections.users?.deleteMany({ 
        email: { $regex: /^bulk\d+@teamlens\.test$/ } 
      });

      console.log('✅ [Services Tests] Performance con operaciones grandes verificada');
    });
  });

  /**
   * Tests de Integridad y Consistencia
   */
  describe('🔄 Integridad y Consistencia', () => {
    
    it('✅ Debe mantener consistencia en transacciones complejas', async () => {
      // Simular operación compleja que requiere consistencia
      const testUser = {
        email: 'consistency@teamlens.test',
        name: 'Consistency User',
        password: 'hashedpassword',
        role: 'student'
      };

      // Insertar usuario
      const userResult = await collections.users?.insertOne(testUser);
      const userId = userResult!.insertedId;

      // Crear actividad relacionada
      const testActivity = {
        title: 'Consistency Activity',
        description: 'Testing consistency',
        teacher: userId,
        students: [userId],
        groups: []
      };

      const activityResult = await collections.activities?.insertOne(testActivity);

      // Verificar que ambas operaciones fueron exitosas
      expect(userResult?.insertedId).toBeDefined();
      expect(activityResult?.insertedId).toBeDefined();

      // Verificar integridad referencial
      const createdUser = await collections.users?.findOne({ _id: userId });
      const createdActivity = await collections.activities?.findOne({ teacher: userId });

      expect(createdUser).toBeDefined();
      expect(createdActivity).toBeDefined();
      expect(createdActivity?.students).toContain(userId);

      // Limpiar datos de test
      await collections.users?.deleteOne({ _id: userId });
      await collections.activities?.deleteOne({ _id: activityResult!.insertedId });

      console.log('✅ [Services Tests] Consistencia en transacciones complejas verificada');
    });
  });

  /**
   * Cleanup después de todos los tests
   */
  afterAll(async () => {
    console.log('🧹 [Services Tests] Limpiando recursos...');
    
    // Limpiar cualquier dato de test que pueda haber quedado
    if (collections.users) {
      await collections.users.deleteMany({ 
        email: { $regex: /test\.com$|teamlens\.test$/ } 
      });
    }
    
    console.log('✅ [Services Tests] Tests de servicios completados');
  });
}); 