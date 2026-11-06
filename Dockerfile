FROM python:3.12-alpine
WORKDIR /app
COPY . /app
EXPOSE 8000
ENV PORT=8000
ENV RICARDO_DATA_DIR=/data
CMD ["python3", "server/app.py"]
