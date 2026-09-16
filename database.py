import os
import ssl
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# 1. Format URL strictly for pg8000
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+pg8000://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    prefix = DATABASE_URL.split("://")[0]
    DATABASE_URL = DATABASE_URL.replace(prefix, "postgresql+pg8000", 1)

# 2. Strip any sslmode query parameter that causes pg8000 to crash
if "?" in DATABASE_URL:
    base_url, query_params = DATABASE_URL.split("?", 1)
    params = [p for p in query_params.split("&") if not p.startswith("sslmode=")]
    DATABASE_URL = base_url + ("?" + "&".join(params) if params else "")

Base = declarative_base()

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    years_of_experience = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

_engine = None
_SessionLocal = None

def get_engine():
    global _engine, _SessionLocal
    if _engine is None and DATABASE_URL:
        try:
            # Create a standard verified SSL context for cloud DBs (Supabase, Neon, AWS RDS)
            ssl_ctx = ssl.create_default_context()
            
            _engine = create_engine(
                DATABASE_URL,
                connect_args={"ssl_context": ssl_ctx},
                pool_pre_ping=True,
                pool_recycle=1800,
            )
            _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
        except Exception as e:
            print(f"Warning: Failed to initialize DB engine: {e}")
    return _engine

def init_db():
    eng = get_engine()
    if eng is not None:
        Base.metadata.create_all(bind=eng)

def get_db():
    get_engine()
    if _SessionLocal is None:
        raise RuntimeError("DATABASE_URL is missing or invalid in environment variables.")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
