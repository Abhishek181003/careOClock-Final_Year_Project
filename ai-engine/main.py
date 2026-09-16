# Directory - ai-engine/main.py

"""Root entrypoint script for CareOClock AI Engine."""

import os
import sys
from pathlib import Path
import uvicorn

# Ensure the ai-engine directory is in sys.path
root_dir = str(Path(__file__).resolve().parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting CareOClock AI Engine on http://{host}:{port} ...")
    uvicorn.run("app.main:app", host=host, port=port, reload=True)
