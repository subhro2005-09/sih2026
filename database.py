import os
import ssl
from urllib.parse import urlsplit, urlunsplit
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

RAW_URL = os.getenv("DATABASE_URL", "").strip()

def prepare_database_url(url: str) -> str:
    if not url:
        return ""

    # Force the pg8000 driver
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+pg8000://", 1)
    elif url.startswith("postgresql://"):
        prefix = url.split("://")[0]
        url = url.replace(prefix, "postgresql+pg8000", 1)

    # Strip ALL query parameters (sslmode, channel_binding, etc.)
    # pg8000 handles SSL via connect_args, not URL query params.
    parsed = urlsplit(url)
    clean_url = urlunsplit((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        "",  # query string discarded completely
        parsed.fragment
    ))
    return clean_url

DATABASE_URL = prepare_database_url(RAW_URL)

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
        # Standard SSL context for cloud PostgreSQL (Neon, Supabase, RDS)
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        try:
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
