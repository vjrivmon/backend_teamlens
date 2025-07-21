#!/usr/bin/env python3
"""
Script de prueba para diagnosticar problemas con OrderBasedBitKeyGA
"""

import sys
import json
from pathlib import Path

# Agregar ruta de pyteamformation
current_dir = Path(__file__).parent
pyteamformation_path = current_dir.parent.parent.parent / "pyteamformation"
sys.path.insert(0, str(pyteamformation_path))

def test_simple_algorithm():
    """Prueba el algoritmo con datos mínimos"""
    print("🧪 TESTING: Prueba simple del algoritmo")
    
    try:
        from pyteamformation.algorithm.metaheuristic.candel_ga import OrderBasedBitKeyGA
        from pyteamformation.problem.trait_team_formation_problem import TraitTeamFormationProblem
        
        print("✅ Importaciones exitosas")
        
        # Datos mínimos para 4 estudiantes
        simple_data = {
            "number_members": 4,
            "members": [
                {"traits": ["SH"]},
                {"traits": ["CW"]},
                {"traits": ["RI"]},
                {"traits": ["ME"]}
            ],
            "constraints": [
                {"type": "AllAssigned", "name": "", "number_members": 4},
                {"type": "NonOverlapping", "name": ""},
                {"type": "SizeCardinality", "name": "test_config", "team_size": 2, "min": 2, "max": 2}
            ],
            "problem_type": "TraitTeamFormation",
            "agg_func": "sum",
            "traits": ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"]
        }
        
        print("📋 Creando problema simple...")
        problem = TraitTeamFormationProblem.from_json_object(simple_data)
        print(f"✅ Problema creado con {problem.number_members} miembros")
        
        print("🤖 Creando algoritmo con parámetros mínimos...")
        algorithm = OrderBasedBitKeyGA(
            problem,
            pop_size=5,
            p_cross=0.5,
            p_mut=0.1,
            tournament_size=0.5,
            exchange_operations=1
        )
        print("✅ Algoritmo creado")
        
        print("🔄 Ejecutando algoritmo...")
        solution = algorithm.solve()
        print(f"✅ Algoritmo ejecutado, solución: {type(solution)}")
        
        teams = algorithm.get_solution()
        print(f"📊 Equipos: {teams}")
        
        return True
        
    except Exception as e:
        print(f"💥 Error en prueba simple: {e}")
        import traceback
        print(f"🔍 Stack trace: {traceback.format_exc()}")
        return False

def test_complex_algorithm():
    """Prueba el algoritmo con datos complejos similares a los reales"""
    print("\n🧪 TESTING: Prueba compleja del algoritmo")
    
    try:
        from pyteamformation.algorithm.metaheuristic.candel_ga import OrderBasedBitKeyGA
        from pyteamformation.problem.trait_team_formation_problem import TraitTeamFormationProblem
        
        # Datos similares a los reales (14 estudiantes)
        complex_data = {
            "number_members": 14,
            "members": [
                {"traits": ["SH"]}, {"traits": ["CW"]}, {"traits": ["RI"]}, {"traits": ["ME"]},
                {"traits": ["SH"]}, {"traits": ["SH"]}, {"traits": ["PL"]}, {"traits": ["CW"]},
                {"traits": ["ME"]}, {"traits": ["SH"]}, {"traits": ["CH"]}, {"traits": ["RI"]},
                {"traits": ["ME"]}, {"traits": ["PL"]}
            ],
            "constraints": [
                {"type": "AllAssigned", "name": "", "number_members": 14},
                {"type": "NonOverlapping", "name": ""},
                {"type": "SameTeam", "name": "", "members": [0, 1]},
                {"type": "DifferentTeam", "name": "", "members": [11, 12]},
                {"type": "SizeCardinality", "name": "frontend_config_0", "team_size": 4, "min": 2, "max": 2},
                {"type": "SizeCardinality", "name": "frontend_config_1", "team_size": 3, "min": 2, "max": 2}
            ],
            "problem_type": "TraitTeamFormation",
            "agg_func": "sum",
            "traits": ["TW", "CW", "CH", "ME", "CF", "SH", "PL", "RI"]
        }
        
        print("📋 Creando problema complejo...")
        problem = TraitTeamFormationProblem.from_json_object(complex_data)
        print(f"✅ Problema creado con {problem.number_members} miembros")
        
        print("🤖 Creando algoritmo con parámetros conservadores...")
        algorithm = OrderBasedBitKeyGA(
            problem,
            pop_size=10,
            p_cross=0.5,
            p_mut=0.05,
            tournament_size=0.2,
            exchange_operations=1
        )
        print("✅ Algoritmo creado")
        
        print("🔄 Ejecutando algoritmo...")
        solution = algorithm.solve()
        print(f"✅ Algoritmo ejecutado, solución: {type(solution)}")
        
        teams = algorithm.get_solution()
        print(f"📊 Equipos: {len(teams)} grupos")
        for i, team in enumerate(teams):
            print(f"   Equipo {i+1}: {team}")
        
        return True
        
    except Exception as e:
        print(f"💥 Error en prueba compleja: {e}")
        import traceback
        print(f"🔍 Stack trace: {traceback.format_exc()}")
        return False

if __name__ == "__main__":
    print("🧪 Iniciando diagnóstico del algoritmo OrderBasedBitKeyGA...")
    
    # Prueba simple primero
    simple_ok = test_simple_algorithm()
    
    if simple_ok:
        print("✅ Prueba simple exitosa, procediendo con prueba compleja...")
        complex_ok = test_complex_algorithm()
        
        if complex_ok:
            print("🎉 ¡Todas las pruebas exitosas!")
        else:
            print("❌ Prueba compleja falló")
    else:
        print("❌ Prueba simple falló - problema fundamental")
        
    print("🧪 Diagnóstico completado") 