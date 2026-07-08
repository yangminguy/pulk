#!/usr/bin/env python3
"""리포트 HTML의 {{B64:<videoId>}} 자리에 해당 run의 썸네일을 base64 data URI로 주입.

Usage: python3 scripts/embed-thumbs.py <report.html> <runDir>
In-place 치환. 썸네일 파일이 없으면 1px 투명 placeholder.
"""
import base64
import re
import sys
from pathlib import Path

PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

def main():
    report = Path(sys.argv[1])
    run_dir = Path(sys.argv[2])
    html = report.read_text(encoding="utf-8")

    def repl(m):
        vid = m.group(1)
        p = run_dir / "thumbs" / f"{vid}.jpg"
        if not p.exists():
            return PLACEHOLDER
        b64 = base64.b64encode(p.read_bytes()).decode()
        return f"data:image/jpeg;base64,{b64}"

    html = re.sub(r"\{\{B64:([\w-]+)\}\}", repl, html)
    report.write_text(html, encoding="utf-8")
    print(f"ok: {report} ({report.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
