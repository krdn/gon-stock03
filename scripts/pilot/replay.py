"""Replay the two pinned historical builds. Only the controller owns the state directory."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
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

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", choices=REVISIONS)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--deps", required=True, type=Path, help="Directory with npm ci dependencies and the pinned lockfile")
    parser.add_argument("--browsers", required=True, type=Path, help="Directory containing chromium_headless_shell-1255")
    args = parser.parse_args()
    sha = REVISIONS[args.version]
    if digest((args.deps / "package-lock.json").read_bytes()) != LOCK_SHA:
        parser.error("Dependency lock differs from the replay lock")
    probes = {name: digest((CHECKS / name).read_bytes()) for name in ("replay.mjs", "replay-entry.sh", "replay.py")}
    contract = {"issue": 129, "sha": sha, "workerVersion": "historical-replay-v1", "trial": 1,
                "case": "watchlist-503+controls", "checks": probes, "lock": LOCK_SHA}
    key = digest(json.dumps(contract, sort_keys=True).encode())
    args.state.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(args.state / "replay.sqlite", timeout=15)
    db.execute("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, result TEXT)")
    claim = db.execute("INSERT OR IGNORE INTO runs VALUES (?, 'running', NULL)", (key,))
    db.commit()
    if not claim.rowcount:
        status, previous = db.execute("SELECT status,result FROM runs WHERE id=?", (key,)).fetchone()
        print(json.dumps({"key": key, "reused": True, "status": status, "result": json.loads(previous) if previous else None},ensure_ascii=False))
        return 75 if status == "running" else (0 if status == "verified" else 1)
    start = time.monotonic()
    result = {"key": key, "contract": contract}
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
            cmd = ["timeout", "-k", "3", "120", "bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
                   "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
                   "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev",
                   "--tmpfs", "/dev/shm", "--tmpfs", "/tmp", "--tmpfs", "/app", "--dir", "/emptyhome",
                   "--ro-bind", "/etc/fonts", "/etc/fonts", "--ro-bind", "/etc/ld.so.cache", "/etc/ld.so.cache",
                   "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/emptyhome", "--setenv", "LANG", "C.UTF-8",
                   "--setenv", "TZ", "UTC", "--setenv", "PLAYWRIGHT_BROWSERS_PATH", "/browsers",
                   "--ro-bind", str(args.browsers.resolve() / "chromium_headless_shell-1255"), "/browsers/chromium_headless_shell-1255",
                   "--ro-bind", str(args.deps.resolve() / "node_modules"), "/node_modules",
                   "--ro-bind", str(args.deps.resolve() / "node_modules"), "/app/node_modules",
                   "--ro-bind", str(CHECKS / "replay.mjs"), "/probe/replay.mjs",
                   "--ro-bind", str(CHECKS / "replay-entry.sh"), "/probe/replay-entry.sh",
                   "--ro-bind", str(source), "/input", "--chdir", "/app", "--", "bash", "/probe/replay-entry.sh"]
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=130)
            result.update(exit=proc.returncode, stdoutSha=digest(proc.stdout), stderrSha=digest(proc.stderr))
            if proc.returncode not in (0, 1) or not proc.stdout.strip():
                raise RuntimeError(f"replay process exit {proc.returncode}")
            observations = json.loads(proc.stdout.decode().strip())["replay"]
            primary, saved, journal = observations
            actual = primary["observed"]
            valid = (actual["previewRows"] > 0 and actual["quoteRequests"] > 0 and actual["confirmedEmpty"]
                     and not primary["pass"] and proc.returncode == 1) if args.version == "before" else (
                     primary["pass"] and proc.returncode == 0)
            status = "verified" if valid and saved["pass"] and journal["pass"] else "unexpected-behavior"
            result["observations"] = observations
    except Exception as error:
        result["error"] = str(error)
    result["elapsedSeconds"] = round(time.monotonic() - start, 3)
    db.execute("UPDATE runs SET status=?,result=? WHERE id=?", (status, json.dumps(result), key))
    db.commit()
    print(json.dumps({"key": key, "reused": False, "status": status, "result": result}, ensure_ascii=False))
    return 0 if status == "verified" else 1

if __name__ == "__main__":
    sys.exit(main())
