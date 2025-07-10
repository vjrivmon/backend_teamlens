# ============================================================================
# TeamLens Backend - AWS Infrastructure with Terraform
# Configuración completa para sistema de colas distribuido en AWS
# ============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ============================================================================
# CONFIGURACIÓN DEL PROVIDER AWS
# ============================================================================

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "TeamLens"
      Environment = var.environment
      ManagedBy   = "Terraform"
      System      = "CeleryDistributed"
    }
  }
}

# ============================================================================
# VARIABLES
# ============================================================================

variable "aws_region" {
  description = "Región AWS para despliegue"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Entorno de despliegue (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Nombre del proyecto"
  type        = string
  default     = "teamlens"
}

variable "redis_node_type" {
  description = "Tipo de instancia para ElastiCache Redis"
  type        = string
  default     = "cache.t3.micro"
}

variable "ecs_task_cpu" {
  description = "CPU para tareas ECS (vCPU units)"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Memoria para tareas ECS (MiB)"
  type        = number
  default     = 1024
}

variable "celery_worker_count" {
  description = "Número de workers de Celery"
  type        = number
  default     = 2
}

variable "auto_scaling_max_capacity" {
  description = "Capacidad máxima para auto scaling"
  type        = number
  default     = 10
}

# ============================================================================
# DATA SOURCES
# ============================================================================

# Obtener AZs disponibles
data "aws_availability_zones" "available" {
  state = "available"
}

# Obtener VPC por defecto
data "aws_vpc" "default" {
  default = true
}

# Obtener subnets de la VPC por defecto
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ============================================================================
# SECURITY GROUPS
# ============================================================================

# Security Group para ElastiCache Redis
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-${var.environment}"
  description = "Security group para ElastiCache Redis"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Redis port from ECS tasks"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-redis-sg-${var.environment}"
  }
}

# Security Group para ECS Tasks
resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${var.project_name}-ecs-tasks-${var.environment}"
  description = "Security group para ECS tasks"
  vpc_id      = data.aws_vpc.default.id

  # Puerto para Flower (monitoreo)
  ingress {
    description = "Flower monitoring"
    from_port   = 5555
    to_port     = 5555
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restringir en producción
  }

  # Puerto para API Node.js
  ingress {
    description = "Node.js API"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-tasks-sg-${var.environment}"
  }
}

# ============================================================================
# ELASTICACHE REDIS
# ============================================================================

# Subnet Group para ElastiCache
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project_name}-redis-subnet-group-${var.environment}"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id         = "${var.project_name}-redis-${var.environment}"
  description                  = "Redis cluster para sistema de colas TeamLens"
  
  node_type                    = var.redis_node_type
  port                         = 6379
  parameter_group_name         = "default.redis7"
  
  num_cache_clusters           = 2
  auto_minor_version_upgrade   = true
  
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]
  
  # Configuración de backup
  snapshot_retention_limit     = 3
  snapshot_window              = "03:00-05:00"
  maintenance_window           = "sun:05:00-sun:09:00"
  
  # Configuración de seguridad
  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = true
  auth_token                   = random_password.redis_auth_token.result
  
  # Configuración de logs
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = {
    Name = "${var.project_name}-redis-${var.environment}"
  }
}

# Token de autenticación para Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = true
}

# ============================================================================
# CLOUDWATCH LOGS
# ============================================================================

# Log Group para Redis
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${var.project_name}-redis-${var.environment}/slow-log"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-redis-logs-${var.environment}"
  }
}

# Log Group para ECS Celery Workers
resource "aws_cloudwatch_log_group" "celery_workers" {
  name              = "/ecs/${var.project_name}-celery-workers-${var.environment}"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-celery-workers-logs-${var.environment}"
  }
}

# Log Group para Flower
resource "aws_cloudwatch_log_group" "flower" {
  name              = "/ecs/${var.project_name}-flower-${var.environment}"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-flower-logs-${var.environment}"
  }
}

# ============================================================================
# ECS CLUSTER
# ============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster-${var.environment}"

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.celery_workers.name
      }
    }
  }

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-cluster-${var.environment}"
  }
}

# Capacity Provider para Auto Scaling
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ============================================================================
# IAM ROLES Y POLICIES
# ============================================================================

# Execution Role para ECS Tasks
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.project_name}-ecs-execution-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-execution-role-${var.environment}"
  }
}

# Policy para Execution Role
resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role para acceso a servicios AWS
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-task-role-${var.environment}"
  }
}

# Policy personalizada para acceso a ElastiCache y CloudWatch
resource "aws_iam_role_policy" "ecs_task_policy" {
  name = "${var.project_name}-ecs-task-policy-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticache:DescribeReplicationGroups",
          "elasticache:DescribeCacheClusters",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# SECRETS MANAGER
# ============================================================================

# Secreto para configuración de la aplicación
resource "aws_secretsmanager_secret" "app_config" {
  name        = "${var.project_name}-app-config-${var.environment}"
  description = "Configuración de la aplicación TeamLens"

  tags = {
    Name = "${var.project_name}-app-config-${var.environment}"
  }
}

# Versión del secreto con configuración
resource "aws_secretsmanager_secret_version" "app_config" {
  secret_id = aws_secretsmanager_secret.app_config.id
  
  secret_string = jsonencode({
    REDIS_URL = "redis://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.redis.configuration_endpoint_address}:6379/0"
    REDIS_RESULT_BACKEND = "redis://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.redis.configuration_endpoint_address}:6379/1"
    REDIS_AUTH_TOKEN = random_password.redis_auth_token.result
    ENVIRONMENT = var.environment
    LOG_LEVEL = "info"
    CELERY_LOG_LEVEL = "INFO"
  })
}

# ============================================================================
# ECS TASK DEFINITIONS
# ============================================================================

# Task Definition para Celery Workers
resource "aws_ecs_task_definition" "celery_workers" {
  family                   = "${var.project_name}-celery-workers-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "celery-worker"
      image     = "${var.project_name}-backend:latest"  # Actualizar con tu imagen
      essential = true
      
      command = [
        "python", "-m", "celery", "worker",
        "-A", "src.celery_app",
        "--loglevel=info",
        "--concurrency=4",
        "--queues=algorithm_queue,validation_queue,cleanup_queue,default"
      ]
      
      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        }
      ]
      
      secrets = [
        {
          name      = "REDIS_URL"
          valueFrom = "${aws_secretsmanager_secret.app_config.arn}:REDIS_URL::"
        },
        {
          name      = "REDIS_RESULT_BACKEND"
          valueFrom = "${aws_secretsmanager_secret.app_config.arn}:REDIS_RESULT_BACKEND::"
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.celery_workers.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "celery-worker"
        }
      }
      
      healthCheck = {
        command = [
          "CMD-SHELL",
          "python -c 'from src.celery_app import celery_app; print(celery_app.control.inspect().ping())'"
        ]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-celery-workers-${var.environment}"
  }
}

# Task Definition para Flower
resource "aws_ecs_task_definition" "flower" {
  family                   = "${var.project_name}-flower-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "flower"
      image     = "mher/flower:latest"
      essential = true
      
      command = [
        "flower",
        "--broker=$(REDIS_URL)",
        "--port=5555",
        "--basic_auth=admin:flower123"
      ]
      
      secrets = [
        {
          name      = "REDIS_URL"
          valueFrom = "${aws_secretsmanager_secret.app_config.arn}:REDIS_URL::"
        }
      ]
      
      portMappings = [
        {
          containerPort = 5555
          hostPort      = 5555
          protocol      = "tcp"
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.flower.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "flower"
        }
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-flower-${var.environment}"
  }
}

# ============================================================================
# ECS SERVICES
# ============================================================================

# Service para Celery Workers
resource "aws_ecs_service" "celery_workers" {
  name            = "${var.project_name}-celery-workers-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.celery_workers.arn
  desired_count   = var.celery_worker_count
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }
  
  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 50
  }
  
  tags = {
    Name = "${var.project_name}-celery-workers-service-${var.environment}"
  }
}

# Service para Flower
resource "aws_ecs_service" "flower" {
  name            = "${var.project_name}-flower-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.flower.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }
  
  tags = {
    Name = "${var.project_name}-flower-service-${var.environment}"
  }
}

# ============================================================================
# AUTO SCALING
# ============================================================================

# Auto Scaling Target para Celery Workers
resource "aws_appautoscaling_target" "celery_workers" {
  max_capacity       = var.auto_scaling_max_capacity
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.celery_workers.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  tags = {
    Name = "${var.project_name}-celery-workers-scaling-${var.environment}"
  }
}

# Auto Scaling Policy basada en CPU
resource "aws_appautoscaling_policy" "celery_workers_cpu" {
  name               = "${var.project_name}-celery-workers-cpu-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.celery_workers.resource_id
  scalable_dimension = aws_appautoscaling_target.celery_workers.scalable_dimension
  service_namespace  = aws_appautoscaling_target.celery_workers.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 70.0
    
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    
    scale_out_cooldown = 300
    scale_in_cooldown  = 300
  }
}

# Auto Scaling Policy basada en memoria
resource "aws_appautoscaling_policy" "celery_workers_memory" {
  name               = "${var.project_name}-celery-workers-memory-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.celery_workers.resource_id
  scalable_dimension = aws_appautoscaling_target.celery_workers.scalable_dimension
  service_namespace  = aws_appautoscaling_target.celery_workers.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 80.0
    
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    
    scale_out_cooldown = 300
    scale_in_cooldown  = 300
  }
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "redis_endpoint" {
  description = "Endpoint de ElastiCache Redis"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
}

output "redis_auth_token" {
  description = "Token de autenticación de Redis"
  value       = random_password.redis_auth_token.result
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "Nombre del cluster ECS"
  value       = aws_ecs_cluster.main.name
}

output "celery_workers_service_name" {
  description = "Nombre del servicio de Celery Workers"
  value       = aws_ecs_service.celery_workers.name
}

output "flower_service_name" {
  description = "Nombre del servicio de Flower"
  value       = aws_ecs_service.flower.name
}

output "secrets_manager_secret_arn" {
  description = "ARN del secreto en Secrets Manager"
  value       = aws_secretsmanager_secret.app_config.arn
} 