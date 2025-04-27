from ariadne import QueryType
from model import User
from database import db

query = QueryType()

@query.field("ping")
def ping(_, info):
  with db.session() as session:
    count = session.query(User).count()
    return count