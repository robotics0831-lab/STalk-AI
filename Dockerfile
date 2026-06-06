FROM python:3.13-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

ENV STALK_HOSTED=true
ENV STALK_PROVIDER=groq
ENV STALK_MODEL=llama-3.3-70b-versatile
ENV PORT=8000

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
