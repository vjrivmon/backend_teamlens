/**
 * Tests Unitarios - Módulo de Autenticación
 * Suite completa de testing para funcionalidades críticas de seguridad
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 * 
 * FUNCIONALIDADES TESTEADAS:
 * - Login de usuarios (teacher/student)
 * - Registro de profesores
 * - Registro de estudiantes con invitación
 * - Validación de tokens JWT
 * - Reset de contraseñas
 * - Manejo de errores de seguridad
 */

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';

// Importaciones del proyecto
import { authRouter } from '../../src/routes/auth.router';
import { collections, connectToDatabase } from '../../src/services/database.service';

// Setup de aplicación Express para testing
const app = express();
app.use(express.json());

// Mock de cookie-session middleware para testing
app.use((req: any, res: any, next: any) => {
  req.session = req.session || {};
  next();
});

app.use('/auth', authRouter);

describe('🔐 Auth Module - Tests Unitarios de Autenticación', () => {
  let testDbConnection: MongoClient;
  let testUser: any;
  let teacherUser: any;

  /**
   * Setup antes de todos los tests de autenticación
   */
  beforeAll(async () => {
    console.log('🚀 [Auth Tests] Iniciando setup de tests de autenticación...');
    
    // Conectar a la base de datos de test
    await connectToDatabase();
    testDbConnection = global.testDbConnection;
    
    console.log('✅ [Auth Tests] Base de datos de test configurada');
  });

  /**
   * Cleanup antes de cada test
   */
  beforeEach(async () => {
    // Limpiar colecciones antes de cada test
    if (collections.users) {
      await collections.users.deleteMany({});
    }
    
    // Crear usuarios de test
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('TestPassword123!', salt);
    
    testUser = {
      email: 'student@teamlens.test',
      name: 'Test Student',
      password: hashedPassword,
      role: 'student'
    };
    
    teacherUser = {
      email: 'teacher@teamlens.test',
      name: 'Test Teacher',  
      password: hashedPassword,
      role: 'teacher'
    };
    
    // Insertar usuarios de test
    if (collections.users) {
      await collections.users.insertOne(testUser);
      await collections.users.insertOne(teacherUser);
    }
  });

  /**
   * Tests de Login - Funcionalidad Crítica de Seguridad
   */
  describe('🔑 POST /auth/login', () => {
    
    it('✅ Debe permitir login exitoso con credenciales válidas', async () => {
      const loginData = {
        email: 'student@teamlens.test',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      // Verificaciones críticas de seguridad
      expect(response.body.email).toBe(loginData.email);
      expect(response.body.role).toBe('student');
      expect(response.body.password).toBeUndefined(); // Password NUNCA debe retornarse
      expect(response.body._id).toBeDefined();

      console.log('✅ [Auth Tests] Login exitoso verificado');
    });

    it('❌ Debe rechazar login con email inexistente', async () => {
      const loginData = {
        email: 'noexiste@teamlens.test',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.text).toBe('(e)Invalid credentials.');
      console.log('✅ [Auth Tests] Rechazo por email inexistente verificado');
    });

    it('❌ Debe rechazar login con contraseña incorrecta', async () => {
      const loginData = {
        email: 'student@teamlens.test',
        password: 'ContrasenaIncorrecta'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.text).toBe('(p)Invalid credentials.');
      console.log('✅ [Auth Tests] Rechazo por contraseña incorrecta verificado');
    });

    it('❌ Debe rechazar login de usuario con token de invitación pendiente', async () => {
      // Crear usuario con token de invitación
      const userWithInvitation = {
        email: 'pending@teamlens.test',
        name: 'Pending User',
        password: await bcrypt.hash('TestPassword123!', 10),
        role: 'student',
        invitationToken: 'pending_token'
      };

      if (collections.users) {
        await collections.users.insertOne(userWithInvitation);
      }

      const loginData = {
        email: 'pending@teamlens.test',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.text).toBe('(p)Invalid credentials.');
      console.log('✅ [Auth Tests] Rechazo por invitación pendiente verificado');
    });
  });

  /**
   * Tests de Registro de Profesores
   */
  describe('👨‍🏫 POST /auth/register', () => {
    
    it('✅ Debe permitir registro exitoso de profesor', async () => {
      const newTeacher = {
        email: 'newteacher@teamlens.test',
        name: 'New Teacher',
        password: 'SecurePassword123!',
        role: 'teacher'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(newTeacher)
        .expect(200);

      expect(response.body.message).toContain('Successfully created a new user');
      
      // Verificar que el usuario fue creado en DB
      const createdUser = await collections.users?.findOne({ email: newTeacher.email });
      expect(createdUser).toBeDefined();
      expect(createdUser?.role).toBe('teacher');
      expect(createdUser?.password).not.toBe(newTeacher.password); // Verificar encriptación
      
      console.log('✅ [Auth Tests] Registro de profesor exitoso verificado');
    });

    it('✅ Debe asignar rol "teacher" por defecto si no se especifica', async () => {
      const newUser = {
        email: 'defaultrole@teamlens.test',
        name: 'Default Role User',
        password: 'SecurePassword123!'
        // Sin especificar role
      };

      await request(app)
        .post('/auth/register')
        .send(newUser)
        .expect(200);

      const createdUser = await collections.users?.findOne({ email: newUser.email });
      expect(createdUser?.role).toBe('teacher');
      
      console.log('✅ [Auth Tests] Asignación de rol por defecto verificada');
    });

    it('❌ Debe rechazar registro de usuario existente', async () => {
      const existingUser = {
        email: 'teacher@teamlens.test', // Usuario ya existe
        name: 'Duplicate Teacher',
        password: 'SecurePassword123!',
        role: 'teacher'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(existingUser)
        .expect(409);

      expect(response.text).toBe('User already exists.');
      console.log('✅ [Auth Tests] Rechazo por usuario duplicado verificado');
    });
  });

  /**
   * Tests de Registro de Estudiantes con Invitación
   */
  describe('🎓 POST /auth/register-student', () => {
    
    it('✅ Debe permitir registro exitoso de estudiante con token válido', async () => {
      // Crear usuario con invitación válida
      const invitationToken = jwt.sign(
        { email: 'invited@teamlens.test', type: 'invitation' },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      const invitedUser = {
        email: 'invited@teamlens.test',
        name: 'Invited Student',
        password: 'TempPassword',
        role: 'student',
        invitationToken: invitationToken,
        isTemporary: true
      };

      if (collections.users) {
        await collections.users.insertOne(invitedUser);
      }

      const registrationData = {
        email: 'invited@teamlens.test',
        name: 'Invited Student Updated',
        password: 'NewSecurePassword123!'
      };

      const response = await request(app)
        .post('/auth/register-student')
        .send(registrationData)
        .expect(200);

      expect(response.body.message).toContain('Successfully registred user');
      
      // Verificar que el token de invitación fue removido
      const updatedUser = await collections.users?.findOne({ email: registrationData.email });
      expect(updatedUser?.invitationToken).toBeUndefined();
      expect(updatedUser?.role).toBe('student');
      
      console.log('✅ [Auth Tests] Registro de estudiante con invitación verificado');
    });

    it('❌ Debe rechazar registro sin invitación previa', async () => {
      const registrationData = {
        email: 'noinvited@teamlens.test',
        name: 'No Invited Student',
        password: 'Password123!'
      };

      const response = await request(app)
        .post('/auth/register-student')
        .send(registrationData)
        .expect(409);

      expect(response.text).toBe('User not invited.');
      console.log('✅ [Auth Tests] Rechazo por falta de invitación verificado');
    });

    it('❌ Debe rechazar registro de usuario ya registrado', async () => {
      const registrationData = {
        email: 'student@teamlens.test', // Usuario ya registrado (sin token)
        name: 'Already Registered',
        password: 'Password123!'
      };

      const response = await request(app)
        .post('/auth/register-student')
        .send(registrationData)
        .expect(409);

      expect(response.text).toBe('User already exists.');
      console.log('✅ [Auth Tests] Rechazo por usuario ya registrado verificado');
    });

    it('❌ Debe rechazar registro con token inválido', async () => {
      // Crear usuario con token inválido
      const invalidUser = {
        email: 'invalidtoken@teamlens.test',
        name: 'Invalid Token User',
        password: 'TempPassword',
        role: 'student',
        invitationToken: 'invalid_jwt_token',
        isTemporary: true
      };

      if (collections.users) {
        await collections.users.insertOne(invalidUser);
      }

      const registrationData = {
        email: 'invalidtoken@teamlens.test',
        name: 'Invalid Token User',
        password: 'NewPassword123!'
      };

      const response = await request(app)
        .post('/auth/register-student')
        .send(registrationData)
        .expect(401);

      expect(response.body.message).toContain('Invalid token');
      console.log('✅ [Auth Tests] Rechazo por token inválido verificado');
    });
  });

  /**
   * Tests de Reset de Contraseña
   */
  describe('🔄 POST /auth/forgot-password & /auth/reset-password', () => {
    
    it('✅ Debe generar token de reset para email válido', async () => {
      const forgotData = {
        email: 'student@teamlens.test'
      };

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(forgotData)
        .expect(200);

      expect(response.body.message).toBe('Email sent successfully');
      
      // Verificar que el token fue guardado
      const userWithToken = await collections.users?.findOne({ email: forgotData.email });
      expect(userWithToken?.resetToken).toBeDefined();
      
      console.log('✅ [Auth Tests] Generación de token de reset verificada');
    });

    it('❌ Debe rechazar reset para email inexistente', async () => {
      const forgotData = {
        email: 'noexiste@teamlens.test'
      };

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(forgotData)
        .expect(404);

      expect(response.text).toBe('User not found.');
      console.log('✅ [Auth Tests] Rechazo de reset por email inexistente verificado');
    });

    it('✅ Debe permitir reset exitoso con token válido', async () => {
      // Generar token válido
      const resetToken = jwt.sign(
        { email: 'student@teamlens.test' },
        process.env.JWT_SECRET!,
        { expiresIn: '5m' }
      );

      // Actualizar usuario con token
      await collections.users?.updateOne(
        { email: 'student@teamlens.test' },
        { $set: { resetToken: resetToken } }
      );

      const resetData = {
        token: resetToken,
        password: 'NewSecurePassword456!'
      };

      const response = await request(app)
        .post('/auth/reset-password')
        .send(resetData)
        .expect(200);

      expect(response.body.message).toBe('Email sent successfully');
      
      // Verificar que el token fue removido
      const updatedUser = await collections.users?.findOne({ email: 'student@teamlens.test' });
      expect(updatedUser?.resetToken).toBeUndefined();
      
      console.log('✅ [Auth Tests] Reset de contraseña exitoso verificado');
    });
  });

  /**
   * Tests de Validación de Entrada y Seguridad
   */
  describe('🛡️ Validaciones de Seguridad', () => {
    
    it('❌ Debe rechazar requests con datos malformados', async () => {
      const malformedData = {
        // Email sin formato válido
        email: 'invalid-email',
        password: 'test'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(malformedData)
        .expect(401);

      console.log('✅ [Auth Tests] Rechazo de datos malformados verificado');
    });

    it('❌ Debe manejar errors de base de datos graciosamente', async () => {
      // Simular error de DB cerrando la conexión
      if (collections.users) {
        const originalFind = collections.users.findOne;
        collections.users.findOne = jest.fn().mockRejectedValue(new Error('DB Connection Error'));

        const response = await request(app)
          .post('/auth/login')
          .send({ email: 'test@test.com', password: 'test' })
          .expect(400);

        // Restaurar función original
        collections.users.findOne = originalFind;
        
        console.log('✅ [Auth Tests] Manejo de errores de DB verificado');
      }
    });
  });

  /**
   * Cleanup después de todos los tests
   */
  afterAll(async () => {
    console.log('🧹 [Auth Tests] Limpiando recursos...');
    
    if (collections.users) {
      await collections.users.deleteMany({});
    }
    
    console.log('✅ [Auth Tests] Tests de autenticación completados');
  });
}); 