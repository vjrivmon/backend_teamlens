/**
 * EmailQueueService - Sistema de colas de emails en memoria
 * Procesa emails en lotes para evitar rate limiting de Gmail
 *
 * Configuracion:
 * - BATCH_SIZE: 5 emails por lote
 * - BATCH_DELAY_MS: 10000ms (10 segundos entre lotes)
 * - MAX_RETRIES: 3 intentos por email
 * - RETRY_DELAYS: [5000, 15000, 30000] (backoff exponencial)
 */

import { v4 as uuidv4 } from 'uuid';
import { webSocketService } from './websocket.service';
import emailService from './email.service';

// ==================== INTERFACES ====================

export interface EmailJob {
    id: string;
    type: 'student-invitation' | 'questionnaire-reminder' | 'password-reset' | 'generic';
    email: string;
    payload: {
        token?: string;
        questionnaireId?: string;
        resetToken?: string;
        subject?: string;
        html?: string;
        text?: string;
    };
    metadata: {
        activityId?: string;
        teacherId: string;
        batchId: string;
        priority?: 'high' | 'normal' | 'low';
    };
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    lastAttemptAt?: Date;
    completedAt?: Date;
    error?: string;
}

export interface BatchProgress {
    batchId: string;
    total: number;
    sent: number;
    failed: number;
    pending: number;
    percentage: number;
    currentBatch: number;
    totalBatches: number;
    startedAt: Date;
    estimatedTimeRemaining?: number;
}

export interface EnqueueOptions {
    activityId?: string;
    teacherId: string;
    priority?: 'high' | 'normal' | 'low';
}

export interface StudentInvitationJob {
    email: string;
    invitationToken: string;
}

// ==================== CONFIGURACION ====================

const CONFIG = {
    BATCH_SIZE: 5,
    BATCH_DELAY_MS: 10000,
    MAX_RETRIES: 3,
    RETRY_DELAYS: [5000, 15000, 30000],
    PROCESSING_DELAY_MS: 500,
};

// ==================== SERVICIO ====================

class EmailQueueService {
    private queue: EmailJob[] = [];
    private isProcessing: boolean = false;
    private batchProgress: Map<string, BatchProgress> = new Map();

    constructor() {
        console.log('📬 [EmailQueue] Servicio de cola de emails inicializado');
        console.log(`📬 [EmailQueue] Configuracion: ${CONFIG.BATCH_SIZE} emails/lote, ${CONFIG.BATCH_DELAY_MS / 1000}s delay`);
    }

    /**
     * Encola invitaciones de estudiantes
     */
    public enqueueStudentInvitations(
        jobs: StudentInvitationJob[],
        options: EnqueueOptions
    ): string {
        const batchId = uuidv4();

        console.log(`📬 [EmailQueue] Encolando ${jobs.length} invitaciones de estudiantes (batch: ${batchId})`);

        const emailJobs: EmailJob[] = jobs.map(job => ({
            id: uuidv4(),
            type: 'student-invitation' as const,
            email: job.email,
            payload: {
                token: job.invitationToken
            },
            metadata: {
                activityId: options.activityId,
                teacherId: options.teacherId,
                batchId: batchId,
                priority: options.priority || 'normal'
            },
            status: 'pending' as const,
            attempts: 0,
            maxAttempts: CONFIG.MAX_RETRIES,
            createdAt: new Date()
        }));

        this.queue.push(...emailJobs);

        const totalBatches = Math.ceil(jobs.length / CONFIG.BATCH_SIZE);
        this.batchProgress.set(batchId, {
            batchId,
            total: jobs.length,
            sent: 0,
            failed: 0,
            pending: jobs.length,
            percentage: 0,
            currentBatch: 0,
            totalBatches,
            startedAt: new Date()
        });

        // Extraer lista de emails para enviar al frontend
        const emailsList = jobs.map(j => j.email);
        this.emitQueueStarted(batchId, jobs.length, options.teacherId, options.activityId, emailsList);

        if (!this.isProcessing) {
            this.processQueue();
        }

        return batchId;
    }

    /**
     * Encola recordatorios de cuestionario
     */
    public enqueueQuestionnaireReminders(
        emails: string[],
        questionnaireId: string,
        options: EnqueueOptions
    ): string {
        const batchId = uuidv4();

        console.log(`📬 [EmailQueue] Encolando ${emails.length} recordatorios (batch: ${batchId})`);

        const emailJobs: EmailJob[] = emails.map(email => ({
            id: uuidv4(),
            type: 'questionnaire-reminder' as const,
            email: email,
            payload: {
                questionnaireId
            },
            metadata: {
                activityId: options.activityId,
                teacherId: options.teacherId,
                batchId: batchId,
                priority: options.priority || 'normal'
            },
            status: 'pending' as const,
            attempts: 0,
            maxAttempts: CONFIG.MAX_RETRIES,
            createdAt: new Date()
        }));

        this.queue.push(...emailJobs);

        const totalBatches = Math.ceil(emails.length / CONFIG.BATCH_SIZE);
        this.batchProgress.set(batchId, {
            batchId,
            total: emails.length,
            sent: 0,
            failed: 0,
            pending: emails.length,
            percentage: 0,
            currentBatch: 0,
            totalBatches,
            startedAt: new Date()
        });

        this.emitQueueStarted(batchId, emails.length, options.teacherId, options.activityId);

        if (!this.isProcessing) {
            this.processQueue();
        }

        return batchId;
    }

    /**
     * Procesa la cola de emails
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) return;

        this.isProcessing = true;
        console.log(`📬 [EmailQueue] Iniciando procesamiento de cola (${this.queue.length} emails pendientes)`);

        while (this.queue.length > 0) {
            const pendingJobs = this.queue.filter(j => j.status === 'pending');

            if (pendingJobs.length === 0) {
                const retryJobs = this.queue.filter(j =>
                    j.status === 'failed' && j.attempts < j.maxAttempts
                );

                if (retryJobs.length === 0) break;

                retryJobs.forEach(j => { j.status = 'pending'; });
                continue;
            }

            const batch = pendingJobs.slice(0, CONFIG.BATCH_SIZE);
            await this.processBatch(batch);

            if (this.queue.some(j => j.status === 'pending')) {
                console.log(`📬 [EmailQueue] Esperando ${CONFIG.BATCH_DELAY_MS / 1000}s antes del siguiente lote...`);
                await this.sleep(CONFIG.BATCH_DELAY_MS);
            }
        }

        this.finalizeBatches();

        this.isProcessing = false;
        console.log(`📬 [EmailQueue] Procesamiento de cola completado`);
    }

    /**
     * Procesa un lote de emails
     */
    private async processBatch(batch: EmailJob[]): Promise<void> {
        console.log(`📬 [EmailQueue] Procesando lote de ${batch.length} emails`);

        for (const job of batch) {
            job.status = 'processing';
            job.lastAttemptAt = new Date();
            job.attempts++;

            try {
                await this.sendEmail(job);
                job.status = 'completed';
                job.completedAt = new Date();

                console.log(`✅ [EmailQueue] Email enviado a ${job.email} (intento ${job.attempts})`);

                this.updateProgress(job.metadata.batchId, 'sent');

            } catch (error: any) {
                console.error(`❌ [EmailQueue] Error enviando a ${job.email}:`, error.message);

                job.error = error.message;

                if (job.attempts >= job.maxAttempts) {
                    job.status = 'failed';
                    this.updateProgress(job.metadata.batchId, 'failed');
                    this.emitJobError(job, false);
                } else {
                    job.status = 'pending';
                    const retryDelay = CONFIG.RETRY_DELAYS[job.attempts - 1] || CONFIG.RETRY_DELAYS[2];
                    console.log(`🔄 [EmailQueue] Reintentando ${job.email} en ${retryDelay / 1000}s (intento ${job.attempts + 1}/${job.maxAttempts})`);
                    this.emitJobError(job, true);
                }
            }

            await this.sleep(CONFIG.PROCESSING_DELAY_MS);
        }
    }

    /**
     * Envia un email segun su tipo
     */
    private async sendEmail(job: EmailJob): Promise<void> {
        let result;

        switch (job.type) {
            case 'student-invitation':
                result = await emailService.sendStudentInvitation(
                    job.email,
                    job.payload.token!
                );
                break;

            case 'questionnaire-reminder':
                result = await emailService.sendQuestionnaireReminder(
                    job.email,
                    job.payload.questionnaireId!
                );
                break;

            case 'password-reset':
                result = await emailService.sendForgotPassword(
                    job.email,
                    job.payload.resetToken!
                );
                break;

            default:
                throw new Error(`Tipo de email no soportado: ${job.type}`);
        }

        if (!result.success) {
            throw new Error(result.error || 'Error desconocido enviando email');
        }
    }

    /**
     * Actualiza el progreso de un batch
     */
    private updateProgress(batchId: string, type: 'sent' | 'failed'): void {
        const progress = this.batchProgress.get(batchId);
        if (!progress) return;

        if (type === 'sent') {
            progress.sent++;
        } else {
            progress.failed++;
        }

        progress.pending = progress.total - progress.sent - progress.failed;
        progress.percentage = Math.round(((progress.sent + progress.failed) / progress.total) * 100);
        progress.currentBatch = Math.ceil((progress.sent + progress.failed) / CONFIG.BATCH_SIZE);

        const elapsed = Date.now() - progress.startedAt.getTime();
        const processed = progress.sent + progress.failed;
        if (processed > 0) {
            const avgTimePerEmail = elapsed / processed;
            progress.estimatedTimeRemaining = Math.round((progress.pending * avgTimePerEmail) / 1000);
        }

        this.emitProgress(progress);
    }

    /**
     * Finaliza los batches procesados
     */
    private finalizeBatches(): void {
        const completedBatchIds = new Set<string>();

        this.queue.forEach(job => {
            if (job.status === 'completed' || job.status === 'failed') {
                completedBatchIds.add(job.metadata.batchId);
            }
        });

        completedBatchIds.forEach(batchId => {
            const progress = this.batchProgress.get(batchId);
            if (progress && progress.pending === 0) {
                const batchJobs = this.queue.filter(j => j.metadata.batchId === batchId);
                const teacherId = batchJobs[0]?.metadata.teacherId;
                const activityId = batchJobs[0]?.metadata.activityId;

                const failedEmails = batchJobs
                    .filter(j => j.status === 'failed')
                    .map(j => ({ email: j.email, error: j.error || 'Error desconocido' }));

                this.emitQueueCompleted(batchId, progress, failedEmails, teacherId, activityId);

                this.batchProgress.delete(batchId);
            }
        });

        this.queue = this.queue.filter(j => j.status !== 'completed' && j.status !== 'failed');
    }

    // ==================== EVENTOS WEBSOCKET ====================

    private emitQueueStarted(
        batchId: string,
        total: number,
        teacherId: string,
        activityId?: string,
        emails?: string[]
    ): void {
        const estimatedTime = Math.ceil(total / CONFIG.BATCH_SIZE) * (CONFIG.BATCH_DELAY_MS / 1000);
        const payload = {
            batchId,
            total,
            activityId,
            estimatedTime,
            emails: emails || [],
            message: `Iniciando envio de ${total} emails (tiempo estimado: ~${estimatedTime}s)...`,
            timestamp: new Date().toISOString()
        };

        webSocketService.emitToUser(teacherId, 'email-queue-started', payload);
        console.log(`📡 [EmailQueue] Evento 'email-queue-started' enviado a profesor ${teacherId}`);
    }

    private emitProgress(progress: BatchProgress): void {
        const batchJobs = this.queue.filter(j => j.metadata.batchId === progress.batchId);
        const teacherId = batchJobs[0]?.metadata.teacherId;
        const activityId = batchJobs[0]?.metadata.activityId;

        if (!teacherId) return;

        const payload = {
            batchId: progress.batchId,
            activityId,
            sent: progress.sent,
            failed: progress.failed,
            total: progress.total,
            pending: progress.pending,
            percentage: progress.percentage,
            currentBatch: progress.currentBatch,
            totalBatches: progress.totalBatches,
            estimatedTimeRemaining: progress.estimatedTimeRemaining,
            message: `Enviando emails: ${progress.sent}/${progress.total} (${progress.percentage}%)`,
            timestamp: new Date().toISOString()
        };

        webSocketService.emitToUser(teacherId, 'email-queue-progress', payload);
    }

    private emitJobError(job: EmailJob, willRetry: boolean): void {
        const payload = {
            batchId: job.metadata.batchId,
            activityId: job.metadata.activityId,
            email: job.email,
            error: job.error,
            attempt: job.attempts,
            maxAttempts: job.maxAttempts,
            willRetry,
            timestamp: new Date().toISOString()
        };

        webSocketService.emitToUser(job.metadata.teacherId, 'email-queue-error', payload);
    }

    private emitQueueCompleted(
        batchId: string,
        progress: BatchProgress,
        failedEmails: Array<{ email: string; error: string }>,
        teacherId?: string,
        activityId?: string
    ): void {
        if (!teacherId) return;

        const duration = Math.round((Date.now() - progress.startedAt.getTime()) / 1000);
        const payload = {
            batchId,
            activityId,
            total: progress.total,
            success: progress.sent,
            failed: progress.failed,
            failedEmails,
            duration,
            message: progress.failed === 0
                ? `Todos los ${progress.sent} emails enviados exitosamente en ${duration}s`
                : `Completado: ${progress.sent} enviados, ${progress.failed} fallidos`,
            timestamp: new Date().toISOString()
        };

        webSocketService.emitToUser(teacherId, 'email-queue-completed', payload);
        console.log(`📡 [EmailQueue] Evento 'email-queue-completed' enviado a profesor ${teacherId}`);
    }

    // ==================== UTILIDADES ====================

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Obtiene el estado actual de la cola
     */
    public getQueueStatus(): object {
        return {
            isProcessing: this.isProcessing,
            totalPending: this.queue.filter(j => j.status === 'pending').length,
            totalProcessing: this.queue.filter(j => j.status === 'processing').length,
            activeBatches: Array.from(this.batchProgress.values())
        };
    }

    /**
     * Obtiene el progreso de un batch especifico
     */
    public getBatchProgress(batchId: string): BatchProgress | undefined {
        return this.batchProgress.get(batchId);
    }
}

// Exportar instancia singleton
export const emailQueueService = new EmailQueueService();
export default emailQueueService;
