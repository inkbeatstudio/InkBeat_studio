import numpy as np
def note_f1(est, ref, tol=0.06, pitch_tol=0):

    used=set(); tp=0
    for s,p in est:
        best=None
        for j,(rs,rp) in enumerate(ref):
            if j in used or abs(rp-p)>pitch_tol: continue
            if abs(rs-s)<=tol and (best is None or abs(rs-s)<abs(ref[best][0]-s)): best=j
        if best is not None: used.add(best); tp+=1
    P=tp/max(1,len(est)); R=tp/max(1,len(ref)); F=2*P*R/max(1e-9,P+R)
    return round(P,3),round(R,3),round(F,3)
