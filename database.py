import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Convert URL to use the pure-Python pg8000 driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+pg8000://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+pg8000" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+pg8000://", 1)

# Remove psycopg prefixes if present
DATABASE_URL = DATABASE_URL.replace("+psycopg://", "+pg8000://")

# Ensure sslmode for cloud databases
if DATABASE_URL and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "?sslmode=require" if "?" not in DATABASE_URL else "&sslmode=require"

Base = declarative_base()

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    years_of_experience = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

engine = None
SessionLocal = None

def get_engine():
    global engine, SessionLocal
    if engine is None and DATABASE_URL:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=1800,
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine

def init_db():
    eng = get_engine()
    if eng is not None:
        Base.metadata.create_all(bind=eng)

def get_db():
    get_engine()
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL environment variable is missing or database engine failed to start.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
