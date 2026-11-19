"""Validate the closed ancestry authoring vocabulary; no runtime effect claims."""
from pathlib import Path

from class_content import validate_grant_display
import power_content

CONTENT = Path(__file__).resolve().parents[1] / 'content/ancestries'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def keys(value, required, optional=()):
    require(isinstance(value, dict), 'Expected object')
    require(set(required) <= value.keys() <= set(required) | set(optional), 'Missing or unknown fields: ' + str(value.keys()))


def unique(values):
    require(len(values) == len(set(values)), 'Duplicate values')


def validate(documents):
    """Reject malformed entries, dangling grants, invalid choices and cycles."""
    entries = {}
    categories = {}
    base = 'id title description access prerequisites selection coverage'.split()
    optional = {'ancestries': ['attributes', 'grants', 'note'], 'features': ['grants', 'choices', 'grantDisplay'],
                'powers': ['flavor', 'rulesProfile', 'source', 'keywords', 'choices', 'activations']}
    for data in documents:
        keys(data, ['schemaVersion', 'ancestries', 'features', 'powers'])
        require(type(data['schemaVersion']) is int and data['schemaVersion'] == 2, 'Unknown schema version')
        for category in optional:
            require(isinstance(data[category], list), 'Expected entry array')
            for entry in data[category]:
                keys(entry, base, optional[category])
                eid = entry['id']
                singular = {'ancestries': 'ancestry', 'features': 'feature', 'powers': 'power'}[category]
                require(isinstance(eid, str) and eid.startswith('modern4e.' + singular + '.'), 'Invalid ID')
                require(eid not in entries, 'Duplicate ID: ' + eid)
                validate_grant_display(entry, eid)
                entries[eid] = entry
                categories[eid] = category
                require(isinstance(entry['title'], str) and entry['title'].strip(), 'Empty title')
                require(isinstance(entry['description'], str), 'Expected description')
                for field in ['access', 'prerequisites']:
                    require(entry[field] == {'type': 'always'}, 'Unsupported ancestry condition')
                require(entry['selection'] == {'maximum': 1, 'constraints': []}, 'Unsupported selection rule')
                keys(entry['coverage'], ['status', 'limitations'])
                require(entry['coverage']['status'] == 'UNIMPLEMENTED' and bool(entry['coverage']['limitations']), 'Runtime coverage must remain explicit')
                if category == 'ancestries':
                    attrs = entry['attributes']
                    keys(attrs, ['size', 'speed', 'vision', 'languages'])
                    require(attrs['size'] in ['small', 'medium', 'normal'], 'Unknown size')
                    require(type(attrs['speed']) is int and attrs['speed'] > 0, 'Invalid speed')
                    require(attrs['vision'] in ['normal', 'low-light', 'darkvision'], 'Unknown vision')
                    languages = attrs['languages']
                    keys(languages, ['fixed', 'choiceCount'])
                    require(languages['fixed'] and all(isinstance(x, str) and x for x in languages['fixed']), 'Invalid languages')
                    unique(languages['fixed'])
                    require(type(languages['choiceCount']) is int and languages['choiceCount'] >= 0, 'Invalid language choice count')
                if category == 'powers':
                    power_content.validate_power(entry, {})
                    require(entry['rulesProfile'] == 'MODERN4E', 'Expected local ancestry rules')
    edges = {}
    for eid, entry in entries.items():
        edges[eid] = []
        grants = entry.get('grants', [])
        unique([g['id'] for g in grants])
        for grant in grants:
            keys(grant, ['id', 'entryId', 'atLevel'])
            require(grant['atLevel'] == 1 and grant['entryId'] in entries, 'Invalid grant reference')
            edges[eid].append(grant['entryId'])
        choices = entry.get('choices', []) if categories[eid] == 'features' else []
        unique([c['id'] for c in choices])
        for choice in choices:
            keys(choice, ['id', 'count', 'source'])
            source = choice['source']
            require(len(source) == 1, 'Expected one choice source')
            kind = next(iter(source))
            require(kind in ['entryIds', 'damageTypes', 'ancestriesExcept'], 'Unknown choice source')
            values = source[kind]
            require(isinstance(values, list) and bool(values), 'Empty choice source')
            unique(values)
            if kind == 'damageTypes':
                require(set(values) <= set('ACID COLD FIRE LIGHTNING NECROTIC POISON RADIANT'.split()), 'Unknown damage type')
            else:
                require(all(v in entries for v in values), 'Invalid choice reference')
                if kind == 'entryIds':
                    require(all(categories[v] == 'powers' for v in values), 'Expected power choices')
                    edges[eid].extend(values)
                else:
                    require(all(categories[v] == 'ancestries' for v in values), 'Expected ancestry exclusion')
            pool_size = len(values) if kind != 'ancestriesExcept' else sum(c == 'ancestries' for c in categories.values()) - len(values)
            require(type(choice['count']) is int and 0 < choice['count'] <= pool_size, 'Invalid choice count')
    def visit(eid, ancestors):
        require(eid not in ancestors, 'Grant/choice cycle')
        for target in edges[eid]:
            visit(target, ancestors | {eid})
    for eid in entries:
        visit(eid, set())
    return entries


def load():
    """Read only declared files and validate the complete ancestry catalog."""
    catalog = power_content.shared.shared.load_json(CONTENT / 'catalog.json')
    keys(catalog, ['schemaVersion', 'files'])
    require(catalog['schemaVersion'] == 1, 'Unknown catalog version')
    unique(catalog['files'])
    require(all(Path(f).name == f and f.endswith('.json') for f in catalog['files']), 'Invalid catalog path')
    require(set(catalog['files']) == {p.name for p in CONTENT.glob('*.json') if p.name != 'catalog.json'}, 'Unlisted ancestry file')
    return validate([power_content.shared.shared.load_json(CONTENT / f) for f in catalog['files']])


if __name__ == '__main__':
    print(f'Validated {len(load())} ancestry, feature and power entries')
