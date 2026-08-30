# SwiftDrop API — Hugging Face Spaces (Docker SDK, free CPU tier)
#
# Assembled into a Space repo by deploy/huggingface/sync.sh, which copies this
# file and README.md to the Space root alongside backend/.
FROM python:3.12-slim

# Spaces runs the container as UID 1000, not root. Creating that user at build
# time keeps file ownership and $HOME consistent with the runtime.
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER user
WORKDIR $HOME/app

COPY --chown=user:user backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# main.py imports its siblings absolutely (`from config import settings`), so the
# package contents are flattened into the working directory rather than nested.
COPY --chown=user:user backend/ ./

# Spaces publishes the port declared as `app_port` in README.md.
EXPOSE 7860

# db.bootstrap creates the tables and loads demo data before the pool opens. It
# is idempotent and skips seeding once the demo accounts exist, so a container
# restart never wipes what a visitor created.
CMD ["sh", "-c", "python -m db.bootstrap && uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
