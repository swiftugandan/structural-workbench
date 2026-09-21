#!/usr/bin/env python3
"""Validate the specification package, not an application implementation."""
from pathlib import Path
import ast, json, math, operator, re
# Portable validator for the exact JSON Schema keyword subset used in this package.
# It is not a general JSON Schema implementation; implementation CI should also use
# a pinned Draft 2020-12 validator.
class SchemaIssue:
    def __init__(self,message): self.message=message
class PackageSchemaValidator:
    def __init__(self,schema): self.schema=schema
    @staticmethod
    def check_schema(schema):
        def visit(s):
            if not isinstance(s,dict): raise ValueError('Schema node must be an object')
            if 'required' in s and not set(s['required']).issubset(s.get('properties',{})):
                raise ValueError('Required key lacks property schema')
            for c in s.get('properties',{}).values(): visit(c)
            for c in s.get('$defs',{}).values(): visit(c)
            for c in s.get('oneOf',[]): visit(c)
            if 'items' in s: visit(s['items'])
        visit(schema)
    def iter_errors(self,value):
        def check(s,v,path):
            if '$ref' in s:
                sub=self.schema
                for part in s['$ref'][2:].split('/'):sub=sub[part]
                return check(sub,v,path)
            errors=[]
            def err(msg):errors.append(SchemaIssue(path+': '+msg))
            if 'oneOf' in s:
                if sum(not check(c,v,path) for c in s['oneOf'])!=1:err('Expected exactly one variant')
                return errors
            types=s.get('type',[]);types=[types] if isinstance(types,str) else types
            matches={'null':v is None,'boolean':isinstance(v,bool),'number':isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v),'integer':isinstance(v,int) and not isinstance(v,bool),'string':isinstance(v,str),'array':isinstance(v,list),'object':isinstance(v,dict)}
            if types and not any(matches.get(t,False) for t in types):err('Wrong type');return errors
            if 'const' in s and v!=s['const']:err('Wrong constant')
            if 'enum' in s and v not in s['enum']:err('Not in enum')
            if isinstance(v,(int,float)) and not isinstance(v,bool):
                for k,good in [('minimum',lambda a,b:a>=b),('maximum',lambda a,b:a<=b),('exclusiveMinimum',lambda a,b:a>b),('exclusiveMaximum',lambda a,b:a<b)]:
                    if k in s and not good(v,s[k]):err(k)
            if isinstance(v,str):
                if 'maxLength' in s and len(v)>s['maxLength']:err('String too long')
                if 'pattern' in s and re.search(s['pattern'],v) is None:err('Pattern mismatch')
            if isinstance(v,list):
                if len(v)<s.get('minItems',0):err('Too few items')
                if len(v)>s.get('maxItems',float('inf')):err('Too many items')
                for i,x in enumerate(v):errors+=check(s.get('items',{}),x,path+'/'+str(i))
            if isinstance(v,dict):
                props=s.get('properties',{})
                for k in s.get('required',[]):
                    if k not in v:err('Missing '+k)
                if s.get('additionalProperties') is False:
                    for k in set(v)-set(props):err('Unexpected '+k)
                for k,x in v.items():
                    if k in props:errors+=check(props[k],x,path+'/'+k)
            return errors
        return check(self.schema,value,'$')
ROOT=Path(__file__).resolve().parents[1]
failures=[]; counts={'schemas':0,'models':0,'analytical_assertions':0,'milestones':0,'local_references':0}
def require(condition,message):
    if not condition:failures.append(message)
def read(path):return json.loads((ROOT/path).read_text())
OPS={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Pow:operator.pow}
def arithmetic(expr,values):
    def walk(n):
        if isinstance(n,ast.Expression):return walk(n.body)
        if isinstance(n,ast.Constant) and isinstance(n.value,(int,float)):return n.value
        if isinstance(n,ast.Name):return values[n.id]
        if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.USub):return -walk(n.operand)
        if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.UAdd):return walk(n.operand)
        if isinstance(n,ast.BinOp) and type(n.op) in OPS:return OPS[type(n.op)](walk(n.left),walk(n.right))
        raise ValueError('Disallowed formula node')
    return walk(ast.parse(expr,mode='eval'))
for path in (ROOT/'contracts').glob('*.schema.json'):
    PackageSchemaValidator.check_schema(json.loads(path.read_text()));counts['schemas']+=1
validator=PackageSchemaValidator(read('contracts/project.schema.json'))
for path in sorted((ROOT/'fixtures/models').glob('*.json')):
    m=json.loads(path.read_text());errs=list(validator.iter_errors(m));require(not errs,f'{path.name}: schema errors {[e.message for e in errs]}')
    counts['models']+=1
    entities={kind:{x['id']:x for x in m[kind]} for kind in ['materials','sections','nodes','members','supports','loadCases','combinations']}
    for kind,items in entities.items():require(len(items)==len(m[kind]),f'{path.name}: duplicate {kind}')
    for mem in m['members']:
        for field,kind in [('start','nodes'),('end','nodes'),('material','materials'),('section','sections')]:require(mem[field] in entities[kind],f'{path.name}: unresolved {field}')
        a=entities['nodes'][mem['start']]['position'];b=entities['nodes'][mem['end']]['position'];d=[b[i]-a[i] for i in range(3)];length=math.sqrt(sum(v*v for v in d));require(length>=1e-6,f'{path.name}: zero length')
        v=mem['localY'];cross=[d[1]*v[2]-d[2]*v[1],d[2]*v[0]-d[0]*v[2],d[0]*v[1]-d[1]*v[0]];require(sum(x*x for x in cross)>1e-16*sum(x*x for x in v)*length**2,f'{path.name}: invalid local axis')
    for s in m['supports']:
        require(s['node'] in entities['nodes'],f'{path.name}: support reference')
        require(all(f or p==0 for f,p in zip(s['fixed'],s['prescribed'])),f'{path.name}: prescribed free DOF')
    for load in m['loads']:
        require(load['case'] in entities['loadCases'],f'{path.name}: case reference')
        if 'node' in load:require(load['node'] in entities['nodes'],f'{path.name}: load node reference')
        if 'member' in load:require(load['member'] in entities['members'],f'{path.name}: member load reference')
        for mid in load.get('members',[]):require(mid in entities['members'],f'{path.name}: self weight reference')
    for c in m['combinations']:
        ids=[t['case'] for t in c['terms']];require(len(set(ids))==len(ids),f'{path.name}: duplicate case term')
        require(all(x in entities['loadCases'] for x in ids),f'{path.name}: combination case reference')
bench=read('fixtures/benchmarks.json')['benchmarks'];bids={b['id'] for b in bench};require(len(bids)==len(bench),'Duplicate benchmark IDs')
for b in bench:
    if 'model' in b:require((ROOT/'fixtures'/b['model']).is_file(),f"Missing model {b['model']}")
    for c in b['checks']:
        expected=arithmetic(c['formula'],b['variables']);require(math.isclose(expected,c['expected'],rel_tol=1e-12,abs_tol=1e-12),f"{b['id']} {c['selector']}: formula {expected} != {c['expected']}");counts['analytical_assertions']+=1
milestones=read('roadmap.json')['milestones'];ids={m['id'] for m in milestones};require(len(ids)==len(milestones),'Duplicate milestones')
byid={m['id']:m for m in milestones};visited=set();visiting=set()
def visit(mid):
    if mid in visited:return
    if mid in visiting:failures.append('Roadmap dependency cycle at '+mid);return
    visiting.add(mid)
    for dep in byid[mid]['dependsOn']:
        require(dep in ids,f'{mid}: unknown dependency {dep}')
        if dep in ids:visit(dep)
    visiting.remove(mid);visited.add(mid)
for m in milestones:
    visit(m['id']);counts['milestones']+=1
    require(set(m['seedBenchmarks']).issubset(bids),f"{m['id']}: unknown benchmark")
    require(f"### {m['id']} " in (ROOT/'SPECIFICATION.md').read_text(),f"{m['id']}: missing detailed definition")
    for r in m['resourceGates']:require(r in (ROOT/'SOURCES.md').read_text(),f"{m['id']}: missing resource {r}")
# Check local links, where present; headings are validated separately above.
for path in ROOT.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)',path.read_text()):
        if '://' not in target and not target.startswith('#'):
            require((path.parent/target.split('#')[0]).exists(),f'{path.name}: broken local link {target}');counts['local_references']+=1
result={'status':'PASS' if not failures else 'FAIL','scope':'Specification integrity, generated-schema keyword subset, and analytical arithmetic only; no application solver executed','counts':counts,'failures':failures}
print(json.dumps(result,indent=2))
(ROOT/'PACKAGE_VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n')
raise SystemExit(0 if not failures else 1)
