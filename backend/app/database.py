from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from typing import AsyncGenerator
from uuid import uuid4
from app.config import settings


def _engine_options() -> dict:
    """Avoid multiplying client-side pools across independent consumers."""
    if settings.use_null_database_pool:
        return {
            "poolclass": NullPool,
            "connect_args": {
                # asyncpg's own statement cache. Transaction-pooled server
                # connections must not inherit cached client statements.
                "statement_cache_size": 0,
                # SQLAlchemy's asyncpg DBAPI prepared-statement cache.
                "prepared_statement_cache_size": 0,
                # SQLAlchemy's asyncpg dialect always prepares executions,
                # even with its cache disabled. Unique names prevent collisions
                # when a transaction pooler assigns a reused server connection.
                "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
            },
        }
    return {
        "pool_pre_ping": True,
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
        "pool_timeout": settings.DATABASE_POOL_TIMEOUT_SECONDS,
    }


# Transaction poolers own connection reuse. Direct/local connections retain a
# deliberately small, environment-configurable per-process SQLAlchemy pool.
async_engine = create_async_engine(
    settings.async_database_url,
    **_engine_options(),
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# Base class for SQLAlchemy 2.x declarative models
class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields async SQLAlchemy sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
