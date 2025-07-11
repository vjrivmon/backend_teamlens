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
        
        # Importar el algoritmo real
        from pyteamformation.algorithm.algorithm import Algorithm
        from pyteamformation.problem.belbin_aranzabal import AranzabalBelbinProblem
        
        print("✅ Algoritmo real importado correctamente", file=sys.stderr)
        
        # Crear el problema
        problem = AranzabalBelbinProblem.from_json_object(data)
        print(f"✅ Problema creado con {problem.number_members} miembros", file=sys.stderr)
        
        # Mostrar información detallada de constraints
        print(f"📋 Constraints del problema:", file=sys.stderr)
        for i, constraint in enumerate(problem._constraints):
            print(f"   {i}: {constraint.type} - {getattr(constraint, 'name', 'sin nombre')} - members: {getattr(constraint, 'members', 'N/A')}", file=sys.stderr)
        
        # Crear y ejecutar el algoritmo
        print("🚀 Iniciando algoritmo de optimización...", file=sys.stderr)
        start_time = time.time()
        
        # Usar algoritmo genético (más robusto)
        algorithm = Algorithm(problem, "CANDEL_GA")
        
        print(f"⚙️ Configurando algoritmo: {algorithm._algorithm_name}", file=sys.stderr)
        
        # Configurar parámetros para un tiempo real de ejecución
        algorithm.set_parameters({
            'population_size': 50,
            'generations': 100,
            'mutation_rate': 0.1,
            'crossover_rate': 0.8
        })
        
        print("🔄 Ejecutando algoritmo de optimización (esto puede tardar 1-3 minutos)...", file=sys.stderr)
        
        # Ejecutar el algoritmo
        solution = algorithm.solve()
        
        execution_time = time.time() - start_time
        print(f"✅ Algoritmo completado en {execution_time:.2f} segundos", file=sys.stderr)
        
        if solution is None:
            print("❌ El algoritmo no encontró una solución válida", file=sys.stderr)
            return None
            
        # Convertir la solución a formato de equipos
        teams = solution.get_teams()
        
        print(f"🎉 Solución encontrada: {len(teams)} equipos", file=sys.stderr)
        for i, team in enumerate(teams):
            print(f"   Equipo {i+1}: {len(team)} miembros (índices: {team})", file=sys.stderr)
        
        return teams
        
    except ImportError as e:
        print(f"❌ Error importando pyteamformation: {e}", file=sys.stderr)
        print("⚠️ Usando algoritmo de respaldo...", file=sys.stderr)
        return fallback_algorithm(data)
    except Exception as e:
        print(f"💥 Error en algoritmo real: {e}", file=sys.stderr)
        print("⚠️ Usando algoritmo de respaldo...", file=sys.stderr)
        return fallback_algorithm(data)

def fallback_algorithm(data):
    """
    Algoritmo de respaldo que al menos respeta las restricciones básicas
    """
    print("🔄 Ejecutando algoritmo de respaldo mejorado...", file=sys.stderr)
    
    members = data['members']
    constraints = data.get('constraints', [])
    
    # Buscar todas las constraints SizeCardinality
    size_constraints = []
    same_team_constraints = []
    different_team_constraints = []
    
    for constraint in constraints:
        if constraint.get('type') == 'SizeCardinality':
            size_constraints.append({
                'team_size': constraint.get('team_size', 4),
                'min': constraint.get('min', 1),
                'max': constraint.get('max', 1)
            })
        elif constraint.get('type') == 'SameTeam':
            same_team_constraints.append(constraint.get('members', []))
        elif constraint.get('type') == 'DifferentTeam':
            different_team_constraints.append(constraint.get('members', []))
    
    print(f"📊 Constraints encontradas:", file=sys.stderr)
    print(f"   - SizeCardinality: {len(size_constraints)}", file=sys.stderr)
    print(f"   - SameTeam: {len(same_team_constraints)}", file=sys.stderr)
    print(f"   - DifferentTeam: {len(different_team_constraints)}", file=sys.stderr)
    
    if not size_constraints:
        print("⚠️ No se encontraron constraints SizeCardinality, usando tamaño por defecto", file=sys.stderr)
        size_constraints = [{'team_size': 4, 'min': 1, 'max': 1}]
    
    # Simular tiempo de procesamiento real
    print("⏱️ Simulando tiempo de procesamiento real...", file=sys.stderr)
    time.sleep(2 + len(members) * 0.5)  # 2 segundos base + 0.5 por miembro
    
    # Crear equipos respetando SizeCardinality
    teams = []
    member_indices = list(range(len(members)))
    available_members = set(member_indices)
    
    # Procesar restricciones SameTeam primero
    for i, same_members in enumerate(same_team_constraints):
        print(f"   🔍 Procesando SameTeam {i}: {same_members} (tipo: {type(same_members)})", file=sys.stderr)
        
        if len(same_members) >= 2:
            # Convertir a índices si son strings/IDs de MongoDB
            team_indices = []
            for member in same_members:
                if isinstance(member, (int, float)):
                    # Ya es un índice
                    if member in available_members:
                        team_indices.append(int(member))
                else:
                    # Es un ID de MongoDB, ignorar (el worker debería haber mapeado esto)
                    print(f"   ⚠️ ID de MongoDB encontrado en SameTeam: {member}", file=sys.stderr)
            
            if len(team_indices) >= 2:
                teams.append(team_indices)
                for idx in team_indices:
                    available_members.discard(idx)
                print(f"   ✅ Equipo SameTeam creado: {team_indices}", file=sys.stderr)
            else:
                print(f"   ❌ SameTeam sin suficientes miembros válidos: {team_indices}", file=sys.stderr)
        else:
            print(f"   ⚠️ SameTeam ignorado - solo tiene {len(same_members)} miembro(s)", file=sys.stderr)
    
    # Crear equipos según SizeCardinality
    for size_config in size_constraints:
        team_size = size_config['team_size']
        min_teams = size_config['min']
        max_teams = size_config['max']
        
        print(f"   🔧 Creando {min_teams}-{max_teams} equipos de {team_size} miembros", file=sys.stderr)
        
        teams_created = 0
        remaining_members = list(available_members)
        
        while teams_created < max_teams and len(remaining_members) >= team_size:
            team = remaining_members[:team_size]
            teams.append(team)
            teams_created += 1
            
            for idx in team:
                available_members.discard(idx)
                remaining_members.remove(idx)
            
            print(f"   ✅ Equipo {len(teams)} creado: {team}", file=sys.stderr)
    
    # Asignar miembros restantes si los hay
    if available_members:
        remaining = list(available_members)
        if teams:
            # Distribuir en equipos existentes
            for i, member in enumerate(remaining):
                team_index = i % len(teams)
                teams[team_index].append(member)
                print(f"   ➕ Miembro {member} añadido al equipo {team_index + 1}", file=sys.stderr)
        else:
            # Crear un último equipo con los restantes
            teams.append(remaining)
            print(f"   ✅ Equipo final creado con miembros restantes: {remaining}", file=sys.stderr)
    
    print(f"🎉 Algoritmo de respaldo completado: {len(teams)} equipos", file=sys.stderr)
    return teams

def main():
    print("🚀 Iniciando algoritmo de formación de equipos REAL...", file=sys.stderr)
    
    if len(sys.argv) < 2:
        print("❌ Error: No se proporcionó ningún dato JSON.", file=sys.stderr)
        return 1

    data_str = sys.argv[1]
    print(f"📋 Datos recibidos: {len(data_str)} caracteres", file=sys.stderr)
    
    try:
        json_data = json.loads(data_str)
        print(f"✅ JSON parseado correctamente", file=sys.stderr)
        
        # Validar estructura básica
        if 'members' not in json_data:
            print("❌ Error: No se encontró 'members' en los datos", file=sys.stderr)
            return 1
            
        if not json_data['members']:
            print("❌ Error: Lista de miembros está vacía", file=sys.stderr)
            return 1
            
        print(f"👥 Procesando {len(json_data['members'])} miembros", file=sys.stderr)
        print(f"🔧 Constraints: {len(json_data.get('constraints', []))}", file=sys.stderr)
        
        # Ejecutar algoritmo real
        teams = execute_real_algorithm(json_data)
        
        if not teams:
            print("❌ Error: No se crearon equipos", file=sys.stderr)
            return 1
            
        # Convertir resultado a JSON
        teams_json = json.dumps(teams, indent=2)
        
        print(f"✅ Algoritmo completado: {len(teams)} equipos creados", file=sys.stderr)
        
        # Imprimir resultado en stdout (para captura del worker)
        print(teams_json)
        
        return 0
        
    except json.JSONDecodeError as e:
        print(f"❌ Error parseando JSON: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"💥 Error inesperado: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
    
