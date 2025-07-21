import sys
import json
import time
import os
from pathlib import Path

def execute_real_algorithm(data):
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
        
        # Importar algoritmo concreto - CORREGIDO: usar implementación específica
        from pyteamformation.algorithm.metaheuristic.candel_ga import OrderBasedBitKeyGA
        from pyteamformation.problem.trait_team_formation_problem import TraitTeamFormationProblem
        
        print("✅ Algoritmo real importado correctamente", file=sys.stderr)
        
        # 🔍 DEBUGGING: Intentar crear el problema con logging detallado
        print("🔍 DEBUGGING - Intentando crear TraitTeamFormationProblem...", file=sys.stderr)
        problem = TraitTeamFormationProblem.from_json_object(data)
        print(f"✅ Problema creado con {problem.number_members} miembros", file=sys.stderr)
        
        # NUEVO: Crear mapeo de IDs reales a índices numéricos
        print("🔄 Creando mapeo de IDs a índices numéricos...", file=sys.stderr)
        member_ids = []
        index_to_id_map = {}
        id_to_index_map = {}
        
        # Extraer IDs únicos de las constraints
        for constraint in data.get('constraints', []):
            if 'members' in constraint and constraint['members']:
                for member_id in constraint['members']:
                    if isinstance(member_id, str) and member_id not in id_to_index_map:
                        index = len(member_ids)
                        member_ids.append(member_id)
                        id_to_index_map[member_id] = index
                        index_to_id_map[index] = member_id
        
        print(f"📋 Mapeo creado: {len(member_ids)} IDs únicos", file=sys.stderr)
        print(f"🔍 ID to Index map: {id_to_index_map}", file=sys.stderr)
        
        # Convertir constraints que usan IDs de string a índices numéricos
        print("🔄 Convirtiendo constraints de IDs a índices...", file=sys.stderr)
        converted_constraints = []
        for constraint in data.get('constraints', []):
            new_constraint = constraint.copy()
            if 'members' in constraint and constraint['members']:
                # Convertir solo si contiene strings
                if constraint['members'] and isinstance(constraint['members'][0], str):
                    new_constraint['members'] = [
                        id_to_index_map[member_id] if member_id in id_to_index_map else member_id 
                        for member_id in constraint['members']
                    ]
                    print(f"   Convertida: {constraint['members']} -> {new_constraint['members']}", file=sys.stderr)
            converted_constraints.append(new_constraint)
        
        # Actualizar data con constraints convertidas
        data['constraints'] = converted_constraints
        
        # Recrear problema con datos convertidos
        print("🔄 Recreando problema con índices numéricos...", file=sys.stderr)
        problem = TraitTeamFormationProblem.from_json_object(data)
        
        # Mostrar información detallada de constraints
        print(f"📋 Constraints del problema:", file=sys.stderr)
        for i, constraint in enumerate(problem._constraints):
            constraint_info = f"   {i}: {constraint.type} - {getattr(constraint, 'name', 'sin nombre')} - members: {getattr(constraint, 'members', 'N/A')}"
            print(constraint_info, file=sys.stderr)
        
        # CORREGIDO: Usar algoritmo concreto directamente
        print("🚀 Iniciando algoritmo de optimización...", file=sys.stderr)
        start_time = time.time()
        
        # Instanciar algoritmo genético directamente con parámetros en el constructor
        print(f"⚙️ Configurando algoritmo: OrderBasedBitKeyGA", file=sys.stderr)
        algorithm = OrderBasedBitKeyGA(
            problem,
            pop_size=50,              # population_size
            p_cross=0.8,             # crossover_rate  
            p_mut=0.1,               # mutation_rate
            tournament_size=0.1,
            exchange_operations=3
        )
        
        print("🔄 Ejecutando algoritmo de optimización (esto puede tardar 1-3 minutos)...", file=sys.stderr)
        
        # Ejecutar el algoritmo
        solution = algorithm.solve()
        
        execution_time = time.time() - start_time
        print(f"✅ Algoritmo completado en {execution_time:.2f} segundos", file=sys.stderr)
        
        if solution is None:
            print("❌ El algoritmo no encontró una solución válida", file=sys.stderr)
            return None
            
        # Obtener la solución
        teams = algorithm.get_solution()
        end_time = time.time()
        
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
        
        # Crear estructura de resultado
        result = {
            "teams": result_teams,
            "fitness": algorithm._best_solution_value if hasattr(algorithm, '_best_solution_value') else 0,
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

def main():
    print("🚀 Iniciando algoritmo de formación de equipos REAL...", file=sys.stderr)
    
    if len(sys.argv) < 2:
        print("❌ Error: No se proporcionó ningún dato JSON.", file=sys.stderr)
        return 1

    data_str = sys.argv[1]
    print(f"📋 Datos recibidos: {len(data_str)} caracteres", file=sys.stderr)
    
    # 🔍 DEBUGGING: Imprimir los datos completos para diagnóstico
    print("🔍 DEBUGGING - Datos JSON completos recibidos:", file=sys.stderr)
    print(data_str, file=sys.stderr)
    print("🔍 DEBUGGING - Fin de datos JSON", file=sys.stderr)
    
    try:
        data = json.loads(data_str)
        print("✅ JSON parseado correctamente", file=sys.stderr)
        
        # 🔍 DEBUGGING: Mostrar estructura de datos detallada
        print(f"🔍 DEBUGGING - Estructura de datos:", file=sys.stderr)
        print(f"   - members: {len(data.get('members', []))}", file=sys.stderr)
        print(f"   - constraints: {len(data.get('constraints', []))}", file=sys.stderr)
        print(f"   - team_size: {data.get('team_size', 'undefined')}", file=sys.stderr)
        
        # Mostrar cada miembro en detalle
        for i, member in enumerate(data.get('members', [])[:3]):  # Solo primeros 3 para no saturar logs
            print(f"   - member[{i}]: {member}", file=sys.stderr)
        
        if len(data.get('members', [])) > 3:
            print(f"   - ... y {len(data.get('members', [])) - 3} miembros más", file=sys.stderr)
    
        # Validar estructura básica
        if 'members' not in data:
            print("❌ Error: No se encontró 'members' en los datos", file=sys.stderr)
            return 1
            
        if not data['members']:
            print("❌ Error: Lista de miembros está vacía", file=sys.stderr)
            return 1
            
        print(f"👥 Procesando {len(data['members'])} miembros", file=sys.stderr)
        print(f"🔧 Constraints: {len(data.get('constraints', []))}", file=sys.stderr)
        
        # Ejecutar algoritmo real
        result = execute_real_algorithm(data)
        
        if not result:
            print("❌ Error: No se crearon equipos", file=sys.stderr)
            return 1
            
        # Convertir resultado a JSON
        result_json = json.dumps(result, indent=2)
        
        print(f"✅ Algoritmo completado: {len(result['teams'])} equipos creados", file=sys.stderr)
        
        # Imprimir resultado en stdout (para captura del worker)
        print(result_json)
        
        return 0
        
    except json.JSONDecodeError as e:
        print(f"❌ Error parseando JSON: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"💥 Error inesperado: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
    
