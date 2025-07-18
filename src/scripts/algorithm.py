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
        try:
            # Crear el problema usando TraitTeamFormationProblem que es más flexible
            problem = TraitTeamFormationProblem.from_json_object(data)
            print(f"✅ Problema creado con {problem.number_members} miembros", file=sys.stderr)
        except Exception as problem_error:
            print(f"❌ Error creando problema: {problem_error}", file=sys.stderr)
            print(f"🔍 Tipo de error: {type(problem_error)}", file=sys.stderr)
            raise problem_error
        
        # Mostrar información detallada de constraints
        print(f"📋 Constraints del problema:", file=sys.stderr)
        for i, constraint in enumerate(problem._constraints):
            constraint_info = f"   {i}: {constraint.type} - {getattr(constraint, 'name', 'sin nombre')} - members: {getattr(constraint, 'members', 'N/A')}"
            print(constraint_info, file=sys.stderr)
        
        # CORREGIDO: Usar algoritmo concreto directamente
        print("🚀 Iniciando algoritmo de optimización...", file=sys.stderr)
        start_time = time.time()
        
        # Instanciar algoritmo genético directamente
        algorithm = OrderBasedBitKeyGA(problem)
        
        print(f"⚙️ Configurando algoritmo: OrderBasedBitKeyGA", file=sys.stderr)
        
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
        teams = execute_real_algorithm(data)
        
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
    
