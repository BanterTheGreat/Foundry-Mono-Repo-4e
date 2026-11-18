"""Generate current-data character fixtures; only the starter template ships in apps."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import build
import runtime_common

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / 'shared/fixtures'
TEST_PACKAGES = HERE / 'test-generated'
OVERRIDE = 'test.modern4e.presentation-override'
MODERN_PACKAGES = ['modern4e.classes', 'modern4e.ancestries', 'modern4e.themes',
                   'modern4e.feats', 'modern4e.utilities', 'modern4e.equipment']


def fingerprint(entry):
    """Mirror the shared codec defaults; JVM/JS tests verify every saved fingerprint."""
    entry = copy.deepcopy(entry)
    entry['presentation'].setdefault('publications', [])
    entry['presentation'].setdefault('references', [])
    # Compiler mechanics can share nested objects with sharedData. Codec defaults
    # apply only to mechanics; shared authoring JSON must remain byte-for-byte data.
    mechanics = copy.deepcopy(entry['mechanics'])
    entry['mechanics'] = mechanics
    for key in ('prerequisites', 'grants', 'choices', 'modifiers', 'progression'):
        mechanics.setdefault(key, [])
    for key in ('conditionalModifiers', 'unsupported', 'weaponAbilities', 'selectionModifiers', 'collections',
                'maximumSelections', 'classProfile', 'powerProfile', 'access', 'multiclassFor'):
        if mechanics.get(key) is None or mechanics.get(key) == [] or mechanics.get(key) == {}:
            mechanics.pop(key, None)
    for grant in mechanics['grants']:
        if grant.get('atLevel') == 1:
            grant.pop('atLevel')
    modifiers = mechanics['modifiers'] + [item['modifier'] for item in mechanics.get('conditionalModifiers', [])]
    for modifier in modifiers:
        modifier.setdefault('bonusType', 'UNTYPED')
        modifier['target'].setdefault('ability', None)
        modifier['target'].setdefault('skill', None)
    for choice in mechanics['choices']:
        if choice['type'] == 'proficiencies' and not choice.get('distinctAgainstCharacter', False):
            choice.pop('distinctAgainstCharacter', None)
        if choice['type'] != 'entries':
            continue
        choice.setdefault('entryIds', [])
        if choice.get('query'):
            for key, default in dict(category='POWER', usage=None, powerKind=None, levelMaximum=None,
                                     characterLevel=False, keywords=[]).items():
                choice['query'].setdefault(key, default)
        for key, default in {'atLevel': 1, 'distinct': False, 'countByLevel': [], 'constraints': [],
                             'collection': None, 'requiresCollection': None, 'query': None}.items():
            if choice.get(key, default) == default:
                choice.pop(key, None)
    for formula in mechanics.get('classProfile', {}).get('statistics', {}).values():
        formula.setdefault('perLevel', 0)
        formula.setdefault('abilities', {})
    if mechanics.get('powerProfile'):
        mechanics['powerProfile'].setdefault('keywords', [])
    canonical = json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    fingerprint = 'sha256-v1:' + hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    return fingerprint


def modern_sample(packages=None):
    """Production starter uses only authoritative packages and leaves choices open."""
    packages = build.production() if packages is None else packages
    entry = next(e for e in runtime_common.entries_of(packages) if e['id'] == 'modern4e.class.fighter')
    return dict(formatVersion=1, id='modern4e-new-fighter', savedAt='2026-11-17T12:00:00Z',
                identity=dict(name='New character'), level=1,
                packages=[dict(packageId=package, revision=packages[f'{package}/manifest.json']['revision'])
                          for package in MODERN_PACKAGES],
                abilities=dict(source=dict(sourceInstanceId='fighter', choiceId='main', ordinal=0),
                               mainAbility='STRENGTH', points=dict(STRENGTH=4, DEXTERITY=2, CONSTITUTION=2,
                                                                 INTELLIGENCE=1, WISDOM=0, CHARISMA=0)),
                levels=[dict(level=1, entries=[dict(instanceId='fighter',
                    slot=dict(sourceInstanceId='creation', choiceId='class', ordinal=0),
                    selection=dict(entryId=entry['id'], savedTitle=entry['presentation']['title'],
                                   supplierPackageId='modern4e.classes', acknowledgedFingerprint=fingerprint(entry)))],
                             proficiencies=[])], equipment=[], manualAdjustments=[])

def test_override(packages):
    """Test provenance with identical current mechanics and a marked presentation change."""
    entry = copy.deepcopy(next(e for e in runtime_common.entries_of(packages)
                               if e['id'] == 'modern4e.class.fighter'))
    entry['presentation']['description'] += '\n\n[Test-only presentation override; mechanics unchanged.]'
    result = runtime_common.package(OVERRIDE, 'Test-only presentation override', [entry])
    result[f'{OVERRIDE}/manifest.json']['dependencies'] = [dict(packageId='modern4e.classes',
        revision=packages['modern4e.classes/manifest.json']['revision'])]
    return result


def assets(packages=None):
    """Level 1/2 regression characters select real entries; unfinished choices remain visible."""
    packages = build.production() if packages is None else packages
    definitions = {e['id']: (name.split('/')[0], e) for name, chunk in packages.items()
                   if '/entries' in name for e in chunk['entries']}
    override = runtime_common.entries_of(test_override(packages))[0]
    def saved(entry_id):
        supplier, entry = definitions[entry_id]
        return dict(entryId=entry_id, savedTitle=entry['presentation']['title'],
                    supplierPackageId=supplier, acknowledgedFingerprint=fingerprint(entry))
    output = {}
    for level in (1, 2):
        for custom in (False, True):
            document = modern_sample(packages)
            document.update(id=f'current-fighter-{level}-' + ('override' if custom else 'base'), level=level)
            entries = document['levels'][0]['entries']
            for entry_id, instance, choice in [('modern4e.ancestry.dwarf', 'dwarf', 'ancestry'),
                                             ('modern4e.feat.skill-training', 'training', 'feat')]:
                entries.append(dict(instanceId=instance, slot=dict(sourceInstanceId='creation', choiceId=choice, ordinal=0),
                                    selection=saved(entry_id)))
            fighter = definitions['modern4e.class.fighter'][1]
            for grant in fighter['mechanics']['grants']:
                feature = definitions[grant['entryId']][1]
                parent = f"grant:7:fighter:{len(grant['grantId'])}:{grant['grantId']}"
                for choice in feature['mechanics'].get('choices', []):
                    if choice['type'] == 'entries' and choice.get('entryIds'):
                        for ordinal, entry_id in enumerate(choice['entryIds'][:choice['count']]):
                            entries.append(dict(instanceId=f"build-{grant['grantId']}-{ordinal}",
                                slot=dict(sourceInstanceId=parent, choiceId=choice['id'], ordinal=ordinal), selection=saved(entry_id)))
            for choice_id, power_ids in [('at-will', ['power992', 'power1000']),
                                         ('encounter', ['power1015']), ('daily', ['power1429', 'power1524'])]:
                for ordinal, power_id in enumerate(power_ids):
                    entries.append(dict(instanceId=power_id,
                        slot=dict(sourceInstanceId='fighter', choiceId=f'modern4e.choice.class-attack-{choice_id}', ordinal=ordinal),
                        selection=saved(f'modern4e.power.fighter-{power_id}')))
            document['levels'][0]['proficiencies'] = [dict(slot=dict(sourceInstanceId=source, choiceId=choice, ordinal=ordinal), skill=skill)
                for source, choice, ordinal, skill in [
                    ('background.environment.urban', 'skill', 0, 'SOCIETY'),
                    ('background.upbringing.labor', 'skill', 0, 'CRAFTING'),
                    ('creation', 'free-skill', 0, 'MEDICINE'), ('creation', 'free-skill', 1, 'RELIGION'),
                    ('training', 'modern4e.choice.skill-training.skills', 0, 'ATHLETICS'),
                    ('training', 'modern4e.choice.skill-training.skills', 1, 'ENDURANCE')]]
            document['equipment'] = [dict(instanceId='longsword', selection=saved('modern4e.weapon.longsword'), quantity=1, equipped=True)]
            if level == 2:
                document['levels'].append(dict(level=2, entries=[dict(instanceId='utility-2',
                    slot=dict(sourceInstanceId='fighter', choiceId='modern4e.choice.class-utility-2', ordinal=0),
                    selection=saved('modern4e.power.utility-class-fighter-power1119'))], proficiencies=[]))
            if custom:
                document['packages'].append(dict(packageId=OVERRIDE, revision='1'))
                entries[0]['selection'].update(supplierPackageId=OVERRIDE, acknowledgedFingerprint=fingerprint(override))
            output[f'sample-current-fighter-{level}-' + ('override' if custom else 'base') + '.json'] = document
    return output


def accepted_assets(packages=None):
    """Complete represented level-1/2 decisions, retaining explicit partial effect coverage."""
    packages = build.production() if packages is None else packages
    definitions = {e['id']: (name.split('/')[0], e) for name, chunk in packages.items()
                   if '/entries' in name for e in chunk['entries']}
    def saved(entry_id):
        supplier, entry = definitions[entry_id]
        return dict(entryId=entry_id, savedTitle=entry['presentation']['title'],
                    supplierPackageId=supplier, acknowledgedFingerprint=fingerprint(entry))
    result = {}
    for level in (1, 2):
        document = assets(packages)[f'sample-current-fighter-{level}-base.json']
        document.update(id=f'accepted-fighter-{level}')
        document['identity'].update(name='Accepted Fighter', environment='urban', upbringing='labor')
        document['levels'][0]['entries'].append(dict(instanceId='docker',
            slot=dict(sourceInstanceId='creation', choiceId='theme', ordinal=0),
            selection=saved('modern4e.theme.docker')))
        for item_id, instance in [('modern4e.armor.scale', 'scale'), ('modern4e.shield.heavy-shield', 'shield')]:
            document['equipment'].append(dict(instanceId=instance, selection=saved(item_id), quantity=1, equipped=True))
        if level == 2:
            document['levels'][1]['entries'].append(dict(instanceId='durable',
                slot=dict(sourceInstanceId='advancement.2', choiceId='feat', ordinal=0),
                selection=saved('modern4e.feat.durable')))
        result[f'sample-accepted-fighter-{level}.json'] = document
    non_combat = copy.deepcopy(result['sample-accepted-fighter-2.json'])
    non_combat['id'] = 'accepted-fighter-2-non-combat'
    utility = next(e for e in non_combat['levels'][1]['entries'] if e['slot']['choiceId'] == 'modern4e.choice.class-utility-2')
    utility['selection'] = saved('modern4e.power.utility-source-warlord-2-mind-for-maps')
    result['sample-accepted-fighter-2-non-combat.json'] = non_combat
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    packages = build.production()
    samples = assets(packages) | accepted_assets(packages)
    template = {'sample-modern-fighter.json': modern_sample(packages)}
    destinations = [(FIXTURES, samples | template), (TEST_PACKAGES, test_override(packages)),
        (HERE.parent / 'web/public/samples', template),
        (HERE.parent / 'android/src/main/assets/samples', template)]
    for root, values in destinations:
        for name, value in values.items():
            path = root / name
            data = build.serialize(value)
            if args.check:
                if not path.exists() or path.read_bytes() != data:
                    raise ValueError(f'{path}: missing or stale fixture; run content/samples.py')
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
    print('Checked' if args.check else 'Generated', 'four regression characters, three acceptance characters, test override and identical production starters')


if __name__ == '__main__':
    main()
