"""
SwiftDrop :: User Model (in-memory representation)
Not an ORM model — asyncpg returns asyncpg.Record objects.
This dataclass is the domain object passed between layers.
"""
from __future__ import annotations
from dataclasses import dataclass
from uuid import UUID
from datetime import datetime


@dataclass
class User:
    id: UUID
    email: str
    full_name: str
    phone: str
    role: str          # 'VENDOR' | 'DRIVER' | 'ADMIN'
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(cls, record: dict) -> "User":
        return cls(
            id=record["id"],
            email=record["email"],
            full_name=record["full_name"],
            phone=record["phone"],
            role=record["role"],
            is_active=record["is_active"],
            created_at=record["created_at"],
            updated_at=record["updated_at"],
        )
