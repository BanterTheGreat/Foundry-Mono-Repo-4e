"""Reproduce portable Fighter decisions and coverage; no runtime rules or IO adapter."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import build

HERE = Path(__file__).resolve().parent
BASE = 'modern4e.fighter-proof'
OVERRIDE = BASE + '.override'
FIXTURES = HERE.parent / 'shared' / 'fixtures'


def assets():
    """Generate shared portable inputs from the same packages shipped by both clients."""
    packages = build.build(HERE / 'proof.json')
    definitions = {package: {entry['id']: entry for name, chunk in packages.items()
        if name.startswith(package + '/entries-') for entry in chunk['entries']}
        for package in (BASE, OVERRIDE)}

    def saved(id, custom=False):
        supplier = OVERRIDE if custom and id == 'class3' else BASE
        entry = copy.deepcopy(definitions[supplier][id])
        entry['mechanics'] = dict(prerequisites=[], grants=[], choices=[], modifiers=[], progression=[]) | entry['mechanics']
        for progression in entry['mechanics']['progression']:
            for field in ('grants', 'choices', 'modifiers'):
                progression.setdefault(field, [])
        for modifier in entry['mechanics']['modifiers'] + [m for p in entry['mechanics']['progression'] for m in p['modifiers']]:
            modifier.setdefault('bonusType', 'UNTYPED')
            modifier['target'].setdefault('ability', None)
            modifier['target'].setdefault('skill', None)
        # The v1 codec emits all defaults; keys are ASCII and source strings use UTF-8.
        canonical = json.dumps(entry, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        fingerprint = 'sha256-v1:' + hashlib.sha256(canonical.encode()).hexdigest()
        return dict(entryId=id, savedTitle=entry['presentation']['title'], supplierPackageId=supplier,
                    acknowledgedFingerprint=fingerprint)

    def slot(source, choice, ordinal=0):
        return dict(sourceInstanceId=source, choiceId=choice, ordinal=ordinal)

    def selection(id, instance, source, choice, ordinal=0, custom=False):
        return dict(instanceId=instance, slot=slot(source, choice, ordinal), selection=saved(id, custom))

    output = {}
    for level in (1, 2):
        for custom in (False, True):
            entries = [selection('class3', 'fighter', 'creation', 'class', custom=custom),
                       selection('race2', 'dwarf', 'creation', 'ancestry'),
                       selection('feat166', 'training', 'creation', 'feat')]
            for choice, ids in [('at-will', ['power992', 'power1000']), ('encounter', ['power1015']), ('daily', ['power1429', 'power1524'])]:
                entries += [selection(id, id, 'fighter', choice, i) for i, id in enumerate(ids)]
            proficiencies = [dict(slot=slot(source, choice, ordinal), skill=skill) for source, choice, ordinal, skill in [
                ('background.environment.urban', 'skill', 0, 'SOCIETY'),
                ('background.upbringing.labor', 'skill', 0, 'CRAFTING'),
                ('creation', 'free-skill', 0, 'MEDICINE'), ('creation', 'free-skill', 1, 'RELIGION'),
                ('training', 'skill-training', 0, 'ATHLETICS')]]
            document = dict(formatVersion=1, id=f'fighter-proof-{level}-' + ('override' if custom else 'base'),
                savedAt='2026-11-17T12:00:00Z', identity=dict(name='Torbera, urban artisan', notes='Provisional proof. Urban Society; Labor Crafting; free Medicine/Religion. Dwarf Sturdy, Stand Your Ground, Dwarven Resilience and Fighter Combat Challenge/Reactivity (Combat Reactivity) are descriptive only. Theme omitted (optional).'),
                packages=[dict(packageId=BASE, revision='1')] + ([dict(packageId=OVERRIDE, revision='1')] if custom else []),
                level=level, abilities=dict(source=slot('fighter', 'main-ability'), mainAbility='STRENGTH', points=dict(STRENGTH=4, DEXTERITY=2, CONSTITUTION=2, INTELLIGENCE=1, WISDOM=0, CHARISMA=0)),
                levels=[dict(level=1, entries=entries, proficiencies=proficiencies)],
                equipment=[dict(instanceId=id, selection=saved(id), quantity=1, equipped=True) for id in ['weapon3610', 'armor5', 'armor8']],
                manualAdjustments=[dict(id='medicine-manual', modifier=dict(target=dict(statistic='SKILL_CHECK',skill='MEDICINE'),operation='ADD',value=2,bonusType='UNTYPED'))])
            if level == 2:
                document['levels'].append(dict(level=2,entries=[selection('power1522','power1522','fighter','utility'),selection('feat261','power-attack','advancement.2','feat')]))
            output[f'sample-fighter-{level}-' + ('override' if custom else 'base') + '.json'] = document
    output['sample-coverage.json'] = dict(packages=[BASE, OVERRIDE], overrides=[dict(packageId=OVERRIDE, id='class3', source='https://iws.mx/dnd/?view=class3', coverage=definitions[OVERRIDE]['class3']['coverage'])], entries=[dict(id=id,title=e['presentation']['title'],source=f'https://iws.mx/dnd/?view={id}',publications=e['presentation']['publications'],coverage=e['coverage']) for id,e in sorted(definitions[BASE].items())],
        expected=dict(abilities=dict(STRENGTH=4,DEXTERITY=2,CONSTITUTION=2,INTELLIGENCE=1,WISDOM=0,CHARISMA=0),skills=dict(ATHLETICS=9,ACROBATICS=2,STEALTH=2,THIEVERY=2,ENDURANCE=2,ARCANA=1,CRAFTING=6,SOCIETY=6,MEDICINE=8,INSIGHT=0,NATURE=0,PERCEPTION=0,RELIGION=5,BLUFF=0,DIPLOMACY=0,INTIMIDATE=0),overrideLevel2Medicine=9))
    return output


MODERN_PACKAGES = ['modern4e.classes', 'modern4e.ancestries', 'modern4e.themes', 'modern4e.feats',
                   'modern4e.utilities', 'modern4e.equipment']


def modern_sample():
    """New-character template; legacy proof saves remain separate named fixtures."""
    packages = build.production()
    entry = copy.deepcopy(next(entry for entry in packages['modern4e.classes/entries.json']['entries']
                               if entry['id'] == 'modern4e.class.fighter'))
    entry['presentation'].update(publications=[], references=[])
    mechanics = entry['mechanics']
    for key in ('prerequisites', 'grants', 'choices', 'modifiers', 'progression'):
        mechanics.setdefault(key, [])
    for key in ('conditionalModifiers', 'unsupported', 'weaponAbilities', 'selectionModifiers', 'collections'):
        if not mechanics.get(key):
            mechanics.pop(key, None)
    for grant in mechanics['grants']:
        if grant.get('atLevel') == 1:
            grant.pop('atLevel')
    for choice in mechanics['choices']:
        choice.setdefault('entryIds', [])
        if choice.get('query'):
            for key, default in dict(category='POWER', usage=None, powerKind=None, levelMaximum=None,
                                     characterLevel=False, keywords=[]).items():
                choice['query'].setdefault(key, default)
        for key, default in {'atLevel': 1, 'distinct': False, 'countByLevel': [], 'constraints': [],
                             'collection': None, 'requiresCollection': None, 'query': None}.items():
            if choice.get(key, default) == default:
                choice.pop(key, None)
    for formula in mechanics['classProfile']['statistics'].values():
        formula.setdefault('perLevel', 0)
        formula.setdefault('abilities', {})
    canonical = json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    fingerprint = 'sha256-v1:' + hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    return dict(formatVersion=1, id='modern4e-new-fighter', savedAt='2026-11-17T12:00:00Z',
                identity=dict(name='New character'), level=1,
                packages=[dict(packageId=package, revision=packages[f'{package}/manifest.json']['revision'])
                          for package in MODERN_PACKAGES] + [dict(packageId=BASE, revision='2')],
                abilities=dict(source=dict(sourceInstanceId='fighter', choiceId='main', ordinal=0),
                               mainAbility='STRENGTH', points=dict(STRENGTH=4, DEXTERITY=2, CONSTITUTION=2,
                                                                 INTELLIGENCE=1, WISDOM=0, CHARISMA=0)),
                levels=[dict(level=1, entries=[dict(instanceId='fighter',
                    slot=dict(sourceInstanceId='creation', choiceId='class', ordinal=0),
                    selection=dict(entryId=entry['id'], savedTitle=entry['presentation']['title'],
                                   supplierPackageId='modern4e.classes', acknowledgedFingerprint=fingerprint))],
                             proficiencies=[])], equipment=[], manualAdjustments=[])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    samples = assets()
    packages = build.build(HERE / 'proof.json')
    bundle = {name: value for name, value in packages.items() if name.split('/')[0] in (BASE, OVERRIDE)}
    bundle.update({'samples/' + name: value for name, value in samples.items()})
    destinations = [(FIXTURES, samples),
        (HERE.parent / 'web/public/proof', bundle),
        (HERE.parent / 'android/src/main/assets/proof', bundle),
        (FIXTURES, {'sample-modern-fighter.json': modern_sample()}),
        (HERE.parent / 'web/public/samples', {'sample-modern-fighter.json': modern_sample()}),
        (HERE.parent / 'android/src/main/assets/samples', {'sample-modern-fighter.json': modern_sample()})]
    for root, values in destinations:
        for name, value in values.items():
            path = root / name
            data = build.serialize(value)
            if args.check:
                if not path.exists() or path.read_bytes() != data:
                    raise ValueError(f'{path}: missing or stale sample/bundle; run content/samples.py')
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
    print('Checked' if args.check else 'Generated', 'four legacy samples, a Modern 4e template, coverage and identical platform bundles')


if __name__ == '__main__':
    main()
