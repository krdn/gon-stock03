"""Replay the two pinned historical builds. Only the controller owns the state directory."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time

REVISIONS = {
    "before": "71a7a5442d5c07a99c1c806bbd2f8085d8c5c309",
    "after": "7bcea9d29563e37e27370a6b8c4ee8dce86734e3",
}
LOCK_SHA = "2ab79fca82e617663a2f575b17227821ef0750c93b29606d70215a085935e9d5"
INPUTS = ["src", "server", "shared", "index.html", "public", "package.json",
          "package-lock.json", "vite.config.ts", "scripts/e2e-server.ts", "tsconfig.json"]
CHECKS = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def file_digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()

def tree_digest(root):
    if not root.is_dir():
        raise ValueError(f"Missing runtime directory: {root.name}")
    tree = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        relative = str(path.relative_to(root))
        if path.is_symlink():
            if not path.resolve().is_relative_to(root):
                raise ValueError(f"Runtime symlink leaves {root.name}: {relative}")
            record = [relative, "link", os.readlink(path)]
        elif path.is_file():
            record = [relative, path.stat().st_mode & 0o777, file_digest(path)]
        else:
            continue
        tree.update(json.dumps(record).encode() + b"\n")
    return tree.hexdigest()

def claim(db, key, reason):
    db.execute("BEGIN IMMEDIATE")
    last = db.execute("SELECT attempt,status,owner,result,elapsed FROM replay_attempts "
                      "WHERE id=? ORDER BY attempt DESC LIMIT 1", (key,)).fetchone()
    if last:
        attempt, status, owner, previous, elapsed = last
        # A controller PID alone cannot prove that a child evaluator stopped.
        if not (reason and status == "infrastructure-error" and attempt == 1 and elapsed < 120):
            db.commit()
            return None, {"key": key, "attempt": attempt, "reused": True, "status": status,
                          "owner": json.loads(owner), "result": json.loads(previous) if previous else None}
    elif reason:
        raise ValueError("No prior infrastructure error for this execution key")
    attempt = last[0] + 1 if last else 1
    owner = {"host": socket.gethostname(), "pid": os.getpid(), "startedUnix": time.time()}
    db.execute("INSERT INTO replay_attempts (id,attempt,status,owner,retry_reason) VALUES (?,?,'running',?,?)",
               (key, attempt, json.dumps(owner), reason))
    db.commit()
    return (attempt, 120 - (last[4] if last else 0)), None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", choices=REVISIONS)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--deps", required=True, type=Path, help="Directory with npm ci dependencies and the pinned lockfile")
    parser.add_argument("--browsers", required=True, type=Path, help="Directory containing chromium_headless_shell-1255")
    parser.add_argument("--retry-reason", help="Diagnosed cause for one retry of a finished infrastructure error")
    args = parser.parse_args()
    if args.retry_reason is not None and not args.retry_reason.strip():
        parser.error("Provide a non-empty retry reason")
    sha = REVISIONS[args.version]
    if digest((args.deps / "package-lock.json").read_bytes()) != LOCK_SHA:
        parser.error("Dependency lock differs from the replay lock")
    probes = {name: digest((CHECKS / name).read_bytes()) for name in ("replay.mjs", "replay-entry.sh", "replay.py")}
    deps = args.deps.resolve() / "node_modules"
    chromium = args.browsers.resolve() / "chromium_headless_shell-1255"
    node_version = subprocess.check_output(["/usr/bin/node", "--version"], text=True).strip()
    if not node_version.startswith("v24."):
        parser.error("The pilot requires Node 24")
    runtime = {"node": node_version, "nodeSha256": file_digest(Path("/usr/bin/node")),
               "nodeModulesSha256": tree_digest(deps), "browserTreeSha256": tree_digest(chromium)}
    contract = {"issue": 129, "sha": sha, "workerVersion": "historical-replay-v1", "trial": 1,
                "case": "watchlist-503+controls", "checks": probes, "lock": LOCK_SHA, "runtime": runtime}
    key = digest(json.dumps(contract, sort_keys=True).encode())
    args.state.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(args.state / "replay.sqlite", timeout=15)
    db.execute("CREATE TABLE IF NOT EXISTS replay_attempts (id TEXT NOT NULL, attempt INTEGER NOT NULL, "
               "status TEXT NOT NULL, owner TEXT NOT NULL, retry_reason TEXT, result TEXT, elapsed REAL, "
               "PRIMARY KEY(id, attempt))")
    allocation, cached = claim(db, key, args.retry_reason)
    if cached is not None:
        print(json.dumps(cached, ensure_ascii=False))
        return 75 if cached["status"] == "running" else (0 if cached["status"] == "verified" else 1)
    attempt, remaining = allocation
    start = time.monotonic()
    result = {"key": key, "attempt": attempt, "contract": contract}
    status = "infrastructure-error"
    try:
        with tempfile.TemporaryDirectory() as scratch:
            source = Path(scratch) / "source"
            source.mkdir()
            archive = subprocess.check_output(["git", "archive", sha, *INPUTS])
            with tarfile.open(fileobj=io.BytesIO(archive)) as tree:
                tree.extractall(source, filter="data")
            if digest((source / "package-lock.json").read_bytes()) != LOCK_SHA:
                raise ValueError("source lock differs")
            cmd = ["timeout", "-k", "3", str(remaining), "bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
                   "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
                   "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev",
                   "--tmpfs", "/dev/shm", "--tmpfs", "/tmp", "--tmpfs", "/app", "--dir", "/emptyhome",
                   "--ro-bind", "/etc/fonts", "/etc/fonts", "--ro-bind", "/etc/ld.so.cache", "/etc/ld.so.cache",
                   "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/emptyhome", "--setenv", "LANG", "C.UTF-8",
                   "--setenv", "TZ", "UTC", "--setenv", "PLAYWRIGHT_BROWSERS_PATH", "/browsers",
                   "--ro-bind", str(chromium), "/browsers/chromium_headless_shell-1255",
                   "--ro-bind", str(deps), "/node_modules",
                   "--ro-bind", str(deps), "/app/node_modules",
                   "--ro-bind", str(CHECKS / "replay.mjs"), "/probe/replay.mjs",
                   "--ro-bind", str(CHECKS / "replay-entry.sh"), "/probe/replay-entry.sh",
                   "--ro-bind", str(source), "/input", "--chdir", "/app", "--", "bash", "/probe/replay-entry.sh"]
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=remaining + 10)
            result.update(exit=proc.returncode, stdoutSha=digest(proc.stdout), stderrSha=digest(proc.stderr))
            if proc.returncode not in (0, 1) or not proc.stdout.strip():
                detail = proc.stderr.decode(errors="replace")[-800:]
                raise RuntimeError(f"replay process exit {proc.returncode}: {detail}")
            payload = json.loads(proc.stdout.decode().strip())
            result.update(runtime=payload["runtime"], boundary=payload["boundary"])
            if result["runtime"]["node"] != node_version:
                raise ValueError("Evaluator Node version changed")
            observations = payload["replay"]
            primary, saved, journal = observations
            actual = primary["observed"]
            valid = (actual.get("previewRows", 0) > 0 and actual.get("quoteRequests", 0) > 0 and actual.get("confirmedEmpty") is True
                     and not primary["pass"] and proc.returncode == 1) if args.version == "before" else (
                     primary["pass"] and proc.returncode == 0)
            status = "verified" if valid and saved["pass"] and journal["pass"] else "unexpected-behavior"
            result["observations"] = observations
    except Exception as error:
        result["error"] = str(error)
    result["elapsedSeconds"] = round(time.monotonic() - start, 3)
    db.execute("UPDATE replay_attempts SET status=?, result=?, elapsed=? WHERE id=? AND attempt=?",
               (status, json.dumps(result), time.monotonic() - start, key, attempt))
    db.commit()
    print(json.dumps({"key": key, "reused": False, "status": status, "result": result}, ensure_ascii=False))
    return 0 if status == "verified" else 1

if __name__ == "__main__":
    sys.exit(main())
