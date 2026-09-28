"""Render a Claude Code session transcript (.jsonl) as compact text for dogfood reviews.

  python tools/transcript.py <session.jsonl> [--since HH:MM] [--full]

Prints user/assistant text, tool calls (one line each) and tool errors. Skill bodies injected
into the transcript are skipped. --full keeps long messages untruncated.
Transcripts live in ~/.claude/projects/<project-slug>/<session-id>.jsonl.
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # Windows consoles default to cp1252
args = sys.argv[1:]
path = args[0]
since = args[args.index('--since') + 1] if '--since' in args else ''
limit = 100000 if '--full' in args else 1500

for line in open(path, encoding='utf8'):
    try:
        e = json.loads(line)
    except json.JSONDecodeError:
        continue
    if e.get('type') not in ('user', 'assistant'):
        continue
    ts = e.get('timestamp', '')[11:19]
    if since and ts < since:
        continue
    who = e['type'].upper()
    content = e.get('message', {}).get('content')
    blocks = [{'type': 'text', 'text': content}] if isinstance(content, str) else (content or [])
    for b in blocks:
        t = b.get('type')
        if t == 'text' and b['text'].strip():
            if 'Base directory for this skill' in b['text']:
                print(f'\n[{ts}] {who}: <skill loaded>')
                continue
            print(f'\n[{ts}] {who}: {b["text"][:limit]}')
        elif t == 'tool_use':
            inp = b.get('input', {})
            if b['name'] == 'AskUserQuestion':
                for q in inp.get('questions', []):
                    print(f'  -> ASK: {q["question"]} {[o["label"] for o in q.get("options", [])]}')
                continue
            s = inp.get('command') or inp.get('file_path') or inp.get('pattern') or inp.get('description') or json.dumps(inp)[:300]
            print(f'  -> {b["name"]}: {str(s)[:300]}')
        elif t == 'tool_result':
            c = b.get('content')
            s = c if isinstance(c, str) else ' '.join(x.get('text', '') for x in (c or []) if isinstance(x, dict))
            if 'User has answered' in s or 'have been answered' in s:
                print(f'  <- ANSWERS: {s[:1200]}')
            elif b.get('is_error'):
                print(f'  <- ERROR: {s[:400]}')
