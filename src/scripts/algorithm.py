import sys
import json
import time
import random

def group_members(data):
    """
    Crea grupos de estudiantes basado en la configuración del algoritmo
    CORREGIDO: Maneja estructura sin IDs, usa índices en su lugar
    """
    
    # Obtener la lista de miembros (sin IDs, solo traits)
    members = data['members']
    
    # Obtener constraints
    constraints = data.get('constraints', [])
    
    # Buscar constraint SizeCardinality para obtener tamaño de equipo
    team_size = 4  # Default
    for constraint in constraints:
        if constraint.get('type') == 'SizeCardinality':
            team_size = constraint.get('team_size', 4)
            break
    
    print(f"Configuración del algoritmo:", file=sys.stderr)
    print(f"  - Total miembros: {len(members)}", file=sys.stderr)
    print(f"  - Tamaño de equipo: {team_size}", file=sys.stderr)
    print(f"  - Equipos estimados: {len(members) // team_size}", file=sys.stderr)
    
    # Crear índices para los miembros (ya que no tienen IDs)
    member_indices = list(range(len(members)))
    
    # Barajar los índices para distribución aleatoria
    random.shuffle(member_indices)
    
    # Crear grupos usando índices
    groups = []
    for i in range(0, len(member_indices), team_size):
        group = member_indices[i:i + team_size]
        groups.append(group)
    
    print(f"Grupos creados: {len(groups)}", file=sys.stderr)
    for i, group in enumerate(groups):
        print(f"  Grupo {i+1}: {len(group)} miembros (índices: {group})", file=sys.stderr)
    
    return groups

def main():
    print("🚀 Iniciando algoritmo de formación de equipos...", file=sys.stderr)
    
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
        
        # Ejecutar algoritmo de agrupación
        teams = group_members(json_data)
        
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
    
