# Display projection of the persisted first-storey flight/landing envelopes.
import json,pathlib,html
root=pathlib.Path(__file__).parent
p=json.loads((root/'UKR01-generated.json').read_text());nodes={n['id']:n['position'] for n in p['nodes']};secs={s['id']:s for s in p['sections']}
def xy(x,y):return (140+x*110,800-y*110)
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="840" height="940" viewBox="0 0 840 940"><rect width="840" height="940" fill="#f6f8fb"/><style>text{font-family:Arial,sans-serif;fill:#233950} .small{font-size:15px} .label{font-size:19px;font-weight:bold}</style><text x="60" y="55" font-size="28" font-weight="bold">Corrected return stair</text><text x="60" y="86" class="small">Plan of the actual reference model · floor and half-storey levels</text>']
for m in p['members']:
 a,b=nodes[m['start']],nodes[m['end']];kind=m['section']
 if not ((kind=='flight' and a[2] in [0,1.5]) or (kind=='landing' and a[2] in [1.5,3])):continue
 half=secs[kind]['cy'];x0,y0=xy(a[0]-half,max(a[1],b[1]));w=half*2*110;h=abs(b[1]-a[1])*110
 parts.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="{"#d4e8f4" if kind=="landing" else "#e0e4e8"}" stroke="#586f82" stroke-width="2"/>')
 if kind=='flight':
  for i in range(1,9):
   x,y=xy(a[0]-half,a[1]+(b[1]-a[1])*i/9);parts.append(f'<path d="M{x},{y}h{w}" stroke="#8798a5"/>')
  x1,y1=xy(a[0],a[1]+(b[1]-a[1])*.18);x2,y2=xy(a[0],a[1]+(b[1]-a[1])*.82);sign=1 if y2>y1 else -1
  parts.append(f'<path d="M{x1},{y1}V{y2}m-9,{-sign*14}l9,{sign*14}l9,{-sign*14}" fill="none" stroke="#215f9b" stroke-width="4"/>')
parts+=['<text x="360" y="264" text-anchor="middle" class="label">Turning landing</text><text x="360" y="291" text-anchor="middle" class="small">4.0 × 1.5 m · half-storey</text><text x="360" y="713" text-anchor="middle" class="label">Shared floor landing</text><text x="360" y="740" text-anchor="middle" class="small">4.0 × 1.5 m · arrival and departure</text><text x="250" y="674" text-anchor="middle" class="small">First flight ↑</text><text x="470" y="674" text-anchor="middle" class="small">Return flight ↓</text><text x="616" y="459" class="label">UP</text><text x="616" y="486" class="small">Each flight:</text><text x="616" y="513" class="small">1.2 m wide</text><text x="616" y="540" class="small">1.5 m rise</text><text x="616" y="567" class="small">2.4 m run</text><path d="M575,758h70" stroke="#215f9b" stroke-width="3"/><text x="654" y="765" class="small">To floor</text><text x="60" y="865" class="small">Nominal structural layout. Finished levels, beam offsets, headroom,</text><text x="60" y="890" class="small">guarding and construction detailing remain unverified.</text></svg>']
(root/'stair-plan.svg').write_text(''.join(parts))
