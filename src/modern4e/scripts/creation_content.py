"""Validate and export literal creation/progression authoring, not runtime rules."""
import argparse
import json
from pathlib import Path

BOOK = Path(__file__).resolve().parents[1]
SOURCE = BOOK / 'content/creation/standard.json'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(value, names):
    require(isinstance(value, dict) and set(value) == set(names.split()), 'Missing or unknown fields')


def integer(value, minimum=0):
    require(type(value) is int and value >= minimum, 'Invalid integer')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key: ' + key)
        result[key] = value
    return result


def read(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def validate(data, initial=None):
    """Reject missing levels, malformed events, false coverage and broken totals."""
    fields(data, 'schemaVersion id title creationIntroduction steps creationRules advancementTitle advancementIntroduction coverage levels initialPowerChoices abilityAllocation techniqueAcquisition')
    require(type(data['schemaVersion']) is int and data['schemaVersion'] == 1, 'Unsupported schema')
    require(data['id'] == 'modern4e.creation-and-advancement.standard', 'Invalid identity')
    for key in ['title', 'creationIntroduction', 'advancementTitle', 'advancementIntroduction']:
        require(isinstance(data[key], str) and bool(data[key].strip()), 'Empty text: ' + key)
    fields(data['coverage'], 'status limitations')
    require(data['coverage']['status'] == 'PARTIAL' and len(data['coverage']['limitations']) >= 1, 'Provisional coverage required')
    require(all(isinstance(x, str) and x.strip() for x in data['coverage']['limitations']), 'Invalid limitation')
    ids = set()
    def identity(value):
        require(isinstance(value, str) and value.startswith('modern4e.') and value not in ids, 'Invalid/duplicate identity')
        ids.add(value)
    require(len(data['steps']) == 6, 'Expected six creation steps')
    for step in data['steps']:
        fields(step, 'id title description required')
        identity(step['id'])
        require(type(step['required']) is bool, 'Invalid required flag')
        require(all(isinstance(step[k], str) and step[k].strip() for k in ['title', 'description']), 'Empty creation text')
    creation = data['creationRules']
    fields(creation, 'freeSkillProficiencies startingFeats themeOptional equipment')
    for key in ['freeSkillProficiencies', 'startingFeats']:
        integer(creation[key], 1)
    require(type(creation['themeOptional']) is bool, 'Invalid theme flag')
    equipment = creation['equipment']
    fields(equipment, 'weaponMinimum weaponMaximum armor shield implement requiresProficiency')
    for key in ['weaponMinimum', 'weaponMaximum', 'armor', 'shield', 'implement']:
        integer(equipment[key], 1)
    require(equipment['weaponMinimum'] <= equipment['weaponMaximum'], 'Invalid weapon range')
    require(equipment['requiresProficiency'] is True, 'Equipment requires proficiency')
    allocation = data['abilityAllocation']
    fields(allocation, 'mainPoints nonMainBudget nonMainMinimum nonMainMaximum tradeoff')
    for key in ['mainPoints', 'nonMainBudget', 'nonMainMinimum', 'nonMainMaximum']:
        integer(allocation[key])
    require(allocation['nonMainMinimum'] <= allocation['nonMainMaximum'], 'Invalid allocation bounds')
    tradeoff = allocation['tradeoff']
    fields(tradeoff, 'maximumPairs loweredValue increase raisedMaximum')
    require(tradeoff == {'maximumPairs': 1, 'loweredValue': -1, 'increase': 1, 'raisedMaximum': allocation['nonMainMaximum'] + 1}, 'Unsupported paired tradeoff')
    technique = data['techniqueAcquisition']
    fields(technique, 'firstLevel everyLevels count optional maximumEntryLevel requiresMatchingPowerSource description')
    for key in ['firstLevel', 'everyLevels', 'count']:
        integer(technique[key], 1)
    require(type(technique['optional']) is bool and technique['maximumEntryLevel'] == 'CHARACTER_LEVEL', 'Invalid technique acquisition')
    require(technique['requiresMatchingPowerSource'] == ['ARCANE', 'PRIMAL', 'DIVINE'], 'Invalid technique source restrictions')
    require(isinstance(technique['description'], str) and technique['description'].strip(), 'Missing technique text')
    require([r['level'] for r in data['levels']] == list(range(1, 31)), 'Expected ordered levels 1-30')
    previous_feats = 0
    previous_powers = dict.fromkeys(['atWill', 'encounter', 'daily', 'utility'], 0)
    for row in data['levels']:
        fields(row, 'level status abilityIncrease events featTotal powerTotals')
        integer(row['level'], 1)
        require(row['status'] == ('AUTHORED' if row['level'] <= 10 else 'PROVISIONAL'), 'Invalid level coverage')
        ability = row['abilityIncrease']
        fields(ability, 'type amount')
        require(ability['type'] in ['CLASS', 'NONE', 'NON_MAIN', 'MAIN', 'ALL'], 'Unknown ability increase')
        integer(ability['amount'])
        require(ability['amount'] == (1 if ability['type'] in ['NON_MAIN', 'MAIN', 'ALL'] else 0), 'Invalid increase amount')
        fields(row['powerTotals'], 'atWill encounter daily utility')
        calculated = previous_powers.copy()
        feat_gains = 0
        require(isinstance(row['events'], list) and row['events'], 'Missing level events')
        for event in row['events']:
            names = 'id operation target category owner'
            if event['operation'] != 'GRANT_FEATURES':
                names += ' count'
            if event['category'] == 'POWER':
                names += ' powerKind usage maximumEntryLevel'
            fields(event, names)
            identity(event['id'])
            require(event['operation'] in ['GAIN', 'REPLACE', 'GRANT_FEATURES'], 'Unknown event operation')
            require(event['category'] in ['FEAT', 'POWER', 'FEATURE'], 'Unknown event category')
            require(event['owner'] in ['CHARACTER', 'CLASS', 'ANCESTRY', 'PARAGON_PATH', 'EPIC_DESTINY'], 'Unknown event owner')
            require(isinstance(event['target'], str) and event['target'].strip(), 'Missing literal target')
            if event['operation'] == 'GRANT_FEATURES':
                require(event['category'] == 'FEATURE', 'Expected feature grant')
            else:
                integer(event['count'], 1)
            if event['category'] == 'FEAT':
                require(event['operation'] == 'GAIN', 'Unsupported feat operation')
                feat_gains += event['count']
            if event['category'] == 'POWER':
                require(event['powerKind'] in ['ATTACK', 'UTILITY', 'UNRESOLVED'], 'Unknown power kind')
                require(event['usage'] in ['AT_WILL', 'ENCOUNTER', 'DAILY', 'UNRESOLVED'], 'Unknown power usage')
                require(event['maximumEntryLevel'] == row['level'], 'Incorrect acquisition level')
                column = 'utility' if event['powerKind'] == 'UTILITY' else {'AT_WILL': 'atWill', 'ENCOUNTER': 'encounter', 'DAILY': 'daily'}.get(event['usage'])
                require(column is not None, 'Missing power classification')
                if event['operation'] == 'REPLACE':
                    require(previous_powers[column] >= event['count'], 'Cannot replace absent power')
                else:
                    calculated[column] += event['count']
        integer(row['featTotal'])
        require(row['featTotal'] == previous_feats + feat_gains, 'Incorrect cumulative feat total')
        for value in row['powerTotals'].values():
            integer(value)
        require(row['powerTotals'] == calculated, 'Incorrect cumulative power totals')
        previous_feats, previous_powers = row['featTotal'], calculated
    initial = initial if initial is not None else read(BOOK / 'content/classes/advancement.json')
    require(data['initialPowerChoices'] == initial['id'], 'Broken initial advancement reference')
    for choice in initial['powerChoices']:
        if choice['atLevel'] != 1:
            continue
        usage = choice['source']['filters']['usage']
        column = {'AT_WILL': 'atWill', 'ENCOUNTER': 'encounter', 'DAILY': 'daily'}[usage]
        require(choice['count'] == data['levels'][0]['powerTotals'][column], 'Initial class choices disagree')
    require(creation['startingFeats'] == data['levels'][0]['featTotal'], 'Starting feat mismatch')
    return data


def catalog():
    return {'schemaVersion': 1, 'kind': 'modern4e.creation-authoring', 'rules': validate(read(SOURCE))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = json.dumps(catalog(), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        require(not args.output.resolve().is_relative_to(BOOK.resolve()), 'Export cannot overwrite rulebook sources')
        if args.check:
            require(args.output.exists() and args.output.read_text(encoding='utf-8') == data, 'Stale export')
        else:
            args.output.write_text(data, encoding='utf-8')
    else:
        require(not args.check, '--check requires --output')
        print('Validated creation and all 30 advancement levels')


if __name__ == '__main__':
    main()
