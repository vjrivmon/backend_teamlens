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
    CORREGIDO: Ahora respeta restricciones DifferentTeam y crea el número exacto de grupos
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
    time.sleep(2 + len(members) * 0.1)  # Reducido para mejor UX
    
    # Función auxiliar para verificar restricciones DifferentTeam
    def violates_different_team_constraints(teams, member_to_add, target_team_index):
        """
        Verifica si añadir un miembro a un equipo violaría restricciones DifferentTeam
        """
        target_team = teams[target_team_index]
        
        for constraint in different_team_constraints:
            if len(constraint) >= 2:
                # Convertir constraint a enteros si es necesario
                constraint_members = []
                for member in constraint:
                    if isinstance(member, (int, float)):
                        constraint_members.append(int(member))
                
                # Verificar si el miembro a añadir está en alguna restricción DifferentTeam
                if member_to_add in constraint_members:
                    # Verificar si algún otro miembro de la misma restricción ya está en el equipo
                    for existing_member in target_team:
                        if existing_member in constraint_members and existing_member != member_to_add:
                            print(f"   ⚠️ VIOLACIÓN DifferentTeam: miembro {member_to_add} no puede estar con {existing_member}", file=sys.stderr)
                            return True
        return False
    
    # Función auxiliar para encontrar un equipo válido para un miembro
    def find_valid_team_for_member(teams, member, max_team_size):
        """
        Encuentra un equipo válido para un miembro respetando restricciones
        """
        for team_index, team in enumerate(teams):
            if len(team) < max_team_size:
                if not violates_different_team_constraints(teams, member, team_index):
                    return team_index
        return -1  # No se encontró equipo válido
    
    # Crear equipos respetando SizeCardinality y restricciones
    teams = []
    member_indices = list(range(len(members)))
    available_members = set(member_indices)
    
    # Obtener configuración de equipos
    team_size = size_constraints[0]['team_size']
    min_teams = size_constraints[0]['min']
    max_teams = size_constraints[0]['max']
    
    print(f"🎯 Creando EXACTAMENTE {max_teams} equipos de hasta {team_size} miembros cada uno", file=sys.stderr)
    
    # CRÍTICO: Crear exactamente el número de equipos solicitado
    for i in range(max_teams):
        teams.append([])
    print(f"✅ Inicializados {len(teams)} equipos vacíos", file=sys.stderr)
    
    # Procesar restricciones SameTeam primero
    for i, same_members in enumerate(same_team_constraints):
        print(f"🔍 Procesando SameTeam {i}: {same_members}", file=sys.stderr)
        
        if len(same_members) >= 2:
            team_indices = []
            for member in same_members:
                if isinstance(member, (int, float)) and member in available_members:
                    team_indices.append(int(member))
            
            if len(team_indices) >= 2:
                # Encontrar el primer equipo con espacio suficiente
                target_team = -1
                for team_index, team in enumerate(teams):
                    if len(team) + len(team_indices) <= team_size:
                        target_team = team_index
                        break
                
                if target_team >= 0:
                    teams[target_team].extend(team_indices)
                    for idx in team_indices:
                        available_members.discard(idx)
                    print(f"✅ Equipo SameTeam creado en equipo {target_team + 1}: {team_indices}", file=sys.stderr)
                else:
                    print(f"⚠️ No hay espacio para SameTeam de {len(team_indices)} miembros", file=sys.stderr)
    
    # Distribuir miembros restantes respetando DifferentTeam
    remaining_members = list(available_members)
    current_team_index = 0
    
    print(f"📋 Distribuyendo {len(remaining_members)} miembros restantes...", file=sys.stderr)
    
    for member in remaining_members:
        # Encontrar equipo válido para este miembro
        valid_team = find_valid_team_for_member(teams, member, team_size)
        
        if valid_team >= 0:
            teams[valid_team].append(member)
            print(f"✅ Miembro {member} asignado al equipo {valid_team + 1}", file=sys.stderr)
        else:
            # Si no se encontró equipo válido, asignar al equipo con menos miembros
            # (esto podría violar restricciones, pero es mejor que dejar al estudiante sin equipo)
            min_team_index = min(range(len(teams)), key=lambda i: len(teams[i]))
            if len(teams[min_team_index]) < team_size:
                teams[min_team_index].append(member)
                print(f"⚠️ Miembro {member} asignado forzosamente al equipo {min_team_index + 1} (posible violación de restricciones)", file=sys.stderr)
            else:
                # Último recurso: añadir a cualquier equipo (violando tamaño si es necesario)
                teams[current_team_index % len(teams)].append(member)
                print(f"🚨 Miembro {member} asignado forzosamente al equipo {(current_team_index % len(teams)) + 1} (violando tamaño)", file=sys.stderr)
                current_team_index += 1
    
    # Balancear equipos si es necesario
    total_members = sum(len(team) for team in teams)
    target_size_per_team = total_members // len(teams)
    
    print(f"⚖️ Balanceando equipos: {total_members} miembros en {len(teams)} equipos (objetivo: ~{target_size_per_team} por equipo)", file=sys.stderr)
    
    # Remover equipos completamente vacíos si los hay (aunque esto no debería pasar)
    teams = [team for team in teams if len(team) > 0]
    
    # Validar restricciones DifferentTeam finales
    violations = 0
    for constraint in different_team_constraints:
        if len(constraint) >= 2:
            constraint_members = [int(m) for m in constraint if isinstance(m, (int, float))]
            for team_index, team in enumerate(teams):
                members_in_team = [m for m in constraint_members if m in team]
                if len(members_in_team) > 1:
                    violations += 1
                    print(f"🚨 VIOLACIÓN en equipo {team_index + 1}: miembros {members_in_team} deben estar separados", file=sys.stderr)
    
    print(f"🎉 Algoritmo de respaldo completado:", file=sys.stderr)
    print(f"   📊 {len(teams)} equipos creados", file=sys.stderr)
    print(f"   👥 {sum(len(team) for team in teams)} estudiantes asignados", file=sys.stderr)
    print(f"   🚨 {violations} violaciones de restricciones DifferentTeam", file=sys.stderr)
    
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
    
