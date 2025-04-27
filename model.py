from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)

# Optional: Configure the database URL (same as in alembic.ini)
#DATABASE_URL = " postgresql+psycopg2://curator:supersecret@localhost:5432/curator"
#engine = create_engine(DATABASE_URL)

# Optional: Create the table in the database (only needed if running this manually)
#if __name__ == "__main__":
#    Base.metadata.create_all(engine)