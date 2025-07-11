# 🌐 TeamLens WebSocket Integration Guide

## SISTEMA DE REACTIVIDAD EN TIEMPO REAL - GUÍA FRONTEND

Esta guía detalla cómo integrar el sistema WebSocket de TeamLens en el frontend para lograr **reactividad completa sin necesidad de recargar**.

---

## 📊 ARQUITECTURA DEL SISTEMA

### Backend Components
- **WebSocket Service**: Gestión centralizada de conexiones
- **Notification Endpoints**: API REST con eventos WebSocket
- **Activity Endpoints**: Notificaciones tiempo real de cambios
- **Polling Fallback**: Sistema de respaldo para alta disponibilidad

### Frontend Integration Points
- **Socket.IO Client**: Conexión WebSocket principal
- **Notification Service**: Gestión de notificaciones en tiempo real
- **Polling Service**: Sistema de respaldo automático
- **State Management**: Sincronización automática de estados

---

## 🚀 INSTALACIÓN FRONTEND

### 1. Instalar Dependencias
```bash
npm install socket.io-client
```

### 2. Crear Servicio WebSocket
```typescript
// src/services/websocket.service.ts
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket: Socket | null = null;
  private connected$ = new BehaviorSubject<boolean>(false);
  private notifications$ = new BehaviorSubject<any[]>([]);

  constructor() {}

  connect(token: string): void {
    this.socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('🌐 Conectado a TeamLens WebSocket');
      this.connected$.next(true);
    });

    this.socket.on('disconnect', () => {
      console.log('📤 Desconectado de TeamLens WebSocket');
      this.connected$.next(false);
    });

    // Eventos de notificaciones
    this.socket.on('new-activity-assignment', (data) => {
      this.handleNewNotification(data);
    });

    this.socket.on('notification-read', (data) => {
      this.handleNotificationUpdate(data);
    });

    this.socket.on('all-notifications-read', () => {
      this.markAllAsRead();
    });
  }

  private handleNewNotification(data: any): void {
    // Actualizar estado de notificaciones
    const currentNotifications = this.notifications$.value;
    this.notifications$.next([data, ...currentNotifications]);
    
    // Mostrar toast/snackbar
    this.showNotificationToast(data);
  }

  isConnected(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  getNotifications(): Observable<any[]> {
    return this.notifications$.asObservable();
  }
}
```

### 3. Servicio de Notificaciones con Polling
```typescript
// src/services/notification.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private apiUrl = 'http://localhost:3000/users';
  private notifications$ = new BehaviorSubject<any[]>([]);
  private unreadCount$ = new BehaviorSubject<number>(0);
  private lastFetch: string = new Date().toISOString();

  constructor(
    private http: HttpClient,
    private websocketService: WebSocketService
  ) {
    this.initializePolling();
    this.initializeWebSocketListeners();
  }

  private initializePolling(): void {
    // Polling cada 30 segundos como respaldo
    interval(30000)
      .pipe(
        filter(() => !this.websocketService.isConnected()),
        switchMap(() => this.checkForUpdates())
      )
      .subscribe();
  }

  private checkForUpdates(): Observable<any> {
    return this.http.get(`${this.apiUrl}/notifications/quick-check`, {
      params: {
        lastCount: this.notifications$.value.length.toString(),
        lastUnread: this.unreadCount$.value.toString()
      }
    });
  }

  loadNotifications(): Observable<any> {
    return this.http.get(`${this.apiUrl}/notifications`);
  }

  markAsRead(notificationId: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/notifications/${notificationId}/read`, {});
  }
}
```

---

## 📡 EVENTOS WEBSOCKET DISPONIBLES

### Eventos que Recibe el Frontend

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `new-activity-assignment` | Nueva actividad asignada | `{activityId, title, description, link, timestamp}` |
| `notification-read` | Notificación marcada como leída | `{notificationId, read: true, timestamp}` |
| `notification-deleted` | Notificación eliminada | `{notificationId, timestamp}` |
| `all-notifications-read` | Todas las notificaciones leídas | `{userId, timestamp}` |
| `activity-students-added` | Estudiantes añadidos a actividad | `{activityId, studentsAdded, timestamp}` |
| `belbin-completed` | Test Belbin completado | `{userId, activityId, belbinResults, timestamp}` |
| `algorithm-status-updated` | Estado del algoritmo actualizado | `{activityId, status, progress, timestamp}` |

### Eventos que Envía el Frontend

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `ping` | Mantener conexión activa | `{}` |
| `mark-notification-read` | Marcar notificación como leída | `{notificationId}` |
| `request-updates` | Solicitar actualizaciones | `{}` |
| `user-activity` | Indicar actividad del usuario | `{}` |

---

## 🔄 ENDPOINTS DE POLLING (RESPALDO)

### Verificación Rápida
```http
GET /users/notifications/quick-check
?lastCount=10&lastUnread=3
```

**Respuesta:**
```json
{
  "hasChanges": true,
  "totalCount": 12,
  "unreadCount": 5,
  "websocketConnected": false,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Estado en Tiempo Real
```http
GET /users/notifications/real-time-status
?lastFetch=2024-01-15T10:00:00Z
```

**Respuesta:**
```json
{
  "hasUpdates": true,
  "unreadCount": 5,
  "totalCount": 12,
  "latestNotification": {
    "_id": "...",
    "title": "Nueva Actividad",
    "timestamp": "2024-01-15T10:25:00Z"
  },
  "serverTimestamp": "2024-01-15T10:30:00Z",
  "websocketConnected": false
}
```

---

## 🎯 IMPLEMENTACIÓN EN COMPONENTES

### Componente de Notificaciones
```typescript
// src/components/notifications/notifications.component.ts
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-notifications',
  template: `
    <div class="notifications-container">
      <div class="notification-header">
        <h3>Notificaciones</h3>
        <span class="unread-count" *ngIf="unreadCount > 0">
          {{unreadCount}}
        </span>
      </div>
      
      <div class="notification-list">
        <div *ngFor="let notification of notifications" 
             class="notification-item"
             [class.unread]="!notification.read"
             (click)="markAsRead(notification._id)">
          <h4>{{notification.title}}</h4>
          <p>{{notification.description}}</p>
          <small>{{notification.timestamp | date:'short'}}</small>
        </div>
      </div>
    </div>
  `
})
export class NotificationsComponent implements OnInit {
  notifications: any[] = [];
  unreadCount: number = 0;

  constructor(
    private notificationService: NotificationService,
    private websocketService: WebSocketService
  ) {}

  ngOnInit(): void {
    // Cargar notificaciones iniciales
    this.loadNotifications();

    // Escuchar actualizaciones en tiempo real
    this.websocketService.getNotifications().subscribe(notifications => {
      this.notifications = notifications;
      this.unreadCount = notifications.filter(n => !n.read).length;
    });
  }

  private loadNotifications(): void {
    this.notificationService.loadNotifications().subscribe(response => {
      this.notifications = response.notifications || [];
      this.unreadCount = this.notifications.filter(n => !n.read).length;
    });
  }

  markAsRead(notificationId: string): void {
    this.notificationService.markAsRead(notificationId).subscribe(() => {
      const notification = this.notifications.find(n => n._id === notificationId);
      if (notification) {
        notification.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
      }
    });
  }
}
```

---

## ⚡ PATRONES DE IMPLEMENTACIÓN

### 1. Patrón de Reconexión Automática
```typescript
class AutoReconnectWebSocket {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(): void {
    this.socket = io(this.url, this.options);
    
    this.socket.on('disconnect', () => {
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }
}
```

### 2. Patrón de Estado Híbrido (WebSocket + Polling)
```typescript
class HybridNotificationService {
  constructor() {
    // WebSocket como principal
    this.websocketService.connect();
    
    // Polling como respaldo
    this.startPollingWhenDisconnected();
  }

  private startPollingWhenDisconnected(): void {
    this.websocketService.isConnected().subscribe(connected => {
      if (!connected) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });
  }
}
```

---

## 🔧 CONFIGURACIÓN DE PRODUCCIÓN

### Variables de Entorno
```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  websocketUrl: 'wss://api.teamlens.com',
  pollingInterval: 60000, // 1 minuto en producción
  reconnectAttempts: 10
};
```

### Optimizaciones
- **Debounce de eventos**: Evitar spam de actualizaciones
- **Lazy loading**: Cargar notificaciones bajo demanda
- **Caching inteligente**: Cachear estados para mejor UX
- **Compresión**: Habilitar compresión WebSocket

---

## 🚨 MANEJO DE ERRORES

### Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `Authentication error` | Token JWT inválido | Renovar token y reconectar |
| `Connection timeout` | Red lenta/inestable | Activar polling de respaldo |
| `Rate limit exceeded` | Demasiadas conexiones | Implementar throttling |
| `CORS error` | Configuración incorrecta | Verificar origins permitidos |

### Estrategia de Fallback
```typescript
class FallbackStrategy {
  async handleConnectionError(error: any): Promise<void> {
    switch (error.type) {
      case 'AUTH_ERROR':
        await this.refreshToken();
        this.websocketService.reconnect();
        break;
      case 'NETWORK_ERROR':
        this.notificationService.enablePolling();
        break;
      case 'SERVER_ERROR':
        this.showOfflineMessage();
        break;
    }
  }
}
```

---

## 📈 MÉTRICAS Y MONITOREO

### KPIs del Sistema
- **Tiempo de entrega de notificaciones**: < 500ms
- **Tasa de conexión exitosa**: > 99%
- **Tiempo de reconexión**: < 2s
- **Precisión de sincronización**: 100%

### Logs de Debug
```typescript
// Habilitar logs detallados en desarrollo
localStorage.setItem('teamlens:debug', 'websocket,notifications,polling');
```

---

¡Con esta implementación, TeamLens tendrá **reactividad completa** sin necesidad de recargar la aplicación! 🚀 