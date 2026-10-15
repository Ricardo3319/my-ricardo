FROM python:3.12-alpine
WORKDIR /app
COPY . /app
EXPOSE 8000
ENV PORT=8000
CMD ["python3", "server/app.py"]
