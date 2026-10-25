from pathlib import Path
import struct
b=Path(r'C:\Users\Imre\.t3\userdata\attachments\c49e08d2-359a-4891-be2d-d9dbd1ea4167-e8089099-f156-47d1-8649-5636b3d44c55-doc.doc').read_bytes()
u=lambda d,o:struct.unpack_from('<I',d,o)[0]
ss=1<<struct.unpack_from('<H',b,30)[0]
sec=lambda n:b[(n+1)*ss:(n+2)*ss]
fat=[]
for n in struct.unpack_from('<109I',b,76):
 if n<0xfffffffa: fat.extend(struct.unpack('<%dI'%(ss//4),sec(n)))
def chain(n):
 out=b''
 while n<0xfffffffa:
  out+=sec(n);n=fat[n]
 return out
entries={}
d=chain(u(b,48))
for o in range(0,len(d),128):
 z=d[o:o+128]; ln=struct.unpack_from('<H',z,64)[0]
 if ln: entries[z[:ln-2].decode('utf-16le')]=(u(z,116),u(z,120))
print(entries)
w=chain(entries['WordDocument'][0]);t=chain(entries['1Table' if w[11]&2 else '0Table'][0])
clx=t[u(w,418):u(w,418)+u(w,422)]
i=0
while clx[i]==1:i+=3+struct.unpack_from('<H',clx,i+1)[0]
assert clx[i]==2
p=clx[i+5:i+5+u(clx,i+1)];n=(len(p)-4)//12;out=''
for j in range(n):
 count=u(p,4*j+4)-u(p,4*j);fc=u(p,4*(n+1)+8*j+2); compressed=bool(fc&0x40000000);fc &=0x3fffffff
 if compressed:fc//=2
 out+=w[fc:fc+count*(1 if compressed else 2)].decode('cp1252' if compressed else 'utf-16le',errors='replace')
Path('tmp/barbarian-source.txt').write_text(out.replace('\r','\n').replace('\x07','\n'),encoding='utf-8')
print(out[:1500].encode('ascii',errors='replace').decode())
