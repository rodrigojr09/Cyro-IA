"""Read-only Git audit. Reports paths/object IDs, never candidate secret values."""
from pathlib import Path
import json
import re
import subprocess
import sys

RULES = {
    "openai-token": re.compile(rb"sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}"),
    "github-token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"),
    "private-key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "database-credential": re.compile(rb"postgres(?:ql)?://[^\s\"'<>:]+:[^\s\"'<>@]+@[^\s\"'<>]+"),
    "assigned-server-secret": re.compile(rb"(?:AUTH_SECRET|SPOTIFY_CLIENT_SECRET|SERVICE_AUTH_SECRET|SERVICE_CONTEXT_SECRET|SIGNED_URL_SECRET)\s*[=:]\s*[\"']?([A-Za-z0-9_-]{24,})"),
}
MARKERS = (b"fixture", b"synthetic", b"test-", b"test_", b"-test", b"dummy", b"ephemeral", b"replace", b"example", b"not-configured", b"localhost", b"127.0.0.1", b"${", b"host_interno_real", b"@host/cyro_files")

def private_path(path):
    name=Path(path).name.lower()
    if name in (".env.example", ".env.production.example"):return False
    return name==".env" or name.startswith(".env.") or bool(re.search(r"\.(sqlite3?|db|pfx|p12|key)$",name))

def candidates(data):
    found=set()
    for name,pattern in RULES.items():
        for match in pattern.finditer(data):
            value=match.group(0).lower()
            if any(marker in value for marker in MARKERS):continue
            if name=="assigned-server-secret" and len(set(match.group(1)))<=2:continue
            found.add(name)
    return found

def scan(repo):
    repo=Path(repo).resolve();findings=[]
    tracked=subprocess.check_output(["git","ls-files","-z"],cwd=repo).decode().split("\0")
    for name in filter(None,tracked):
        if private_path(name):findings.append({"scope":"tracked-path","path":name,"rule":"private-file"})
        path=repo/name
        if path.is_file():
            # Working tree changes are scanned before committing, not only HEAD.
            with path.open("rb") as stream:
                tail=b""
                while chunk:=stream.read(1024*1024):
                    for rule in candidates(tail+chunk):
                        item={"scope":"working-tree","path":name,"rule":rule}
                        if item not in findings:findings.append(item)
                    tail=chunk[-4096:]
    objects={}
    for line in subprocess.check_output(["git","rev-list","--objects","--all"],cwd=repo,text=True).splitlines():
        oid,_,name=line.partition(" ");objects[oid]=name
    process=subprocess.Popen(["git","cat-file","--batch"],cwd=repo,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    try:
        for oid,name in objects.items():
            process.stdin.write((oid+"\n").encode());process.stdin.flush()
            header=process.stdout.readline().decode().split()
            if len(header)!=3:continue
            kind,size=header[1],int(header[2]);remaining=size;tail=b"";rules=set()
            while remaining:
                chunk=process.stdout.read(min(remaining,1024*1024));remaining-=len(chunk)
                if not chunk:raise ValueError("Git object read failed")
                if kind in ("blob","commit"):rules.update(candidates(tail+chunk));tail=chunk[-4096:]
            process.stdout.read(1)
            if kind=="blob" and name and private_path(name):rules.add("private-file-history")
            for rule in rules:findings.append({"scope":"history","object":oid,"path":name or "commit metadata","rule":rule})
    finally:
        process.stdin.close();process.stdout.close();process.wait()
    return {"repository":repo.name,"trackedFiles":len(list(filter(None,tracked))),"historyObjects":len(objects),"findings":findings}

def main():
    root=Path(__file__).resolve().parents[3]
    names=sys.argv[1:] or ["cyro-desktop","cyro-backend","cyro-cloud","cyro-files"]
    reports=[scan(root/name) for name in names]
    directory=root/".cyro";directory.mkdir(exist_ok=True)
    (directory/"security-audit.json").write_text(json.dumps(reports,indent=2)+"\n",encoding="utf-8")
    for report in reports:
        print(f"{report['repository']}: {report['trackedFiles']} tracked files, {report['historyObjects']} history objects, {len(report['findings'])} candidates for review")
        for item in report["findings"][:15]:print(f"  {item['scope']}: {item['path']} ({item['rule']})")
    print("Candidate values were not printed. Full path/object report: .cyro/security-audit.json")

if __name__=="__main__":main()
