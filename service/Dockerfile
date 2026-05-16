FROM python:3.13-slim
WORKDIR /app

# Default environment — override via env_file or -e flags at runtime
ENV GEMINI_MODEL=gemini-2.0-flash \
    GOOGLE_GENAI_USE_VERTEXAI=FALSE \
    PORT=8000

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
