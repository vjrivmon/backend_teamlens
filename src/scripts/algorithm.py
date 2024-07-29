import sys
import json
import time
import random

def group_members(data):

    # Obtener la lista de miembros
    members = data['members']

    # Número de miembros por grupo
    number_members = data['number_members']

    # Barajar la lista de miembros
    random.shuffle(members)

    # Crear grupos
    groups = [ [member['id'] for member in members[i:i + number_members]] for i in range(0, len(members), number_members)]


    return groups


def main():

    if len(sys.argv) < 2:
        print("No se proporcionó ningún dato JSON.")
        return 1

    data = sys.argv[1]
    # data = '{"number_members":5,"members":[{"id":"6640b4f812d6a09b0f2a9af9","traits":[]},{"id":"66410505030d8f903f6541c0","traits":[]},{"id":"66a3f6d2a67fb6cd1215a3d0","traits":[]},{"id":"66a4fc2032ea42d2549bb970","traits":[]},{"id":"66a4fc2832ea42d2549bb971","traits":[]}],"agg_func":"sum","constraints":[{"type":"AllAssigned","name":"","number_members":23},{"type":"NonOverlapping","name":""}],"traits":["TW","CW","CH","ME","CF","SH","PL","RI"],"problem_type":"TraitTeamFormation"}'

    json_data = json.loads(data)

    teams = group_members(json_data)

    teams_json = json.dumps(teams, indent=2)

    print(teams_json)

    return 0

if __name__ == "__main__":
    sys.exit(main())
    
