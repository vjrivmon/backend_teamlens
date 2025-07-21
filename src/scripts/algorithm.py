import sys
import json
import time
import os
from pathlib import Path

def execute_real_algorithm(data, ordered_student_ids):
    """
    Ejecuta el algoritmo real de pyteamformation
    """
    print("🧠 Ejecutando algoritmo real de pyteamformation...", file=sys.stderr)
    
    try:
        # Agregar la ruta de pyteamformation al path de Python
        current_dir = Path(__file__).parent
        pyteamformation_path = current_dir.parent.parent.parent / "pyteamformation"
        sys.path.insert(0, str(pyteamformation_path))
        
        print(f"📁 Ruta pyteamformation: {pyteamformation_path}", file=sys.stderr)
        
        # 🔍 DEBUGGING: Mostrar datos antes de enviar al algoritmo
        print("🔍 DEBUGGING - Datos que se envían a TraitTeamFormationProblem:", file=sys.stderr)
        print(f"   - Tipo de data: {type(data)}", file=sys.stderr)
        print(f"   - Keys en data: {list(data.keys()) if isinstance(data, dict) else 'No es dict'}", file=sys.stderr)
        
        # DEBUGGING: Comparar datos reales vs. datos de prueba
        print("🔍 DEBUGGING - Comparando datos reales vs. prueba...", file=sys.stderr)
        print(f"📊 Número de miembros: {data['number_members']}", file=sys.stderr)
        
        # Verificar si existe number_teams
        if 'number_teams' in data:
            print(f"📊 Número de teams: {data['number_teams']}", file=sys.stderr)
        else:
            print("❌ FALTA el campo 'number_teams' en los datos", file=sys.stderr)
            print(f"🔍 Campos disponibles: {list(data.keys())}", file=sys.stderr)
        
        # Verificar estructura de traits
        if 'traits' in data:
            print(f"📊 Traits encontrados: {len(data['traits'])}", file=sys.stderr)
            for i, trait in enumerate(data['traits'][:3]):  # Solo los primeros 3
                print(f"   Trait {i}: {len(trait) if isinstance(trait, list) else 'NO_LIST'} valores", file=sys.stderr)
        else:
            print("❌ NO se encontraron traits en los datos", file=sys.stderr)
            
        # Verificar estructura de constraints  
        if 'constraints' in data:
            print(f"📊 Constraints encontrados: {len(data['constraints'])}", file=sys.stderr)
            for i, constraint in enumerate(data['constraints']):
                print(f"   Constraint {i}: tipo={constraint.get('type', 'NO_TYPE')}, miembros={len(constraint.get('members', []))}", file=sys.stderr)
        else:
            print("❌ NO se encontraron constraints en los datos", file=sys.stderr)
            
        # Mostrar un ejemplo completo de los datos
        print("🔍 DEBUGGING - Datos JSON completos (primeros 500 chars):", file=sys.stderr)
        json_str = json.dumps(data, indent=2)
        print(json_str[:500] + "..." if len(json_str) > 500 else json_str, file=sys.stderr)
        
        # Importar algoritmo concreto - CORREGIDO: usar implementación específica
        from pyteamformation.algorithm.metaheuristic.candel_ga import OrderBasedBitKeyGA
        from pyteamformation.problem.trait_team_formation_problem import TraitTeamFormationProblem
        
        print("✅ Algoritmo real importado correctamente", file=sys.stderr)
        
        # 🔍 DEBUGGING: Intentar crear el problema con logging detallado
        print("🔍 DEBUGGING - Intentando crear TraitTeamFormationProblem...", file=sys.stderr)
        problem = TraitTeamFormationProblem.from_json_object(data)
        print(f"✅ Problema creado con {problem.number_members} miembros", file=sys.stderr)
        
        # NUEVO: Crear mapeo COMPLETO usando ordered_student_ids
        print("🔄 Creando mapeo COMPLETO de estudiantes...", file=sys.stderr)
        print(f"📋 IDs ordenados recibidos: {len(ordered_student_ids)} estudiantes", file=sys.stderr)
        print(f"🔍 Primeros 5 IDs: {ordered_student_ids[:5] if ordered_student_ids else []}", file=sys.stderr)
        
        # Crear mapeo completo bidireccional
        index_to_id_map = {}
        id_to_index_map = {}
        
        for index, student_id in enumerate(ordered_student_ids):
            index_to_id_map[index] = student_id
            id_to_index_map[student_id] = index
        
        print(f"✅ Mapeo completo creado: {len(ordered_student_ids)} estudiantes", file=sys.stderr)
        print(f"🔍 Índices 0-4 → IDs: {[index_to_id_map.get(i, 'N/A') for i in range(min(5, len(ordered_student_ids)))]}", file=sys.stderr)
        
        # Verificar que el número de miembros coincide
        if data['number_members'] != len(ordered_student_ids):
            print(f"⚠️ ADVERTENCIA: Discrepancia en número de miembros:", file=sys.stderr)
            print(f"   - JSON dice: {data['number_members']}", file=sys.stderr)
            print(f"   - IDs recibidos: {len(ordered_student_ids)}", file=sys.stderr)
            # Usar el número menor para evitar errores
            data['number_members'] = min(data['number_members'], len(ordered_student_ids))
            print(f"   - Usando: {data['number_members']}", file=sys.stderr)
        
        # Convertir constraints que usan IDs de string a índices numéricos Y eliminar duplicadas
        print("🔄 Convirtiendo constraints de IDs a índices y eliminando duplicadas...", file=sys.stderr)
        converted_constraints = []
        constraint_signatures = set()  # Para detectar duplicadas
        
        for constraint in data.get('constraints', []):
            new_constraint = constraint.copy()
            if 'members' in constraint and constraint['members']:
                # Convertir solo si contiene strings
                if constraint['members'] and isinstance(constraint['members'][0], str):
                    converted_members = []
                    for member_id in constraint['members']:
                        if member_id in id_to_index_map:
                            converted_members.append(id_to_index_map[member_id])
                        else:
                            print(f"⚠️ ID no encontrado en mapeo: {member_id}", file=sys.stderr)
                    new_constraint['members'] = converted_members
                    print(f"   Convertida: {constraint['members']} -> {new_constraint['members']}", file=sys.stderr)
            
            # Crear signature para detectar duplicadas
            if 'members' in new_constraint and new_constraint['members']:
                signature = f"{new_constraint['type']}:{sorted(new_constraint['members'])}"
            else:
                signature = f"{new_constraint['type']}:{new_constraint.get('name', '')}"
            
            # Solo añadir si no es duplicada
            if signature not in constraint_signatures:
                converted_constraints.append(new_constraint)
                constraint_signatures.add(signature)
                print(f"   ✅ Constraint añadida: {new_constraint['type']}", file=sys.stderr)
            else:
                print(f"   🗑️ Constraint duplicada eliminada: {new_constraint['type']}", file=sys.stderr)
        
        # Actualizar data con constraints convertidas y sin duplicadas
        data['constraints'] = converted_constraints
        print(f"🧹 Constraints finales: {len(converted_constraints)} (duplicadas eliminadas)", file=sys.stderr)
        
        # Recrear problema con datos convertidos
        print("🔄 Recreando problema con índices numéricos...", file=sys.stderr)
        problem = TraitTeamFormationProblem.from_json_object(data)
        
        # Mostrar información detallada de constraints
        print(f"📋 Constraints del problema:", file=sys.stderr)
        for i, constraint in enumerate(problem._constraints):
            constraint_info = f"   {i}: {constraint.type} - {getattr(constraint, 'name', 'sin nombre')} - members: {getattr(constraint, 'members', 'N/A')}"
            print(constraint_info, file=sys.stderr)
        
        # CONFIGURAR algoritmo genético REAL con parámetros ROBUSTOS
        print("🚀 Iniciando algoritmo genético REAL de pyteamformation...", file=sys.stderr)
        start_time = time.time()
        
        # Instanciar algoritmo genético REAL con parámetros COMPATIBLES
        print(f"⚙️ Configurando OrderBasedBitKeyGA con parámetros COMPATIBLES...", file=sys.stderr)
        
        # Calcular parámetros apropiados para el problema específico
        problem_size = data['number_members']
        safe_pop_size = min(50, max(10, problem_size * 2))  # Población proporcional al problema
        safe_tournament_size = max(2, min(5, problem_size // 4))  # Entero, no fracción
        
        print(f"📊 Parámetros calculados para problema de {problem_size} estudiantes:", file=sys.stderr)
        print(f"   - Población: {safe_pop_size}", file=sys.stderr)
        print(f"   - Torneo: {safe_tournament_size}", file=sys.stderr)
        
        algorithm = OrderBasedBitKeyGA(
            problem,
            pop_size=safe_pop_size,     # ✅ Población apropiada para el problema
            p_cross=0.8,                # ✅ Crossover estándar
            p_mut=0.1,                  # ✅ Mutación estándar
            tournament_size=safe_tournament_size,  # ✅ Torneo como ENTERO
            exchange_operations=1       # ✅ Operaciones mínimas para estabilidad
        )
        print("✅ Algoritmo genético REAL instanciado con parámetros COMPATIBLES", file=sys.stderr)
        
        print("🔄 Ejecutando algoritmo genético REAL (tardará 10-60 segundos según complejidad)...", file=sys.stderr)
        
        # VALIDAR constraints antes de ejecutar
        print("🔍 VALIDANDO constraints antes de ejecutar...", file=sys.stderr)
        
        # Contar constraints restrictivas
        same_team_count = len([c for c in data['constraints'] if c.get('type') == 'SameTeam'])
        diff_team_count = len([c for c in data['constraints'] if c.get('type') == 'DifferentTeam'])
        size_count = len([c for c in data['constraints'] if c.get('type') == 'SizeCardinality'])
        
        print(f"📊 Constraints: SameTeam={same_team_count}, DifferentTeam={diff_team_count}, SizeCardinality={size_count}", file=sys.stderr)
        
        # Ejecutar ÚNICAMENTE el algoritmo genético REAL - SIN RESPALDOS
        print("🔍 DEBUG - Llamando algorithm.solve() (ALGORITMO GENÉTICO REAL)...", file=sys.stderr)
        
        try:
            solution = algorithm.solve()
            print(f"✅ Algoritmo genético REAL ejecutado exitosamente: {type(solution)}", file=sys.stderr)
        except Exception as solve_error:
            print(f"💥 Error INTERNO en algoritmo genético REAL: {solve_error}", file=sys.stderr)
            print(f"🔍 Tipo de error: {type(solve_error)}", file=sys.stderr)
            
            # Obtener stack trace detallado para debugging
            import traceback
            print(f"🔍 Stack trace completo del algoritmo genético:", file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            
            # NO hay respaldo - el algoritmo genético REAL falló
            print("❌ CRÍTICO: El algoritmo genético REAL de pyteamformation falló", file=sys.stderr)
            print("❌ Sin respaldos - el algoritmo debe resolverse con los parámetros correctos", file=sys.stderr)
            return None
        
        execution_time = time.time() - start_time
        print(f"✅ Algoritmo completado en {execution_time:.2f} segundos", file=sys.stderr)
        
        if solution is None:
            print("❌ El algoritmo genético REAL no encontró una solución válida", file=sys.stderr)
            return None
            
        # Obtener la solución ÚNICAMENTE del algoritmo genético REAL
        end_time = time.time()
        
        # SOLO algoritmo genético REAL - sin compatibilidad con respaldos
        teams = algorithm.get_solution()
        print(f"✅ Equipos obtenidos del algoritmo genético REAL: {len(teams)} equipos", file=sys.stderr)
        
        print(f"⏱️ Algoritmo completado en {end_time - start_time:.2f} segundos", file=sys.stderr)
        print(f"🎯 Número de equipos generados: {len(teams)}", file=sys.stderr)
        
        # NUEVO: Convertir índices numéricos de vuelta a IDs reales
        print("🔄 Convirtiendo índices de vuelta a IDs reales...", file=sys.stderr)
        
        result_teams = []
        for i, team in enumerate(teams):
            # Si tenemos mapeo, convertir índices a IDs reales
            if index_to_id_map and len(index_to_id_map) > 0:
                # Convertir índices numéricos a IDs reales
                team_with_real_ids = [
                    index_to_id_map.get(member_index, f"unknown_{member_index}") 
                    for member_index in team
                ]
                result_teams.append(team_with_real_ids)
                print(f"   Equipo {i+1}: {team} -> {team_with_real_ids}", file=sys.stderr)
            else:
                # Si no hay mapeo, usar los miembros tal como están
                result_teams.append(list(team))
                print(f"   Equipo {i+1}: {list(team)} (sin conversión)", file=sys.stderr)
        
        # Obtener fitness ÚNICAMENTE del algoritmo genético REAL
        if hasattr(algorithm, '_best_solution_value'):
            fitness_value = algorithm._best_solution_value
        else:
            fitness_value = 1.0  # Valor por defecto para algoritmo genético exitoso
        
        # Crear estructura de resultado
        result = {
            "teams": result_teams,
            "fitness": fitness_value,
            "execution_time": end_time - start_time,
            "total_members": data['number_members']
        }
        
        return result
        
    except ImportError as e:
        print(f"❌ Error importando pyteamformation: {e}", file=sys.stderr)
        print("💥 CRÍTICO: pyteamformation es OBLIGATORIO - instale dependencias", file=sys.stderr)
        return None
    except Exception as e:
        print(f"💥 Error en algoritmo pyteamformation: {e}", file=sys.stderr)
        print("💥 CRÍTICO: algoritmo pyteamformation falló", file=sys.stderr)
        return None

# Función principal eliminada - código movido a if __name__ == "__main__"

if __name__ == "__main__":
    try:
        start_time = time.time()
        
        print("🚀 Iniciando algoritmo de formación de equipos REAL...", file=sys.stderr)
        
        # NUEVO: Leer datos desde stdin en lugar de argumentos
        print("📥 Leyendo datos desde stdin...", file=sys.stderr)
        
        input_data = ""
        for line in sys.stdin:
            input_data += line
        
        if not input_data.strip():
            print("❌ Error: No se recibieron datos desde stdin", file=sys.stderr)
            sys.exit(1)
        
        print(f"📋 Datos recibidos: {len(input_data)} caracteres", file=sys.stderr)
        
        # Parsear datos completos
        try:
            full_data = json.loads(input_data.strip())
            print("✅ JSON parseado correctamente", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"❌ Error parseando JSON: {e}", file=sys.stderr)
            print(f"🔍 Datos recibidos: {input_data[:200]}...", file=sys.stderr)
            sys.exit(1)
        
        # Extraer algorithm_data y ordered_student_ids
        algorithm_data = full_data.get('algorithm_data')
        ordered_student_ids = full_data.get('ordered_student_ids', [])
        
        if not algorithm_data:
            print("❌ Error: No se encontró algorithm_data en los datos recibidos", file=sys.stderr)
            sys.exit(1)
        
        print(f"🔍 DEBUGGING - Estructura de datos extraída:", file=sys.stderr)
        print(f"   - algorithm_data: {type(algorithm_data)}", file=sys.stderr)
        print(f"   - members: {algorithm_data.get('number_members', 'N/A')}", file=sys.stderr)
        print(f"   - constraints: {len(algorithm_data.get('constraints', []))}", file=sys.stderr)
        print(f"   - ordered_student_ids: {len(ordered_student_ids)}", file=sys.stderr)
        
        if not ordered_student_ids:
            print("⚠️ ADVERTENCIA: No se recibieron ordered_student_ids", file=sys.stderr)
        
        # Ejecutar algoritmo real
        result = execute_real_algorithm(algorithm_data, ordered_student_ids)
        
        if not result:
            print("❌ Error: No se crearon equipos", file=sys.stderr)
            sys.exit(1)
            
        # Convertir resultado a JSON
        result_json = json.dumps(result, indent=2)
        
        print(f"✅ Algoritmo completado: {len(result['teams'])} equipos creados", file=sys.stderr)
        
        # Imprimir resultado en stdout (para captura del worker)
        print(result_json)
        
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        print(f"❌ Error parseando JSON: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"💥 Error inesperado: {e}", file=sys.stderr)
        sys.exit(1)
    
