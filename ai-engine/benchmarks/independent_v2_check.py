# Directory - ai-engine/benchmarks/independent_v2_check.py
"""Independent check of the Layer 2 v2 benchmark numbers (seeds 301-330).

Re-implements the v2 trend statistic (single 28-day baseline, 14-day EWMA lambda=0.3, spike guard) directly
in numpy, WITHOUT using app/scoring/personalized_anomaly.py. Only Layer 1 tiers come from the engine
(compute_home_news, unchanged in v2). It recomputes sensitivity, specificity, alerts per patient-week, AUROC
and AUPRC for Layer 2 v2 and Hybrid v2 at both alert levels and compares them with
benchmarks/results/v2_benchmark_summary.csv (differences should be < 1e-4, the precision of the CSV).

Usage (from ai-engine):  python benchmarks/independent_v2_check.py        (about 2-3 minutes)
"""
import os, sys, warnings
import numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score
warnings.filterwarnings("ignore")
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),".."))
sys.path.insert(0,ROOT)
from benchmarks.cohort_config import generate_longitudinal_persona
from app.scoring.home_news import compute_home_news

ATTR=["systolic_bp","diastolic_bp","heart_rate","spo2","temperature_c","respiration_rate"]
RANK={"Low":0,"Moderate":1,"High":2,"Critical":3}
LAM=0.3; SD=np.sqrt(LAM/(2-LAM)); LOOKBACK=14

def z_window(vals,t):
    """z of the last 14 days (day t = today) against the single baseline of days t-28..t-1. Returns [14,6]."""
    W=vals[max(0,t-28):t]; cnt=(~np.isnan(W)).sum(0); active=cnt>=7
    mu=np.nanmean(W,0); sd=np.nanstd(W,0,ddof=1)
    Z=np.zeros((LOOKBACK,6))
    for i,d in enumerate(range(t-LOOKBACK+1,t+1)):
        if d<0: continue
        x=vals[d]
        with np.errstate(all="ignore"): z=(x-mu)/sd
        z=np.where(sd>1e-4,z,np.where(np.abs(x-mu)<1e-4,0.0,3.5*np.sign(x-mu)))
        Z[i]=np.where(active&~np.isnan(x),z,0.0)
    return Z

def trend_and_today(Z):
    S=Z[0].copy()
    for k in range(1,LOOKBACK): S=LAM*Z[k]+(1-LAM)*S
    return float(np.max(np.abs(S/SD))), float(np.max(np.abs(Z[-1])))

def main(seeds=range(301,331)):
    rows=[]
    for seed in seeds:
        for pid in range(1,25):
            readings,labels=generate_longitudinal_persona(pid,seed,total_days=75)
            vals=np.array([[np.nan if getattr(r,a) is None else getattr(r,a) for a in ATTR] for r in readings],float)
            for t in range(7,75):
                tr,td=trend_and_today(z_window(vals,t))
                tier=3 if tr>=3.5 else 2 if tr>=2.5 else 1 if tr>=1.8 else 0
                if round(td,2)>=3.5: tier=3
                rows.append((seed,labels[t],RANK[compute_home_news(readings[t]).layer1_tier],tr,tier))
    R=np.array(rows,float); seed,y,l1,tr,tier=[R[:,i] for i in range(5)]
    hyb=np.maximum(l1,tier); out=[]
    for name,tt in (("Layer 2 v2",tier),("Hybrid v2",hyb)):
        for rule,thr in (("Moderate+",1),("High+",2)):
            a=tt>=thr; S=[];P=[];F=[]
            for s in np.unique(seed):
                m=seed==s; yy=y[m]==1; aa=a[m]
                S.append((aa&yy).sum()/yy.sum()); P.append((~aa&~yy).sum()/(~yy).sum()); F.append((aa&~yy).sum()/(~yy).sum()*7)
            out.append((rule,name,np.mean(S),np.mean(P),np.mean(F)))
    au=[roc_auc_score(y[seed==s],tr[seed==s]) for s in np.unique(seed)]
    ap=[average_precision_score(y[seed==s],tr[seed==s]) for s in np.unique(seed)]
    res=pd.DataFrame(out,columns=["Threshold","Arm","sensitivity","specificity","alerts_per_week"])
    print(res.round(4).to_string(index=False)); print(f"Layer 2 v2 AUROC {np.mean(au):.4f}  AUPRC {np.mean(ap):.4f}")
    ref=os.path.join(ROOT,"benchmarks","results","v2_benchmark_summary.csv")
    if os.path.exists(ref):
        s=pd.read_csv(ref); worst=0
        for _,r in res.iterrows():
            q=s[(s.Threshold==r.Threshold)&(s.Arm==r.Arm)].iloc[0]
            worst=max(worst,abs(q.sensitivity_mean-r.sensitivity),abs(q.specificity_mean-r.specificity),abs(q.alerts_per_week_mean-r.alerts_per_week))
        q=s[(s.Arm=="Layer 2 v2")].iloc[0]; worst=max(worst,abs(q.auroc_mean-np.mean(au)),abs(q.auprc_mean-np.mean(ap)))
        print(f"largest absolute difference vs v2_benchmark_summary.csv: {worst:.6f}  ->", "MATCH" if worst<1e-4 else "MISMATCH")
if __name__=="__main__": main()
