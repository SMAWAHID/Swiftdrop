"""
SwiftDrop :: Notifications Router
Inbox-style API exposing the notifications populated by the
Observer-pattern NotificationService.
"""
from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.security import get_current_user
from db.connection import get_pool
from models.user import User
from schemas.notification import NotificationResponse

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _row_to_response(row) -> NotificationResponse:
    payload = row["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return NotificationResponse(
        id=row["id"],
        user_id=row["user_id"],
        event_type=row["event_type"],
        payload=payload or {},
        is_read=row["is_read"],
        created_at=row["created_at"],
    )


@router.get(
    "/me",
    response_model=list[NotificationResponse],
    summary="List notifications for the authenticated user",
)
async def list_my_notifications(
    page:    int = Query(1, ge=1),
    limit:   int = Query(20, ge=1, le=100),
    unread:  bool | None = Query(None, description="Filter unread only"),
    current_user: User = Depends(get_current_user),
) -> list[NotificationResponse]:
    pool = await get_pool()
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM   notifications
            WHERE  user_id = $1
              AND  ($2::bool IS NULL OR is_read = NOT $2::bool)
            ORDER  BY created_at DESC
            LIMIT  $3 OFFSET $4
            """,
            current_user.id, unread, limit, offset,
        )
    return [_row_to_response(r) for r in rows]


@router.post(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark a single notification as read",
)
async def mark_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE notifications
            SET    is_read = TRUE
            WHERE  id = $1 AND user_id = $2
            RETURNING *
            """,
            notification_id, current_user.id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    return _row_to_response(row)


@router.post(
    "/read-all",
    summary="Mark all notifications as read for the authenticated user",
)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
            current_user.id,
        )
    # asyncpg returns a string like 'UPDATE 7'
    return {"status": "ok", "result": result}
