"""Bounded, data-only Writer contracts. No model-supplied paths or executable HTML."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from project_store import identifier

MAX_DOCUMENT_BYTES = 512 * 1024
MAX_WRITER_BYTES = 5 * 1024 * 1024
MAX_NODES = 200


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Block(Strict):
    id: str
    type: Literal[
        "paragraph", "heading1", "heading2", "bullet", "number", "pagebreak"
    ] = "paragraph"
    text: str = Field(default="", max_length=12000)

    rich: dict | None = None

    @field_validator("rich")
    @classmethod
    def valid_rich(cls, value):
        if value is None: return value
        from writer_rich import validate
        return validate(value)

    @field_validator("id")
    @classmethod
    def valid_id(cls, value):
        return identifier(value)


class WriterSettings(Strict):
    enabled: bool = True
    cloud_consent: bool = False
    auto_write: bool = True
    linguistic: bool = True
    style: str = Field(
        default="Melhorar clareza e gramática preservando a voz autoral.",
        max_length=2000,
    )
    cancel_seconds: int = Field(default=3, ge=0, le=10)
    retention: int = Field(default=200, ge=10, le=2000)
    width: Literal["comfortable", "wide"] = "comfortable"


class Operation(Strict):
    operation: Literal[
        "append",
        "replace",
        "create",
        "rename",
        "move",
        "move_blocks",
        "split",
        "delete",
    ]
    targetDocumentId: str | None = None
    destinationDocumentId: str | None = None
    parentId: str | None = None
    blockIds: list[str] = Field(default_factory=list, max_length=200)
    blocks: list[Block] = Field(default_factory=list, max_length=100)
    title: str = Field(default="", max_length=120)
    kind: Literal["folder", "document", "chapter", "section"] = "document"
    position: int = Field(default=0, ge=0, le=10000)


class EditorialBlock(Strict):
    # Output blocks are new data: identifiers are allocated locally, never by the model.
    id: str | None = Field(default=None, max_length=80)
    type: Literal[
        "paragraph", "heading1", "heading2", "bullet", "number", "pagebreak"
    ] = "paragraph"
    text: str = Field(
        max_length=12000,
        description="Texto do bloco, até 12000 caracteres. Divida textos longos em vários parágrafos/blocos.",
    )


class EditorialResult(Operation):
    blocks: list[EditorialBlock] = Field(default_factory=list, max_length=100)
    intent: Literal["WRITE", "INSTRUCT", "ORGANIZE", "CHAT"]
    confidence: float = Field(
        ge=0,
        le=1,
        description="Confiança numérica de 0 a 1, nunca porcentagem de 0 a 100.",
    )
    substantive: bool
    reason: str = Field(max_length=1000)
    reply: str = Field(max_length=6000)


class Command(Strict):
    project_id: str
    action: Literal[
        "open",
        "bind_chat",
        "get",
        "proposal",
        "revision",
        "create",
        "save",
        "settings",
        "history",
        "restore",
        "undo",
        "redo",
        "structure",
        "decide",
        "messages",
        "prune",
        "assist",
        "control",
    ]
    payload: dict = Field(default_factory=dict)


class Create(Strict):
    title: str = Field(min_length=1, max_length=120)
    kind: Literal["folder", "document", "chapter", "section"] = "document"
    parentId: str | None = None


class Save(Strict):
    id: str
    base_version: int = Field(ge=1)
    blocks: list[Block] = Field(max_length=10000)
    request_id: str


class Decision(Strict):
    id: str
    approve: bool
    automatic: bool = False
    edited_blocks: list[Block] | None = Field(default=None, max_length=100)


class Restore(Strict):
    id: str
    base_version: int = Field(ge=1)
    revision_id: int = Field(ge=1)


class Structure(Strict):
    id: str
    base_version: int = Field(ge=1)
    plan: Operation


class Selection(Strict):
    block_id: str
    start: int = Field(ge=0, le=12000)
    end: int = Field(ge=0, le=12000)
    text: str = Field(max_length=12000)

class Assist(Strict):
    chat_id: str | None = None
    request_id: str
    message: str = Field(min_length=1, max_length=6000)
    document_id: str | None = None
    base_version: int = Field(default=0, ge=0)
    selected_block_ids: list[str] = Field(default_factory=list, max_length=100)
    selected_text: str = Field(default="", max_length=2000)
    selection: Selection | None = None
    continuous: bool = False
    intent_override: Literal["WRITE", "INSTRUCT", "ORGANIZE", "CHAT"] | None = None


class Export(Strict):
    project_id: str
    document_ids: list[str] = Field(default_factory=list, max_length=200)
    format: Literal["docx", "md", "txt"] = "docx"
