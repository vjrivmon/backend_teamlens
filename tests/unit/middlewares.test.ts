/**
 * Tests Unitarios - Middlewares
 * Suite completa para componentes críticos de middleware
 * 
 * @author DevOps Senior - TeamLens Testing Suite
 * @version 1.0.0
 * 
 * FUNCIONALIDADES TESTEADAS:
 * - Verificación de tokens JWT
 * - Manejo de sesiones
 * - Validaciones de seguridad
 * - Manejo de errores de autenticación
 */

import jwt from 'jsonwebtoken';
import verifyToken from '../../src/middlewares/verify-token';

// Mock de request, response y next para testing
const mockRequest = (sessionData = {}) => ({
  session: sessionData,
  headers: {}
});

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('🛡️ Middlewares - Tests Unitarios de Middlewares', () => {

  /**
   * Setup antes de cada test
   */
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Tests del Middleware de Verificación de Token
   */
  describe('🔐 verifyToken Middleware', () => {
    
    it('✅ Debe permitir acceso con token JWT válido', async () => {
      // Generar token válido
      const userId = 'test-user-id-123';
      const validToken = jwt.sign(
        { id: userId },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const req = mockRequest({ token: validToken });
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      // Verificar que el middleware permitió continuar
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();

      // Verificar que el ID de usuario fue añadido a la sesión
      expect(req.session.authuser).toBe(userId);

      console.log('✅ [Middlewares Tests] Verificación de token válido exitosa');
    });

    it('❌ Debe rechazar acceso sin token', async () => {
      const req = mockRequest({}); // Sin token en sesión
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      // Verificar que se retornó error 403
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith({ message: "No token provided!" });
      expect(next).not.toHaveBeenCalled();

      console.log('✅ [Middlewares Tests] Rechazo por falta de token verificado');
    });

    it('❌ Debe rechazar token JWT inválido', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const req = mockRequest({ token: invalidToken });
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      // Verificar que se retornó error 401
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith({ message: "Unauthorized!" });
      expect(next).not.toHaveBeenCalled();

      console.log('✅ [Middlewares Tests] Rechazo por token inválido verificado');
    });

    it('❌ Debe rechazar token JWT expirado', async () => {
      // Generar token expirado
      const userId = 'test-user-id-456';
      const expiredToken = jwt.sign(
        { id: userId },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Token expirado hace 1 hora
      );

      const req = mockRequest({ token: expiredToken });
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      // Verificar que se retornó error 401
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith({ message: "Unauthorized!" });
      expect(next).not.toHaveBeenCalled();

      console.log('✅ [Middlewares Tests] Rechazo por token expirado verificado');
    });

    it('❌ Debe rechazar token con secret incorrecto', async () => {
      // Generar token con secret diferente
      const userId = 'test-user-id-789';
      const tokenWithWrongSecret = jwt.sign(
        { id: userId },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      const req = mockRequest({ token: tokenWithWrongSecret });
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      // Verificar que se retornó error 401
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith({ message: "Unauthorized!" });
      expect(next).not.toHaveBeenCalled();

      console.log('✅ [Middlewares Tests] Rechazo por secret incorrecto verificado');
    });
  });

  /**
   * Tests de Casos Edge y Seguridad
   */
  describe('🔒 Casos Edge y Seguridad', () => {
    
    it('❌ Debe rechazar token vacío', async () => {
      const req = mockRequest({ token: '' });
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith({ message: "No token provided!" });

      console.log('✅ [Middlewares Tests] Rechazo de token vacío verificado');
    });

    it('❌ Debe rechazar token null', async () => {
      const req = mockRequest({ token: null });
      const res = mockResponse();
      const next = mockNext;

      await verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith({ message: "No token provided!" });

      console.log('✅ [Middlewares Tests] Rechazo de token null verificado');
    });
  });

  /**
   * Cleanup después de todos los tests
   */
  afterAll(() => {
    console.log('✅ [Middlewares Tests] Tests de middlewares completados');
  });
}); 