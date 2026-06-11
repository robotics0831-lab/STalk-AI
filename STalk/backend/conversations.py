from datetime import datetime, timezone

from sqlalchemy.orm import Session

from database import Conversation, Message, User


def list_conversations(db: Session, user_id: str) -> list[Conversation]:
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )


def get_conversation(db: Session, user_id: str, conversation_id: str) -> Conversation | None:
    return (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
        .first()
    )


def create_conversation(db: Session, user_id: str, title: str = "New chat") -> Conversation:
    conv = Conversation(user_id=user_id, title=title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def delete_conversation(db: Session, user_id: str, conversation_id: str) -> bool:
    conv = get_conversation(db, user_id, conversation_id)
    if not conv:
        return False
    db.delete(conv)
    db.commit()
    return True


def add_message(db: Session, conversation_id: str, role: str, content: str) -> Message:
    msg = Message(conversation_id=conversation_id, role=role, content=content)
    conv = db.get(Conversation, conversation_id)
    if conv:
        conv.updated_at = datetime.now(timezone.utc)
        if role == "user" and conv.title == "New chat":
            conv.title = content[:40] + ("..." if len(content) > 40 else "")
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def conversation_to_dict(conv: Conversation, include_messages: bool = False) -> dict:
    data = {
        "id": conv.id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
    }
    if include_messages:
        data["messages"] = [
            {"role": m.role, "content": m.content}
            for m in conv.messages
        ]
    return data
