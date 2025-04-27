from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from model import Base, User  # Import Base and User model
from sqlalchemy.orm import sessionmaker

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "postgresql+psycopg2://curator:supersecret@localhost:5432/curator"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

CORS(app)
db = SQLAlchemy(app)


with app.app_context():   
    Base.metadata.bind = db.engine
    Session = sessionmaker(bind=db.engine)

@app.route('/')
def hello():
    with Session() as session:
        count = session.query(User).count()
    return f'Total number of users: {count}'


