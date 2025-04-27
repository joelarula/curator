from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from model import Base, User  
from sqlalchemy.orm import sessionmaker
from ariadne import load_schema_from_path, make_executable_schema, graphql_sync, ObjectType

from resolvers import query
from flask import request, jsonify
from database import db

type_defs = load_schema_from_path("curator.graphql")
schema = make_executable_schema(
    type_defs, 
    [query]
)

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "postgresql+psycopg2://curator:supersecret@localhost:5432/curator"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

CORS(app)

with app.app_context():   
    Base.metadata.bind = db.engine
    Session = sessionmaker(bind=db.engine)

schema = make_executable_schema(type_defs, query)

# Route for GraphQL Playground (Optional)
@app.route("/")
def root():
    return "Curator", 200

# Route for GraphQL queries
@app.route("/graphql", methods=["GET", "POST"])
def graphql():
    # Handle GET requests with query in URL
    if request.method == "GET":
        query = request.args.get("query")
        if not query:
            return jsonify({"error": "Query parameter is required"}), 400
        data = {"query": query}

    # Handle POST requests with JSON body
    elif request.method == "POST":
        data = request.get_json()

    # Execute the query
    success, result = graphql_sync(schema, data, context_value=request, debug=True)
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
