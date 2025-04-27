docker run --name postgres-container -e POSTGRES_PASSWORD={smth} -p 5432:5432 -d postgres

docker run --name postgres-container -e POSTGRES_DB=curator -e POSTGRES_USER=curator -e POSTGRES_PASSWORD=xxx -p 5432:5432 -d postgres

alembic init alembic
alembic revision --autogenerate -m "Create users table"
alembic upgrade head

python app.py # Running on http://127.0.0.1:5000
