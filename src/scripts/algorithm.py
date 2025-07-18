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
        
        # Importar el algoritmo real - CAMBIADO: usar TraitTeamFormationProblem más genérico
        from pyteamformation.algorithm.algorithm import Algorithm
        from pyteamformation.problem.trait_team_formation_problem import TraitTeamFormationProblem
        
        print("✅ Algoritmo real importado correctamente", file=sys.stderr)
        
        # Crear el problema usando TraitTeamFormationProblem que es más flexible
        problem = TraitTeamFormationProblem.from_json_object(data)
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
    
