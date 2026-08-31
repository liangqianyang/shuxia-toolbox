#!/usr/bin/env python3
"""把 frontend/cdn-assets/ 下的静态资源上传到七牛云 Kodo（供小程序 CDN 引用）。

用法：python3 frontend/scripts/upload_qiniu.py [--force]
凭证读取 frontend/.qiniu.env（已 gitignore，勿提交）：
  QINIU_AK / QINIU_SK / QINIU_BUCKET / QINIU_PREFIX / QINIU_REGION / QINIU_CDN

- key = QINIU_PREFIX + 相对 cdn-assets 的原路径（与包内路径结构一致，代码里只需换基址）
- 上传前 HEAD CDN：已存在且大小一致则跳过（--force 强制重传覆盖）
- 上传凭证用标准库 HMAC-SHA1 + URL-safe base64 生成，无第三方依赖
- 华东-浙江 z0 的上传接口：https://upload.qiniup.com
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
ASSETS = os.path.join(ROOT, "cdn-assets")
ENV_FILE = os.path.join(ROOT, ".qiniu.env")

UPLOAD_HOSTS = {
    "z0": "https://upload.qiniup.com",       # 华东-浙江
    "z1": "https://upload-z1.qiniup.com",    # 华东-浙江2
    "z2": "https://upload-z2.qiniup.com",    # 华北
    "na0": "https://upload-na0.qiniup.com",  # 北美
    "as0": "https://upload-as0.qiniup.com",  # 东南亚
}


def b64url(data: bytes) -> str:
    # 七牛的 URL-safe base64 保留 padding（去掉 = 会导致 BadToken）
    return base64.urlsafe_b64encode(data).decode()


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    required = ["QINIU_AK", "QINIU_SK", "QINIU_BUCKET", "QINIU_PREFIX", "QINIU_CDN"]
    missing = [k for k in required if not env.get(k)]
    if missing:
        print(f"缺少配置项: {missing}（检查 {ENV_FILE}）")
        sys.exit(1)
    return env


def upload_token(ak: str, sk: str, bucket: str, key: str) -> str:
    policy = {"scope": f"{bucket}:{key}", "deadline": int(time.time()) + 3600, "insertOnly": 0}
    encoded = b64url(json.dumps(policy).encode())
    sign = b64url(hmac.new(sk.encode(), encoded.encode(), hashlib.sha1).digest())
    return f"{ak}:{sign}:{encoded}"


def remote_size(url: str) -> int | None:
    """HEAD 探测远端文件大小；不存在/异常返回 None。"""
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                return None
            return int(resp.headers.get("Content-Length") or 0)
    except Exception:
        return None


def main() -> int:
    force = "--force" in sys.argv
    env = load_env()
    ak, sk = env["QINIU_AK"], env["QINIU_SK"]
    bucket = env["QINIU_BUCKET"]
    prefix = env["QINIU_PREFIX"].strip("/")
    cdn = env["QINIU_CDN"].rstrip("/")
    host = UPLOAD_HOSTS[env.get("QINIU_REGION", "z0")]

    files: list[str] = []
    for dirpath, _dirs, names in os.walk(ASSETS):
        for name in sorted(names):
            if name == ".DS_Store":
                continue
            files.append(os.path.relpath(os.path.join(dirpath, name), ASSETS))
    if not files:
        print(f"{ASSETS} 下没有文件")
        return 1

    uploaded = skipped = failed = 0
    for rel in files:
        key = f"{prefix}/{rel.replace(os.sep, '/')}"
        url = f"{cdn}/{key}"
        local_size = os.path.getsize(os.path.join(ASSETS, rel))
        if not force and remote_size(url) == local_size:
            skipped += 1
            continue
        token = upload_token(ak, sk, bucket, key)
        result = subprocess.run(
            [
                "curl", "-sS", "-X", "POST",
                "-F", f"key={key}",
                "-F", f"token={token}",
                "-F", f"file=@{os.path.join(ASSETS, rel)}",
                host,
            ],
            capture_output=True, text=True,
        )
        ok = result.returncode == 0 and '"key"' in result.stdout
        if ok:
            uploaded += 1
            print(f"  ↑ {key} ({local_size / 1024:.0f}KB)")
        else:
            failed += 1
            print(f"  ✗ {key}: {result.stdout.strip() or result.stderr.strip()}")

    print(f"\n完成：上传 {uploaded}，跳过 {skipped}，失败 {failed}（共 {len(files)} 个文件）")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
