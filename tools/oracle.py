"""Independent OpenSees adapter. No production solver or matrix code imported."""
import json,sys,math
import openseespy.opensees as ops
p=json.load(open(sys.argv[1]))
case=sys.argv[2] if len(sys.argv)>2 else 'LC1'
factors={case:1.0}
for c in p['combinations']:
 if c['id']==case:factors={t['case']:t['factor'] for t in c['terms']}
ops.wipe();ops.model('basic','-ndm',3,'-ndf',6)
nodes={n['id']:i+1 for i,n in enumerate(p['nodes'])}
coords={n['id']:n['position'] for n in p['nodes']}
for n in p['nodes']:ops.node(nodes[n['id']],*n['position'])
for n in p['nodes']:
 fixed=[0]*6
 for s in p['supports']:
  if s['node']==n['id']:
   if any(s['prescribed']):raise ValueError('Oracle adapter scope excludes prescribed motion')
   fixed=list(map(int,s['fixed']))
 if p['analysisMode']=='planarXZ':
  for d in [1,3,5]:fixed[d]=1
 ops.fix(nodes[n['id']],*fixed)
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
bases={};tags={}
for i,m in enumerate(p['members']):
 tag=i+1;tags[m['id']]=tag
 mat=next(v for v in p['materials'] if v['id']==m['material']);sec=next(v for v in p['sections'] if v['id']==m['section'])
 x=[b-a for a,b in zip(coords[m['start']],coords[m['end']])];length=math.sqrt(dot(x,x));x=[v/length for v in x]
 z=cross(x,m['localY']);z=[v/math.sqrt(dot(z,z)) for v in z];y=cross(z,x);bases[m['id']]=[x,y,z]
 ops.geomTransf('Linear',tag,*z)
 ops.element('elasticBeamColumn',tag,nodes[m['start']],nodes[m['end']],sec['A'],mat['E'],mat['E']/(2*(1+mat['nu'])),sec['J'],sec['Iy'],sec['Iz'],tag)
ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
for load in p['loads']:
 factor=factors.get(load['case'],0)
 if load['type']=='nodal':ops.load(nodes[load['node']],*[v*factor for v in load['values']])
 elif load['type']=='uniform':
  q=load['forcePerLength']
  if load['axes']=='global':q=[dot(axis,q) for axis in bases[load['member']]]
  ops.eleLoad('-ele',tags[load['member']],'-type','-beamUniform',q[1]*factor,q[2]*factor,q[0]*factor)
 elif load['type']=='selfWeight':
  for mid in load['members']:
   m=next(m for m in p['members'] if m['id']==mid);mat=next(v for v in p['materials'] if v['id']==m['material']);sec=next(v for v in p['sections'] if v['id']==m['section']);q=[g*mat['density']*sec['A']*load['factor'] for g in p['gravity']];q=[dot(axis,q) for axis in bases[mid]];ops.eleLoad('-ele',tags[mid],'-type','-beamUniform',q[1]*factor,q[2]*factor,q[0]*factor)
 else:raise ValueError('Unsupported oracle load type')
ops.constraints('Plain');ops.numberer('RCM');ops.system('BandSPD');ops.test('NormDispIncr',1e-12,10);ops.algorithm('Linear');ops.integrator('LoadControl',1);ops.analysis('Static')
if ops.analyze(1)!=0:raise RuntimeError('OpenSees solve failed')
ops.reactions()
print(json.dumps({'solver':'OpenSees','version':ops.version(),'nodes':{id:ops.nodeDisp(tag) for id,tag in nodes.items()},'reactions':{s['id']:ops.nodeReaction(nodes[s['node']]) for s in p['supports']},'endActions':{id:ops.eleResponse(tag,'localForce') for id,tag in tags.items()}}))
