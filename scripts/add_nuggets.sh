#!/bin/bash
# Weekly cron: generate 20 new nuggets and append to public/nuggets.json
NUGGETS_FILE="/home/kyle/projects/apps/Shiftway/public/nuggets.json"

NEW=$(oracle --engine claude -p "Generate exactly 20 brand new fun facts or witty observations — mix of animal facts, history, science, food, space, and workplace humor. Each should be one sentence, start with a relevant emoji, and end with a short punchy observation. Return ONLY a valid JSON array of 20 strings, nothing else.")

python3 - << PYEOF
import json, sys

with open("$NUGGETS_FILE") as f:
    existing = json.load(f)

try:
    new_items = json.loads('''$NEW''')
    if isinstance(new_items, list):
        combined = existing + new_items
        with open("$NUGGETS_FILE", "w") as f:
            json.dump(combined, f, indent=2, ensure_ascii=False)
        print(f"Added {len(new_items)} nuggets. Total: {len(combined)}")
    else:
        print("Error: not a list")
except Exception as e:
    print(f"Parse error: {e}")
PYEOF

cd /home/kyle/projects/apps/Shiftway && git add public/nuggets.json && git commit -m "chore: weekly nugget batch added" || true
